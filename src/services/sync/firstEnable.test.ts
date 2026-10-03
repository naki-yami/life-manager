import { beforeEach, describe, expect, it } from 'vitest';
import { useDietStore } from '../../store/dietStore';
import { useSyncStore } from '../../store/syncStore';
import { useTaskStore } from '../../store/taskStore';
import { DEFAULT_DIET_GOALS } from '../../utils/diet';
import { runSync, type HttpRequest, type SyncHttp } from './engine';
import {
  SERVER_AUTHORITATIVE_SNAPSHOT_REASON,
  applyFirstEnableChoice,
  planFirstEnable,
  reconcile,
} from './firstEnable';

/*
 * 判据来自 client spec 的 Testing Decisions 第 5、8 条与工单 05 的验收。
 * 全部在注入的 HTTP 层打桩 —— 特别是「取消时零请求」这条，只能靠数请求来断言。
 */

const task = (id: string, title: string) => ({
  id,
  title,
  description: '',
  priority: 'medium' as const,
  status: 'pending' as const,
  dueDate: '2026-10-03',
  tags: [],
  subtasks: [],
  repeat: null,
  timebox: null,
  createdAt: '2026-10-03T00:00:00.000Z',
});

interface Stub {
  http: SyncHttp;
  requests: HttpRequest[];
}

/** 假服务端；记录每个请求（方法 + 路径），便于断言「发了什么 / 有没有写」 */
function stubServer(routes: {
  health?: () => unknown;
  push?: (body: unknown) => unknown;
  changes?: (url: string) => unknown;
  snapshot?: () => unknown;
}): Stub {
  const requests: HttpRequest[] = [];
  const defaultPush = (body: unknown): unknown => {
    const changes = (body as { changes: Array<{ module: string; key: string }> }).changes ?? [];
    return {
      seq: 1,
      conflicts: 0,
      results: changes.map((change, index) => ({
        module: change.module,
        key: change.key,
        outcome: 'applied' as const,
        rev: index + 1,
      })),
    };
  };

  const http: SyncHttp = {
    request: async (options) => {
      requests.push(options);
      const path = new URL(options.url).pathname;
      if (path === '/v1/health') return (routes.health ?? (() => ({ ok: true, seq: 0 })))();
      if (path === '/v1/push') return (routes.push ?? defaultPush)(options.body);
      if (path === '/v1/changes') {
        return (routes.changes ?? (() => emptyPage(0, 0)))(options.url);
      }
      if (path === '/v1/snapshot') {
        if (!routes.snapshot) throw new Error('没有 snapshot 桩');
        return routes.snapshot();
      }
      throw new Error(`未打桩的路径：${path}`);
    },
  };
  return { http, requests };
}

const emptyPage = (seq: number, since: number) => ({
  changes: [],
  more: false,
  nextSince: since,
  seq,
  needFullResync: false,
  purgedThroughSeq: 0,
});

/** 只数「写请求」：POST 才是写；GET 一律是读（含 /v1/snapshot） */
function writeRequests(requests: readonly HttpRequest[]): HttpRequest[] {
  return requests.filter((request) => request.method === 'POST');
}

function configure(overrides: { lastSeq?: number } = {}): void {
  useSyncStore.setState({
    enabled: false,
    baseUrl: 'http://127.0.0.1:8787',
    token: 's3cret-token',
    deviceId: 'dev-1',
    lastSeq: overrides.lastSeq ?? 0,
    baseline: {},
    revs: {},
    conflicts: [],
    needsReconcile: false,
  });
}

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({ tasks: [], memos: [] });
  useDietStore.setState({
    records: [],
    templates: [],
    goals: { ...DEFAULT_DIET_GOALS },
    water: {},
  });
  configure();
});

describe('首次开启：seq === 0 → 全量推，不弹确认', () => {
  it('服务端空时返回 push-all', async () => {
    const stub = stubServer({ health: () => ({ ok: true, seq: 0, modules: [] }) });

    const plan = await planFirstEnable(stub.http);

    expect(plan.kind).toBe('push-all');
  });

  it('push-all 之后 execute 是全量推：本机每条都进载荷', async () => {
    configure();
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    const pushed: Array<{ module: string; key: string }> = [];
    const stub = stubServer({
      health: () => ({ ok: true, seq: 0, modules: [] }),
      push: (body) => {
        const changes = (body as { changes: Array<{ module: string; key: string }> }).changes;
        pushed.push(...changes);
        return {
          seq: 1,
          conflicts: 0,
          results: changes.map((change, index) => ({
            module: change.module,
            key: change.key,
            outcome: 'applied' as const,
            rev: index + 1,
          })),
        };
      },
    });

    const outcome = await applyFirstEnableChoice('local-wins', stub.http);

    expect(outcome.ok).toBe(true);
    expect(pushed.map((change) => change.key)).toContain('t1');
    expect(useSyncStore.getState().enabled).toBe(true);
  });
});

describe('首次开启：seq > 0 → 必须让用户选', () => {
  it('服务端有数据时返回 needs-choice，并带上 seq', async () => {
    const stub = stubServer({
      health: () => ({ ok: true, seq: 42, modules: ['tasks', 'dietGoals'] }),
    });

    const plan = await planFirstEnable(stub.http);

    expect(plan).toMatchObject({ kind: 'needs-choice', seq: 42 });
    // 探测阶段**一个写请求都没有**
    expect(writeRequests(stub.requests)).toEqual([]);
  });

  it('探测只发 health，且 health 不带令牌', async () => {
    const stub = stubServer({ health: () => ({ ok: true, seq: 5, modules: [] }) });

    await planFirstEnable(stub.http);

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]!.url).toContain('/v1/health');
    expect(stub.requests[0]!.token).toBe('');
  });
});

describe('取消：零写请求', () => {
  it('选取消之后一个写请求都没发过', async () => {
    const stub = stubServer({ health: () => ({ ok: true, seq: 42, modules: [] }) });
    configure();

    // 完整走一遍：先探测，再取消
    await planFirstEnable(stub.http);
    const outcome = await applyFirstEnableChoice('cancel', stub.http);

    expect(writeRequests(stub.requests)).toEqual([]);
    // 取消不视为错误，只是没开
    expect(useSyncStore.getState().enabled).toBe(false);
    expect(outcome.ok).toBe(false);
  });

  it('取消之后本机数据一字未改', async () => {
    const stub = stubServer({ health: () => ({ ok: true, seq: 42, modules: [] }) });
    configure();
    const before = useTaskStore.getState().tasks;

    await planFirstEnable(stub.http);
    await applyFirstEnableChoice('cancel', stub.http);

    expect(useTaskStore.getState().tasks).toBe(before);
    expect(useSyncStore.getState().lastSeq).toBe(0);
    expect(useSyncStore.getState().baseline).toEqual({});
  });

  it('取消会连开关都关掉（即使用户先前开过）', async () => {
    const stub = stubServer({ health: () => ({ ok: true, seq: 42, modules: [] }) });
    useSyncStore.setState({ enabled: true });

    await applyFirstEnableChoice('cancel', stub.http);

    expect(useSyncStore.getState().enabled).toBe(false);
  });
});

describe('以服务端为准：先留快照，再覆盖', () => {
  it('快照确实先落了一份，且用的是固定的 reason', async () => {
    const order: string[] = [];
    const stub = stubServer({
      health: () => ({ ok: true, seq: 42, modules: [] }),
      snapshot: () => {
        order.push('snapshot');
        return {
          data: { tasks: [task('t9', '服务端那份')] },
          sync: { seq: 42, rev: { 'tasks:t9': 3 } },
        };
      },
    });

    const outcome = await applyFirstEnableChoice('server-wins', stub.http, {
      createSnapshot: async (reason) => {
        order.push(`snapshot-local:${reason}`);
        return 'lm:backup:auto:1';
      },
    });

    expect(outcome.ok).toBe(true);
    // 顺序：本机快照**先**，拉服务端快照**后**
    expect(order).toEqual([`snapshot-local:${SERVER_AUTHORITATIVE_SNAPSHOT_REASON}`, 'snapshot']);
  });

  it('覆盖之后本机 data 变成服务端那份，游标与 rev 表都接受服务端的', async () => {
    const stub = stubServer({
      health: () => ({ ok: true, seq: 42, modules: [] }),
      snapshot: () => ({
        data: {
          tasks: [task('t9', '服务端那份')],
          dietWater: { '2026-10-02': 8 },
          dietGoals: { calories: 2100, protein: 120 },
        },
        sync: { seq: 42, rev: { 'tasks:t9': 3, 'dietWater:2026-10-02': 1 } },
      }),
    });

    const outcome = await applyFirstEnableChoice('server-wins', stub.http, {
      createSnapshot: async () => 'lm:backup:auto:1',
    });

    expect(outcome.ok).toBe(true);
    expect(useTaskStore.getState().tasks.map((item) => item.id)).toEqual(['t9']);
    expect(useDietStore.getState().water).toEqual({ '2026-10-02': 8 });
    expect(useDietStore.getState().goals).toEqual({ calories: 2100, protein: 120 });
    expect(useSyncStore.getState().lastSeq).toBe(42);
    expect(useSyncStore.getState().revs['tasks:t9']).toBe(3);
    expect(useSyncStore.getState().enabled).toBe(true);
  });

  it('快照写不进去（返回 null）→ 一律中止覆盖，本机数据不动', async () => {
    const stub = stubServer({
      health: () => ({ ok: true, seq: 42, modules: [] }),
      snapshot: () => {
        throw new Error('不该走到这里 —— 快照失败就必须中止');
      },
    });
    useTaskStore.setState({ tasks: [task('t1', '本机这条必须保住')] as never, memos: [] });

    const outcome = await applyFirstEnableChoice('server-wins', stub.http, {
      createSnapshot: async () => null,
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain('快照');
    // 本机数据保住、开关关掉、一个 snapshot 请求都没发
    expect(useTaskStore.getState().tasks.map((item) => item.id)).toEqual(['t1']);
    expect(useSyncStore.getState().enabled).toBe(false);
    expect(stub.requests.some((request) => request.url.includes('/v1/snapshot'))).toBe(false);
  });
});

describe('以本机为准：全量推（覆盖语义）', () => {
  it('哪怕本机是默认值也照推（用户明确选了覆盖）', async () => {
    const stub = stubServer({
      health: () => ({ ok: true, seq: 42, modules: [] }),
      push: (body) => {
        const changes = (body as { changes: Array<{ module: string; key: string }> }).changes;
        return {
          seq: 43,
          conflicts: 0,
          results: changes.map((change, index) => ({
            module: change.module,
            key: change.key,
            outcome: 'applied' as const,
            rev: index + 1,
          })),
        };
      },
    });

    const outcome = await applyFirstEnableChoice('local-wins', stub.http);

    expect(outcome.ok).toBe(true);
    // dietGoals 仍是默认值，但覆盖语义下要推
    expect(outcome.pushed).toBeGreaterThan(0);
  });
});

describe('作废后重新对账', () => {
  it('导入之后 needsReconcile 置位，且没有自动推送', async () => {
    const stub = stubServer({ health: () => ({ ok: true, seq: 5, modules: [] }) });
    useSyncStore.setState({ enabled: true });

    // 「导入」这条路径由备份模块调 markNeedsReconcile（工单 01 的 action）
    useSyncStore.getState().markNeedsReconcile();

    expect(useSyncStore.getState().needsReconcile).toBe(true);
    // 只置了一个标记：没有任何请求被发出去
    expect(stub.requests).toEqual([]);
  });

  it('reconcile 之后标记复位', async () => {
    const stub = stubServer({
      health: () => ({ ok: true, seq: 5, modules: [] }),
      snapshot: () => ({ data: { tasks: [] }, sync: { seq: 5, rev: {} } }),
    });
    useSyncStore.setState({ enabled: true, needsReconcile: true });

    await reconcile(stub.http);

    expect(useSyncStore.getState().needsReconcile).toBe(false);
  });

  /**
   * 工单 05 点名要的那条用例。
   *
   * 场景：本机 `dietGoals` 还是默认值（用户从没设过），服务端已有一份真目标。
   * 若直接全量推，本机那个默认值会盖上去并被判 conflict —— 用户什么都没改却看到冲突提示。
   */
  it('基线清空 + 服务端已有非默认目标 → 重新对账不产生冲突', async () => {
    const conflictsSeen: number[] = [];
    const pushedChanges: Array<{ module: string; key: string }> = [];

    const stub = stubServer({
      health: () => ({ ok: true, seq: 9, modules: [] }),
      // 服务端那份是用户真设过的目标
      snapshot: () => ({
        data: {
          tasks: [task('t9', '服务端那份')],
          dietGoals: { calories: 2600, protein: 150 },
        },
        sync: { seq: 9, rev: { 'tasks:t9': 4, 'dietGoals:dietGoals': 2 } },
      }),
      push: (body) => {
        const changes = (body as { changes: Array<{ module: string; key: string }> }).changes;
        pushedChanges.push(...changes);
        conflictsSeen.push(0);
        return {
          seq: 10,
          conflicts: 0,
          results: changes.map((change, index) => ({
            module: change.module,
            key: change.key,
            outcome: 'applied' as const,
            rev: index + 5,
          })),
        };
      },
      changes: () => emptyPage(10, 9),
    });

    // 基线作废（导入 / 回滚 / 清除数据之后的样子）
    useSyncStore.setState({
      enabled: true,
      lastSeq: 9,
      baseline: {},
      revs: {},
      needsReconcile: true,
    });

    const outcome = await reconcile(stub.http);

    expect(outcome.ok).toBe(true);
    // 关键断言：**没有**推 dietGoals —— 本机那份默认值不该盖掉服务端的真目标
    expect(pushedChanges.map((change) => change.module)).not.toContain('dietGoals');
    // 也不该出现冲突
    expect(outcome.conflicts).toBe(0);
    expect(useSyncStore.getState().conflicts).toEqual([]);
    // 本机目标已被对齐成服务端那份
    expect(useDietStore.getState().goals).toEqual({ calories: 2600, protein: 150 });
  });

  it('本机真的改过的条目仍会被推上去（对齐不是「什么都不推」）', async () => {
    const pushedChanges: Array<{ module: string; key: string; op: string }> = [];

    const stub = stubServer({
      health: () => ({ ok: true, seq: 9, modules: [] }),
      snapshot: () => ({
        data: { tasks: [task('t9', '服务端版')] },
        sync: { seq: 9, rev: { 'tasks:t9': 4 } },
      }),
      push: (body) => {
        const changes = (body as { changes: Array<{ module: string; key: string; op: string }> })
          .changes;
        pushedChanges.push(...changes);
        return {
          seq: 10,
          conflicts: 0,
          results: changes.map((change, index) => ({
            module: change.module,
            key: change.key,
            outcome: 'applied' as const,
            rev: index + 5,
          })),
        };
      },
      changes: () => emptyPage(10, 9),
    });

    // 本机有一条服务端没有的记录（用户导入进来的新数据）
    useTaskStore.setState({ tasks: [task('local-1', '本机独有')] as never, memos: [] });
    useSyncStore.setState({
      enabled: true,
      lastSeq: 9,
      baseline: {},
      revs: {},
      needsReconcile: true,
    });

    const outcome = await reconcile(stub.http);

    expect(outcome.ok).toBe(true);
    // 本机独有的那条要推上去
    expect(pushedChanges.map((change) => change.key)).toContain('local-1');
  });

  it('reconcile 不自动推全量：不会把服务端已有的每条都当新增推回去', async () => {
    const pushedChanges: Array<{ module: string; key: string }> = [];

    const stub = stubServer({
      health: () => ({ ok: true, seq: 9, modules: [] }),
      snapshot: () => ({
        data: {
          tasks: [task('t1', 'A'), task('t2', 'B'), task('t3', 'C')],
          // 服务端**有** dietGoals：所以它不该被推（本机那份会被对齐覆盖掉）
          dietGoals: { calories: 2600, protein: 150 },
        },
        sync: {
          seq: 9,
          rev: { 'tasks:t1': 1, 'tasks:t2': 2, 'tasks:t3': 3, 'dietGoals:dietGoals': 1 },
        },
      }),
      push: (body) => {
        const changes = (body as { changes: Array<{ module: string; key: string }> }).changes;
        pushedChanges.push(...changes);
        return {
          seq: 10,
          conflicts: 0,
          results: changes.map((change, index) => ({
            module: change.module,
            key: change.key,
            outcome: 'applied' as const,
            rev: index + 5,
          })),
        };
      },
      changes: () => emptyPage(10, 9),
    });

    // 本机是空的，服务端有三条 —— 对齐之后本机也有三条，于是没有东西要推
    useSyncStore.setState({
      enabled: true,
      lastSeq: 9,
      baseline: {},
      revs: {},
      needsReconcile: true,
    });

    await reconcile(stub.http);

    // 服务端已有的三条一条都不该被推回去（对齐已经把本机变成服务端那份）
    expect(pushedChanges).toEqual([]);
    expect(
      useTaskStore
        .getState()
        .tasks.map((item) => item.id)
        .sort(),
    ).toEqual(['t1', 't2', 't3']);
  });

  /**
   * 反过来的情形：服务端**没有** `dietGoals`（副本里那个模块是空的）。
   * 这时本机的默认值是服务端唯一能拿到的值，推上去是对的 —— 不是「莫名其妙的冲突」。
   *
   * 这条与上面那条成对，划清「该跳过」与「该推」的界线：
   * 跳过的条件是**服务端已有真实值**，而不是「本机是默认值」。
   */
  it('服务端没有 dietGoals 时，本机那份照推（服务端确实需要它）', async () => {
    const pushedChanges: Array<{ module: string }> = [];

    const stub = stubServer({
      health: () => ({ ok: true, seq: 9, modules: [] }),
      snapshot: () => ({
        data: { tasks: [] },
        sync: { seq: 9, rev: {} },
      }),
      push: (body) => {
        const changes = (body as { changes: Array<{ module: string }> }).changes;
        pushedChanges.push(...changes);
        return {
          seq: 10,
          conflicts: 0,
          results: changes.map((change, index) => ({
            module: change.module,
            key: 'k',
            outcome: 'applied' as const,
            rev: index + 5,
          })),
        };
      },
      changes: () => emptyPage(10, 9),
    });

    useSyncStore.setState({
      enabled: true,
      lastSeq: 9,
      baseline: {},
      revs: {},
      needsReconcile: true,
    });

    await reconcile(stub.http);

    expect(pushedChanges.map((change) => change.module)).toContain('dietGoals');
  });

  it('连不上时返回失败，不清掉 needsReconcile 标记', async () => {
    const stub = stubServer({
      health: () => {
        throw new TypeError('Failed to fetch');
      },
    });
    useSyncStore.setState({ enabled: true, needsReconcile: true });

    const outcome = await reconcile(stub.http);

    expect(outcome.ok).toBe(false);
    expect(useSyncStore.getState().needsReconcile).toBe(true);
  });
});

describe('重新对账后的下一轮不会把刚拉下来的再推回去', () => {
  it('reconcile 成功之后立刻 runSync：一条都不推', async () => {
    const pushCounts: number[] = [];

    const stub = stubServer({
      health: () => ({ ok: true, seq: 9, modules: [] }),
      snapshot: () => ({
        data: { tasks: [task('t1', '服务端那份')] },
        sync: { seq: 9, rev: { 'tasks:t1': 1 } },
      }),
      push: (body) => {
        const changes = (body as { changes: unknown[] }).changes;
        pushCounts.push(changes.length);
        return {
          seq: 10,
          conflicts: 0,
          results: changes.map((change, index) => ({
            module: 'tasks',
            key: (change as { key: string }).key,
            outcome: 'applied' as const,
            rev: index + 5,
          })),
        };
      },
      changes: () => emptyPage(10, 9),
    });

    useSyncStore.setState({
      enabled: true,
      lastSeq: 9,
      baseline: {},
      revs: {},
      needsReconcile: true,
    });

    await reconcile(stub.http);
    // 对齐之后基线已按本机重算 —— 再跑一轮不该推任何东西
    const next = await runSync(stub.http);

    expect(next.ok).toBe(true);
    expect(next.pushed).toBe(0);
  });
});

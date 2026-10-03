import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDietStore } from '../../store/dietStore';
import { useSyncStore } from '../../store/syncStore';
import { useTaskStore } from '../../store/taskStore';
import { DEFAULT_DIET_GOALS } from '../../utils/diet';
import { computeBaseline } from './baseline';
import { runSync, type HttpRequest, type SyncHttp } from './engine';

/*
 * 引擎的判据来自 client spec 的 Testing Decisions 第 3、6、7 条。
 *
 * 全部在**注入的 HTTP 层**打桩，不依赖真服务端在跑 —— 与 spec「网络层可注入」一致。
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

/** 记录桩收到的每个请求，便于断言「发了什么」 */
interface Stub {
  http: SyncHttp;
  requests: HttpRequest[];
}

/**
 * 造一个假服务端。
 *
 * `routes` 按 URL 里的路径分派；返回一个值即 200，抛异常即「这一步失败」。
 *
 * **`push` 有默认桩**：`dietGoals` 是模块单值，store 里恒有默认值，
 * 所以哪怕本机「什么都没干」，空基线下它也必然算出一条改动 ——
 * 于是几乎每一轮同步都会真的发 push。不想要这个默认行为就显式传 `push`。
 */
function stubServer(routes: {
  health?: () => unknown;
  push?: (body: unknown) => unknown;
  changes?: (url: string) => unknown;
  snapshot?: () => unknown;
}): Stub {
  const requests: HttpRequest[] = [];
  /** 默认 push 桩：把推来的每条都当 applied，并给一个单调的 rev */
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
      if (path === '/v1/health') {
        if (!routes.health) throw new Error('没有 health 桩');
        return routes.health();
      }
      if (path === '/v1/push') {
        return (routes.push ?? defaultPush)(options.body);
      }
      if (path === '/v1/changes') {
        if (!routes.changes) throw new Error('没有 changes 桩');
        return routes.changes(options.url);
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

/** 一页「没有变更」的增量响应 */
const emptyPage = (seq: number, since: number) => ({
  changes: [],
  more: false,
  nextSince: since,
  seq,
  needFullResync: false,
  purgedThroughSeq: 0,
});

/** 打开同步并把地址、令牌、设备标识都填好 */
function enableSync(overrides: Partial<{ lastSeq: number; deviceId: string }> = {}): void {
  useSyncStore.setState({
    enabled: true,
    baseUrl: 'http://127.0.0.1:8787',
    token: 's3cret-token',
    deviceId: overrides.deviceId ?? 'dev-1',
    lastSeq: overrides.lastSeq ?? 0,
    baseline: {},
    revs: {},
    conflicts: [],
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
  useTaskStore.setState({ tasks: [], memos: [] });
  useDietStore.setState({
    records: [],
    templates: [],
    goals: { ...DEFAULT_DIET_GOALS },
    water: {},
  });
  useSyncStore.setState({
    enabled: false,
    baseUrl: '',
    token: '',
    deviceId: '',
    lastSeq: 0,
    baseline: {},
    revs: {},
    conflicts: [],
    needsReconcile: false,
  });
});

describe('开关关着时零网络请求', () => {
  it('不发任何请求', async () => {
    const stub = stubServer({});

    const outcome = await runSync(stub.http);

    expect(outcome.ok).toBe(false);
    expect(stub.requests).toEqual([]);
  });

  it('开了但没填地址或令牌时也不发请求', async () => {
    const stub = stubServer({});
    useSyncStore.setState({ enabled: true, baseUrl: '', token: '' });

    const outcome = await runSync(stub.http);

    expect(outcome.ok).toBe(false);
    expect(stub.requests).toEqual([]);
  });
});

describe('一轮成功：先推后拉', () => {
  it('顺序是先 /v1/health → /v1/push → /v1/changes', async () => {
    enableSync();
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    const stub = stubServer({
      health: () => ({ ok: true, seq: 0, schemaVersion: 20, modules: [] }),
      push: () => ({
        seq: 1,
        conflicts: 0,
        results: [{ module: 'tasks', key: 't1', outcome: 'applied', rev: 1 }],
      }),
      changes: () => emptyPage(1, 0),
    });

    const outcome = await runSync(stub.http);

    expect(outcome.ok).toBe(true);
    expect(stub.requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/v1/health',
      '/v1/push',
      '/v1/changes',
    ]);
  });

  it('推送载荷带 module / key / op / baseRev / record', async () => {
    enableSync();
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    let pushed: { changes: unknown[] } | null = null;
    const stub = stubServer({
      health: () => ({ ok: true, seq: 0, schemaVersion: 20, modules: [] }),
      push: (body) => {
        pushed = body as { changes: unknown[] };
        return {
          seq: 1,
          conflicts: 0,
          results: [{ module: 'tasks', key: 't1', outcome: 'applied', rev: 1 }],
        };
      },
      changes: () => emptyPage(1, 0),
    });

    await runSync(stub.http);

    expect(pushed!.changes).toContainEqual({
      module: 'tasks',
      key: 't1',
      baseRev: 0,
      op: 'put',
      record: task('t1', '写周报'),
    });
  });

  it('成功后 lastSeq 前进、基线更新', async () => {
    enableSync();
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    const stub = stubServer({
      health: () => ({ ok: true, seq: 3, schemaVersion: 20, modules: [] }),
      push: () => ({
        seq: 3,
        conflicts: 0,
        results: [{ module: 'tasks', key: 't1', outcome: 'applied', rev: 1 }],
      }),
      changes: () => emptyPage(3, 0),
    });

    const outcome = await runSync(stub.http);

    expect(outcome.ok).toBe(true);
    expect(useSyncStore.getState().lastSeq).toBe(3);
    // 基线记下了 t1（下一轮没改就不会再推）
    expect(useSyncStore.getState().baseline.tasks).toHaveProperty('t1');
    expect(outcome.lastSeq).toBe(3);
  });

  it('推完紧接着跑第二轮：本机没再改就一条都不推', async () => {
    enableSync();
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    const pushBodies: unknown[] = [];
    const stub = stubServer({
      health: () => ({ ok: true, seq: 1, schemaVersion: 20, modules: [] }),
      push: (body) => {
        pushBodies.push(body);
        return {
          seq: 1,
          conflicts: 0,
          results: [{ module: 'tasks', key: 't1', outcome: 'applied', rev: 1 }],
        };
      },
      changes: () => emptyPage(1, 0),
    });

    await runSync(stub.http);
    await runSync(stub.http);

    // 第二轮没有改动 → 不发 push（空 push 白跑一趟）
    expect(pushBodies).toHaveLength(1);
  });
});

describe('拉取与落库', () => {
  it('拉到 put 与 delete 都落库', async () => {
    enableSync();
    useTaskStore.setState({
      tasks: [task('t1', '写周报'), task('t2', '看论文')] as never,
      memos: [],
    });

    const stub = stubServer({
      health: () => ({ ok: true, seq: 2, schemaVersion: 20, modules: [] }),
      changes: () => ({
        changes: [
          {
            seq: 1,
            module: 'tasks',
            key: 't2',
            rev: 2,
            op: 'delete',
          },
          {
            seq: 2,
            module: 'tasks',
            key: 't3',
            rev: 1,
            op: 'put',
            record: task('t3', '远端新增'),
          },
        ],
        more: false,
        nextSince: 2,
        seq: 2,
        needFullResync: false,
        purgedThroughSeq: 0,
      }),
    });

    const outcome = await runSync(stub.http);

    expect(outcome.ok).toBe(true);
    expect(outcome.pulled).toBe(2);
    const titles = useTaskStore.getState().tasks.map((item) => item.title);
    expect(titles).toEqual(['写周报', '远端新增']);
  });

  it('分页拉完：按 nextSince 翻页，不自己算 since + limit', async () => {
    enableSync();

    const sinceValues: string[] = [];
    const stub = stubServer({
      health: () => ({ ok: true, seq: 3, schemaVersion: 20, modules: [] }),
      changes: (url) => {
        const since = new URL(url).searchParams.get('since')!;
        sinceValues.push(since);
        // 第一页只给一条但要 more: true；nextSince 是 5（不是 since + limit）
        if (since === '0') {
          return {
            changes: [
              { seq: 5, module: 'tasks', key: 't1', rev: 1, op: 'put', record: task('t1', 'A') },
            ],
            more: true,
            nextSince: 5,
            seq: 9,
            needFullResync: false,
            purgedThroughSeq: 0,
          };
        }
        return {
          changes: [
            { seq: 9, module: 'tasks', key: 't2', rev: 1, op: 'put', record: task('t2', 'B') },
          ],
          more: false,
          nextSince: 9,
          seq: 9,
          needFullResync: false,
          purgedThroughSeq: 0,
        };
      },
    });

    const outcome = await runSync(stub.http);

    // 第二页的 since 必须是服务端给的 nextSince（5），不是自己算的
    expect(sinceValues).toEqual(['0', '5']);
    expect(outcome.ok).toBe(true);
    expect(useSyncStore.getState().lastSeq).toBe(9);
  });

  it('拉取带上 deviceId（服务端靠它判休眠，不带那道守卫静默失效）', async () => {
    enableSync({ deviceId: 'dev-abc' });

    let queried: URLSearchParams | null = null;
    const stub = stubServer({
      health: () => ({ ok: true, seq: 0, schemaVersion: 20, modules: [] }),
      changes: (url) => {
        queried = new URL(url).searchParams;
        return emptyPage(0, 0);
      },
    });

    await runSync(stub.http);

    expect(queried!.get('deviceId')).toBe('dev-abc');
  });

  it('落库的 rev 记进 lm:sync.revs', async () => {
    enableSync();

    const stub = stubServer({
      health: () => ({ ok: true, seq: 1, schemaVersion: 20, modules: [] }),
      changes: () => ({
        changes: [
          { seq: 1, module: 'tasks', key: 't1', rev: 7, op: 'put', record: task('t1', 'A') },
        ],
        more: false,
        nextSince: 1,
        seq: 1,
        needFullResync: false,
        purgedThroughSeq: 0,
      }),
    });

    await runSync(stub.http);

    // t1 的 rev 来自拉取（7）；dietGoals 也会有一条，因为模块单值恒有默认值、
    // 空基线下必然推一次，push 结果里带的 rev 也一并收下（不是噪声，是它真实的状态）
    expect(useSyncStore.getState().revs['tasks:t1']).toBe(7);
    expect(Object.keys(useSyncStore.getState().revs)).toContain('dietGoals:dietGoals');
  });
});

describe('失败语义：任何一步失败都不推进游标', () => {
  it('fetch 直接 reject → 状态显示失败、store 一字未改、lastSeq 不动', async () => {
    enableSync({ lastSeq: 5 });
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });
    const before = useTaskStore.getState().tasks;

    const stub = stubServer({
      health: () => {
        throw new TypeError('Failed to fetch');
      },
    });

    const outcome = await runSync(stub.http);

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain('Failed to fetch');
    // 返回的结果里游标也必须是原值 —— 设置卡显示的是它，不只是 store 里的
    expect(outcome.lastSeq).toBe(5);
    expect(useSyncStore.getState().lastSeq).toBe(5);
    expect(useSyncStore.getState().baseline).toEqual({});
    // store 一字未改（同一个数组引用）
    expect(useTaskStore.getState().tasks).toBe(before);
  });

  it('拉取中途抛错 → lastSeq 没前进、基线没更新', async () => {
    enableSync();
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    const stub = stubServer({
      health: () => ({ ok: true, seq: 2, schemaVersion: 20, modules: [] }),
      push: () => ({
        seq: 2,
        conflicts: 0,
        results: [{ module: 'tasks', key: 't1', outcome: 'applied', rev: 1 }],
      }),
      changes: () => {
        throw new Error('拉到一半断了');
      },
    });

    const outcome = await runSync(stub.http);

    expect(outcome.ok).toBe(false);
    expect(outcome.lastSeq).toBe(0);
    expect(useSyncStore.getState().lastSeq).toBe(0);
    expect(useSyncStore.getState().baseline).toEqual({});
  });

  it('失败后立刻重跑不会产生重复条目（幂等）', async () => {
    enableSync();
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    let failNext = true;
    const stub = stubServer({
      health: () => ({ ok: true, seq: 1, schemaVersion: 20, modules: [] }),
      push: () => ({
        seq: 1,
        conflicts: 0,
        results: [{ module: 'tasks', key: 't1', outcome: 'applied', rev: 1 }],
      }),
      changes: () => {
        if (failNext) {
          failNext = false;
          throw new Error('第一次断线');
        }
        return {
          changes: [
            { seq: 1, module: 'tasks', key: 't1', rev: 1, op: 'put', record: task('t1', '写周报') },
          ],
          more: false,
          nextSince: 1,
          seq: 1,
          needFullResync: false,
          purgedThroughSeq: 0,
        };
      },
    });

    const first = await runSync(stub.http);
    expect(first.ok).toBe(false);

    const second = await runSync(stub.http);

    expect(second.ok).toBe(true);
    // 重跑之后仍然只有一条，没有重复
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().tasks[0]!.id).toBe('t1');
  });

  it('服务端拒绝条目 → 这一轮算失败，不推进游标', async () => {
    enableSync();
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    const stub = stubServer({
      health: () => ({ ok: true, seq: 1, schemaVersion: 20, modules: [] }),
      push: () => ({
        seq: 1,
        conflicts: 0,
        results: [
          { module: 'tasks', key: 't1', outcome: 'rejected', rev: 0, error: '模块名不在册' },
        ],
      }),
    });

    const outcome = await runSync(stub.http);

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toContain('拒绝');
    expect(outcome.lastSeq).toBe(0);
    expect(useSyncStore.getState().lastSeq).toBe(0);
  });
});

describe('冲突留痕', () => {
  it('服务端返回 conflict → lm:sync.conflicts 里有一条', async () => {
    enableSync();
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    const stub = stubServer({
      health: () => ({ ok: true, seq: 1, schemaVersion: 20, modules: [] }),
      push: () => ({
        seq: 1,
        conflicts: 1,
        results: [{ module: 'tasks', key: 't1', outcome: 'conflict', rev: 2 }],
      }),
      changes: () => emptyPage(1, 0),
    });

    const outcome = await runSync(stub.http);

    expect(outcome.ok).toBe(true);
    expect(outcome.conflicts).toBe(1);
    const conflicts = useSyncStore.getState().conflicts;
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ module: 'tasks', key: 't1', title: '写周报' });
  });

  it('没有冲突时把上一轮的冲突清掉（只留最近一次）', async () => {
    enableSync();
    useSyncStore.setState({
      conflicts: [{ module: 'tasks', key: 'old', title: '旧的', serverUpdatedAt: '' }],
    });

    const stub = stubServer({
      health: () => ({ ok: true, seq: 0, schemaVersion: 20, modules: [] }),
      changes: () => emptyPage(0, 0),
    });

    await runSync(stub.http);

    expect(useSyncStore.getState().conflicts).toEqual([]);
  });
});

describe('noop 也要更新 rev', () => {
  it('服务端说 noop → 仍记下它给的 rev（否则下一轮误判落后、每次误报冲突）', async () => {
    enableSync();
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    const stub = stubServer({
      health: () => ({ ok: true, seq: 5, schemaVersion: 20, modules: [] }),
      push: () => ({
        seq: 5,
        conflicts: 0,
        // 内容与现存记录完全一致 → 服务端不产生新 rev，返回当前那一版
        results: [{ module: 'tasks', key: 't1', outcome: 'noop', rev: 4 }],
      }),
      changes: () => emptyPage(5, 0),
    });

    await runSync(stub.http);

    // 关键：noop 的 rev 也是权威的，要记下来
    expect(useSyncStore.getState().revs).toEqual({ 'tasks:t1': 4 });

    // 接下来若本机改了这一条，带上的 baseRev 就是 4
    useTaskStore.setState({ tasks: [task('t1', '写周报（改）')] as never, memos: [] });
    let pushedBaseRev: number | null = null;
    const next = stubServer({
      health: () => ({ ok: true, seq: 5, schemaVersion: 20, modules: [] }),
      push: (body) => {
        const changes = (body as { changes: Array<{ baseRev: number }> }).changes;
        pushedBaseRev = changes[0]!.baseRev;
        return {
          seq: 6,
          conflicts: 0,
          results: [{ module: 'tasks', key: 't1', outcome: 'applied', rev: 5 }],
        };
      },
      changes: () => emptyPage(6, 5),
    });

    await runSync(next.http);

    expect(pushedBaseRev).toBe(4);
  });
});

describe('needFullResync：走 /v1/snapshot 全量对账', () => {
  it('不是错误：拉快照落库并接受它给的 seq', async () => {
    enableSync({ lastSeq: 1 });
    useTaskStore.setState({ tasks: [task('t1', '本地这条会被快照覆盖')] as never, memos: [] });

    const stub = stubServer({
      health: () => ({ ok: true, seq: 10, schemaVersion: 20, modules: [] }),
      changes: () => ({
        changes: [],
        more: false,
        nextSince: 1,
        seq: 10,
        needFullResync: true,
        purgedThroughSeq: 4,
      }),
      snapshot: () => ({
        app: 'life-manager',
        schemaVersion: 20,
        exportedAt: '2026-10-03T00:00:00.000Z',
        data: {
          tasks: [task('t9', '服务端那份')],
          dietWater: { '2026-10-02': 8 },
          dietGoals: { calories: 2100, protein: 120 },
        },
        sync: { seq: 10, rev: { 'tasks:t9': 3, 'dietWater:2026-10-02': 1 } },
      }),
    });

    const outcome = await runSync(stub.http);

    expect(outcome.ok).toBe(true);
    // 游标用快照信封里的 seq
    expect(useSyncStore.getState().lastSeq).toBe(10);
    // 落库：任务按 id upsert、饮水扁平数字、目标单值
    expect(useTaskStore.getState().tasks.map((item) => item.id)).toContain('t9');
    expect(useDietStore.getState().water).toEqual({ '2026-10-02': 8 });
    expect(useDietStore.getState().goals).toEqual({ calories: 2100, protein: 120 });
    // rev 表按快照里的 sync.rev 重设
    expect(useSyncStore.getState().revs).toMatchObject({ 'tasks:t9': 3 });
  });

  it('快照请求失败 → 整轮失败，不推进游标', async () => {
    enableSync({ lastSeq: 1 });

    const stub = stubServer({
      health: () => ({ ok: true, seq: 10, schemaVersion: 20, modules: [] }),
      changes: () => ({
        changes: [],
        more: false,
        nextSince: 1,
        seq: 10,
        needFullResync: true,
        purgedThroughSeq: 4,
      }),
      snapshot: () => {
        throw new Error('快照请求失败');
      },
    });

    const outcome = await runSync(stub.http);

    expect(outcome.ok).toBe(false);
    expect(outcome.lastSeq).toBe(1);
    expect(useSyncStore.getState().lastSeq).toBe(1);
  });
});

describe('认证头', () => {
  it('health 不带令牌（它是免鉴权路径），其余请求带 Bearer', async () => {
    enableSync({ deviceId: 'dev-1' });

    const stub = stubServer({
      health: () => ({ ok: true, seq: 0, schemaVersion: 20, modules: [] }),
      changes: () => emptyPage(0, 0),
    });

    await runSync(stub.http);

    const health = stub.requests.find((request) => request.url.endsWith('/v1/health'))!;
    expect(health.token).toBe('');
    const changes = stub.requests.find((request) => request.url.includes('/v1/changes'))!;
    expect(changes.token).toBe('s3cret-token');
  });
});

describe('基线在成功之后重算', () => {
  it('拉下来的远端记录也进基线（下一轮不会又当成改动推回去）', async () => {
    enableSync();

    const stub = stubServer({
      health: () => ({ ok: true, seq: 1, schemaVersion: 20, modules: [] }),
      changes: () => ({
        changes: [
          { seq: 1, module: 'tasks', key: 't1', rev: 1, op: 'put', record: task('t1', '远端') },
        ],
        more: false,
        nextSince: 1,
        seq: 1,
        needFullResync: false,
        purgedThroughSeq: 0,
      }),
    });

    await runSync(stub.http);

    // 基线必须等于「落库之后」的本机状态
    const expected = await computeBaseline();
    expect(useSyncStore.getState().baseline).toEqual(expected);
  });
});

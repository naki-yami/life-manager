// @vitest-environment node
/**
 * push 的验收（工单 03）。
 *
 * 只测外部行为：发一批改动 → 看逐条结果、看副本里的记录与 rev / seq、看历史里多了什么。
 * 不测内部函数名。`sameContent` 是导出给「幂等」这条语义用的，单独测它的值语义。
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SERVER_SCHEMA_VERSION } from './config';
import { loadReplica, REPLICA_FILE, revKey, type Replica } from './replica';
import { handlePush, sameContent, type HistoryEntry, type PushRequest } from './push';

const fixedClock = () => new Date('2026-10-03T00:00:00.000Z');

interface Harness {
  replica: Replica;
  history: HistoryEntry[];
  dataDir: string;
}

function makeHarness(): Harness {
  const dataDir = mkdtempSync(join(tmpdir(), 'lm-push-'));
  const history: HistoryEntry[] = [];
  const { replica } = loadReplica({ dataDir, now: fixedClock });
  return { replica, history, dataDir };
}

const push = (h: Harness, request: Partial<PushRequest> & { changes: PushRequest['changes'] }) =>
  handlePush(
    { replica: h.replica, now: fixedClock, onHistory: (entry) => h.history.push(entry) },
    { deviceId: 'dev-1', ...request },
  );

const task = (id: string, title: string): Record<string, unknown> => ({ id, title });

describe('幂等（spec Testing 第 1 条）', () => {
  it('同 baseRev + 同内容连推两次 → 第二次 noop，seq 不变、历史不增', () => {
    const h = makeHarness();
    const change = {
      module: 'tasks',
      key: 't1',
      baseRev: 0,
      op: 'put' as const,
      record: task('t1', '写周报'),
    };

    const first = push(h, { changes: [change] });
    expect(first.results[0]!.outcome).toBe('applied');
    expect(first.results[0]!.rev).toBe(1);
    expect(first.seq).toBe(1);

    const second = push(h, { changes: [change] });

    expect(second.results[0]!.outcome).toBe('noop');
    expect(second.results[0]!.rev).toBe(1);
    // 这三条是「幂等」的全部含义
    expect(second.seq).toBe(1);
    expect(h.replica.envelope.sync.seq).toBe(1);
    expect(h.history).toHaveLength(0);
    // 记录只有一条，没有因为重推而变成两条
    expect(h.replica.envelope.data.tasks).toHaveLength(1);
  });

  it('内容一致但键序不同也算 noop（客户端重推时键序可能变）', () => {
    const h = makeHarness();
    push(h, {
      changes: [
        {
          module: 'tasks',
          key: 't1',
          baseRev: 0,
          op: 'put',
          record: { id: 't1', title: 'A', note: 'B' },
        },
      ],
    });

    const second = push(h, {
      changes: [
        {
          module: 'tasks',
          key: 't1',
          baseRev: 1,
          op: 'put',
          record: { note: 'B', title: 'A', id: 't1' },
        },
      ],
    });

    expect(second.results[0]!.outcome).toBe('noop');
    expect(second.seq).toBe(1);
  });

  it('嵌套对象与数组里的内容变了就不是 noop', () => {
    const h = makeHarness();
    push(h, {
      changes: [
        {
          module: 'tasks',
          key: 't1',
          baseRev: 0,
          op: 'put',
          record: { id: 't1', subtasks: [{ id: 's1', title: '起稿' }] },
        },
      ],
    });

    const second = push(h, {
      changes: [
        {
          module: 'tasks',
          key: 't1',
          baseRev: 1,
          op: 'put',
          record: { id: 't1', subtasks: [{ id: 's1', title: '改稿' }] },
        },
      ],
    });

    expect(second.results[0]!.outcome).toBe('applied');
    expect(second.seq).toBe(2);
  });

  it('删掉一个不存在的记录 → noop（不产生 rev、不动 seq）', () => {
    const h = makeHarness();

    const result = push(h, {
      changes: [{ module: 'tasks', key: '不存在', baseRev: 0, op: 'delete' }],
    });

    expect(result.results[0]!.outcome).toBe('noop');
    expect(result.seq).toBe(0);
  });
});

describe('LWW 定序（spec Testing 第 2 条）', () => {
  it('两台设备先后推同一条 → 后到者 rev 更大、内容为后到者，先到的那份进了历史', () => {
    const h = makeHarness();
    // A 先推
    const a = push(h, {
      deviceId: 'dev-A',
      changes: [
        { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', 'A 的标题') },
      ],
    });
    expect(a.results[0]!.outcome).toBe('applied');
    expect(a.results[0]!.rev).toBe(1);

    // B 拿着旧 baseRev 推（它没见过 A 的改动）→ 仍被接受，但标 conflict
    const b = push(h, {
      deviceId: 'dev-B',
      changes: [
        { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', 'B 的标题') },
      ],
    });

    expect(b.results[0]!.outcome).toBe('conflict');
    expect(b.results[0]!.rev).toBe(2);
    expect(b.conflicts).toBe(1);
    // 后到者赢
    expect(h.replica.envelope.data.tasks).toEqual([task('t1', 'B 的标题')]);
    // 先到的那份进了历史
    expect(h.history).toHaveLength(1);
    expect(h.history[0]!.record).toEqual(task('t1', 'A 的标题'));
    expect(h.history[0]!.reason).toBe('conflict');
  });

  it('baseRev 不比服务端小时不算冲突（正常前进）', () => {
    const h = makeHarness();
    push(h, {
      changes: [{ module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', 'v1') }],
    });

    const second = push(h, {
      changes: [{ module: 'tasks', key: 't1', baseRev: 1, op: 'put', record: task('t1', 'v2') }],
    });

    expect(second.results[0]!.outcome).toBe('applied');
    expect(second.conflicts).toBe(0);
    expect(h.history).toHaveLength(0);
  });

  it('rev 单调递增，且只由服务端赋值（客户端给什么都不影响结果）', () => {
    const h = makeHarness();
    const revs: number[] = [];
    for (const title of ['v1', 'v2', 'v3']) {
      const result = push(h, {
        changes: [
          { module: 'tasks', key: 't1', baseRev: 999, op: 'put', record: task('t1', title) },
        ],
      });
      revs.push(result.results[0]!.rev);
    }

    expect(revs).toEqual([1, 2, 3]);
    expect(h.replica.envelope.sync.rev[revKey('tasks', 't1')]).toBe(3);
  });

  it('每条记录各自一个 rev，互不影响', () => {
    const h = makeHarness();
    const result = push(h, {
      changes: [
        { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', 'A') },
        { module: 'tasks', key: 't2', baseRev: 0, op: 'put', record: task('t2', 'B') },
      ],
    });

    expect(result.results.map((r) => r.rev)).toEqual([1, 1]);
    expect(h.replica.envelope.sync.rev[revKey('tasks', 't1')]).toBe(1);
    expect(h.replica.envelope.sync.rev[revKey('tasks', 't2')]).toBe(1);
  });

  it('同时改两条不同的记录：seq 逐条 +1', () => {
    const h = makeHarness();
    push(h, {
      changes: [
        { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', 'A') },
        { module: 'books', key: 'b1', baseRev: 0, op: 'put', record: { id: 'b1', title: '书' } },
      ],
    });

    expect(h.replica.envelope.sync.seq).toBe(2);
    expect(h.replica.envelope.data.tasks).toHaveLength(1);
    expect(h.replica.envelope.data.books).toHaveLength(1);
  });
});

describe('一批里混坏记录（验收第 3 条）', () => {
  it('坏的那条被拒，其余照常写入', () => {
    const h = makeHarness();

    const result = push(h, {
      changes: [
        { module: 'tasks', key: 'good', baseRev: 0, op: 'put', record: task('good', '好记录') },
        // 故意造一条类型上不该存在的记录：线上真的会收到这种（客户端 bug / 手改的请求）
        {
          module: 'tasks',
          key: 'bad',
          baseRev: 0,
          op: 'put',
          record: 'not an object' as unknown as Record<string, unknown>,
        },
        {
          module: 'books',
          key: 'good2',
          baseRev: 0,
          op: 'put',
          record: { id: 'good2', title: '也是好记录' },
        },
      ],
    });

    expect(result.results.map((r) => r.outcome)).toEqual(['applied', 'rejected', 'applied']);
    expect(result.results[1]!.error).toContain('记录应为对象');
    expect(h.replica.envelope.data.tasks).toEqual([task('good', '好记录')]);
    expect(h.replica.envelope.data.books).toHaveLength(1);
  });

  it('不在册的模块被拒（settings 就是这一条）', () => {
    const h = makeHarness();

    const result = push(h, {
      changes: [
        {
          module: 'settings',
          key: 's1',
          baseRev: 0,
          op: 'put',
          record: { id: 's1', themeMode: 'dark' },
        },
        { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', '正常') },
      ],
    });

    expect(result.results[0]!.outcome).toBe('rejected');
    expect(result.results[0]!.error).toContain('不在册');
    expect(result.results[1]!.outcome).toBe('applied');
    // 关键：settings 没有被塞进副本
    expect(Object.keys(h.replica.envelope.data)).not.toContain('settings');
  });

  it('record.id 与 key 不一致时被拒（否则会在数组里造出幽灵记录）', () => {
    const h = makeHarness();

    const result = push(h, {
      changes: [
        { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('别的id', '标题') },
      ],
    });

    expect(result.results[0]!.outcome).toBe('rejected');
    expect(result.results[0]!.error).toContain('不一致');
    expect(h.replica.envelope.data.tasks).toEqual([]);
  });

  it('id 是空的记录被拒', () => {
    const h = makeHarness();

    const result = push(h, {
      changes: [
        { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: { id: '', title: 'x' } },
      ],
    });

    expect(result.results[0]!.outcome).toBe('rejected');
    expect(result.results[0]!.error).toContain('id 应为非空字符串');
  });
});

describe('版本守卫', () => {
  it('客户端声明高于服务端支持的 schemaVersion → 整批拒绝，副本一字未改', () => {
    const h = makeHarness();

    const result = push(h, {
      schemaVersion: SERVER_SCHEMA_VERSION + 1,
      changes: [
        { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', '不该写入') },
      ],
    });

    expect(result.results[0]!.outcome).toBe('rejected');
    expect(result.results[0]!.error).toContain('请先升级服务端');
    expect(h.replica.envelope.data.tasks).toEqual([]);
    expect(h.replica.envelope.sync.seq).toBe(0);
  });

  it('等于或低于支持值照常处理', () => {
    const h = makeHarness();

    const result = push(h, {
      schemaVersion: SERVER_SCHEMA_VERSION,
      changes: [{ module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', '正常') }],
    });

    expect(result.results[0]!.outcome).toBe('applied');
  });
});

describe('设备表', () => {
  it('新设备被登记，lastSeenAt 与 lastSeq 都写上', () => {
    const h = makeHarness();

    push(h, {
      deviceId: 'dev-A',
      changes: [{ module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', 'A') }],
    });

    const device = h.replica.envelope.sync.devices.find((d) => d.deviceId === 'dev-A')!;
    expect(device).toBeDefined();
    expect(device.lastSeenAt).toBe('2026-10-03T00:00:00.000Z');
    expect(device.lastSeq).toBe(1);
  });

  it('同一设备再推不会重复登记，lastSeq 跟着 seq 走', () => {
    const h = makeHarness();
    push(h, {
      deviceId: 'dev-A',
      changes: [{ module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', 'A') }],
    });
    push(h, {
      deviceId: 'dev-A',
      changes: [{ module: 'tasks', key: 't2', baseRev: 0, op: 'put', record: task('t2', 'B') }],
    });

    expect(h.replica.envelope.sync.devices).toHaveLength(1);
    expect(h.replica.envelope.sync.devices[0]!.lastSeq).toBe(2);
  });

  it('两台设备各自一行', () => {
    const h = makeHarness();
    push(h, {
      deviceId: 'dev-A',
      changes: [{ module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', 'A') }],
    });
    push(h, {
      deviceId: 'dev-B',
      changes: [{ module: 'tasks', key: 't2', baseRev: 0, op: 'put', record: task('t2', 'B') }],
    });
    expect(h.replica.envelope.sync.devices.map((d) => d.deviceId)).toEqual(['dev-A', 'dev-B']);
  });

  /**
   * 回归闸：设备表只在**真的写进去过东西**时登记。
   *
   * 工单 05 的墓碑清理守卫是「所有已注册设备都拉过 ≥ 该墓碑的 seq」。一个整批都被拒、
   * 从没成功写过的设备若被登记成「已注册」，它永远不会来拉，墓碑就永远清不掉 ——
   * 一个拼错 deviceId 的客户端足以让墓碑无限堆积。
   */
  it('整批都被拒时不登记设备（否则会让工单 05 的墓碑永远清不掉）', () => {
    const h = makeHarness();

    push(h, {
      deviceId: 'dev-never-wrote',
      changes: [{ module: 'settings', key: 's1', baseRev: 0, op: 'put', record: { id: 's1' } }],
    });

    expect(h.replica.envelope.sync.devices).toEqual([]);
  });

  it('全是 noop 时也不登记', () => {
    const h = makeHarness();
    // 先让另一个设备写进去，再用一个只会命中 noop 的设备推同样的内容
    push(h, {
      deviceId: 'dev-A',
      changes: [{ module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', 'A') }],
    });

    push(h, {
      deviceId: 'dev-B',
      changes: [{ module: 'tasks', key: 't1', baseRev: 1, op: 'put', record: task('t1', 'A') }],
    });

    expect(h.replica.envelope.sync.devices.map((d) => d.deviceId)).toEqual(['dev-A']);
  });

  it('删除也算法写入：会登记设备', () => {
    const h = makeHarness();
    push(h, {
      deviceId: 'dev-A',
      changes: [{ module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', 'A') }],
    });

    push(h, {
      deviceId: 'dev-B',
      changes: [{ module: 'tasks', key: 't1', baseRev: 1, op: 'delete' }],
    });

    expect(h.replica.envelope.sync.devices.map((d) => d.deviceId)).toEqual(['dev-A', 'dev-B']);
  });
});

describe('baseRev 缺失时的归一', () => {
  it('直接调 handlePush 时 baseRev 缺失按 0 处理（与 HTTP 层同一结论）', () => {
    const h = makeHarness();
    push(h, {
      changes: [{ module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', 'v1') }],
    });

    // 服务端已是 rev 1；缺 baseRev 应当按「客户端认为还没有这条」= 0 处理 → 落后 → conflict。
    // 原来靠 `undefined < 1 === false` 会判成「不落后」，于是不标冲突。
    const result = push(h, {
      changes: [
        {
          module: 'tasks',
          key: 't1',
          op: 'put',
          record: task('t1', 'v2'),
        } as unknown as PushRequest['changes'][number],
      ],
    });

    expect(result.results[0]!.outcome).toBe('conflict');
  });
});

/**
 * 饮水（日期键映射）与目标（模块单值）**不是「带 id 的记录」**，key 的取法在 spec 里单独定死。
 * 这一组防的是一处很容易漏的实现错误：套用记录那套守卫（要求 `id` 非空）会让客户端
 * **每一次**推饮水/目标都被拒 —— 而且因为「不在册」不报错的路径不同，表现会很迷惑。
 */
describe('饮水与目标这两个 keyed 模块', () => {
  it('推饮水：key 是日期串，记录里没有 id 也能进', () => {
    const h = makeHarness();

    const result = push(h, {
      changes: [
        { module: 'dietWater', key: '2026-10-02', baseRev: 0, op: 'put', record: { glasses: 8 } },
      ],
    });

    expect(result.results[0]!.outcome).toBe('applied');
    expect(h.replica.envelope.data.dietWater).toEqual([{ glasses: 8, key: '2026-10-02' }]);
  });

  it('推目标：key 固定为模块名，记录里没有 id 也能进', () => {
    const h = makeHarness();

    const result = push(h, {
      changes: [
        {
          module: 'dietGoals',
          key: 'dietGoals',
          baseRev: 0,
          op: 'put',
          record: { calories: 2100, protein: 120 },
        },
      ],
    });

    expect(result.results[0]!.outcome).toBe('applied');
  });

  it('饮水按日期各自成单元，互不覆盖', () => {
    const h = makeHarness();
    push(h, {
      changes: [
        { module: 'dietWater', key: '2026-10-01', baseRev: 0, op: 'put', record: { glasses: 8 } },
        { module: 'dietWater', key: '2026-10-02', baseRev: 0, op: 'put', record: { glasses: 6 } },
      ],
    });

    expect(h.replica.envelope.data.dietWater).toHaveLength(2);
    expect(h.replica.envelope.sync.rev[revKey('dietWater', '2026-10-01')]).toBe(1);
    expect(h.replica.envelope.sync.rev[revKey('dietWater', '2026-10-02')]).toBe(1);
  });

  it('同一天重推同内容 → noop（幂等对 keyed 模块同样成立）', () => {
    const h = makeHarness();
    const change = {
      module: 'dietWater',
      key: '2026-10-02',
      baseRev: 0,
      op: 'put' as const,
      record: { glasses: 8 },
    };
    push(h, { changes: [change] });

    const second = push(h, { changes: [change] });

    expect(second.results[0]!.outcome).toBe('noop');
    expect(second.seq).toBe(1);
    expect(h.replica.envelope.data.dietWater).toHaveLength(1);
  });

  it('饮水的 key 不是日期串 → 拒（否则副本里会堆出幽灵单元）', () => {
    const h = makeHarness();

    const result = push(h, {
      changes: [
        { module: 'dietWater', key: '随便什么', baseRev: 0, op: 'put', record: { glasses: 8 } },
      ],
    });

    expect(result.results[0]!.outcome).toBe('rejected');
    expect(result.results[0]!.error).toContain('日期串');
    expect(h.replica.envelope.data.dietWater).toEqual([]);
  });

  it('目标的 key 不是模块名 → 拒', () => {
    const h = makeHarness();

    const result = push(h, {
      changes: [
        { module: 'dietGoals', key: '别的', baseRev: 0, op: 'put', record: { calories: 1 } },
      ],
    });

    expect(result.results[0]!.outcome).toBe('rejected');
    expect(result.results[0]!.error).toContain('模块名本身');
  });
});

/**
 * 删除也走 LWW 判定。
 *
 * 这一组是回归闸：原来 delete 分支在冲突判定**之前**就返回了，于是「B 端只见过 v1、
 * 拿过期 baseRev 来删」会把 A 端更新的 v2 **静默抹掉**、还回 `applied`，客户端看不到任何提示 ——
 * 正是 ADR-0002 排在最高优先级的「同步导致记录丢失」。
 */
describe('删除的 LWW 判定（回归闸）', () => {
  it('过期 baseRev 的 delete 会标 conflict，并把被覆盖的那份写进历史', () => {
    const h = makeHarness();
    // A 写 v1，再更新到 v2
    push(h, {
      changes: [{ module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', 'v1') }],
    });
    push(h, {
      changes: [
        { module: 'tasks', key: 't1', baseRev: 1, op: 'put', record: task('t1', 'v2 重要内容') },
      ],
    });

    // B 只见过 v1，拿 baseRev=0 来删
    const result = push(h, { changes: [{ module: 'tasks', key: 't1', baseRev: 0, op: 'delete' }] });

    // 删除仍然生效（后到者赢），但必须告诉客户端「你删的时候已经有更新的版本了」
    expect(result.results[0]!.outcome).toBe('conflict');
    expect(result.conflicts).toBe(1);
    // 被删掉的那份（A 的 v2）进了历史，用户还能取回
    expect(h.history).toHaveLength(1);
    expect(h.history[0]!.record).toEqual(task('t1', 'v2 重要内容'));
    expect(h.history[0]!.reason).toBe('conflict');
  });

  it('baseRev 跟得上时，delete 是普通 applied、不标冲突', () => {
    const h = makeHarness();
    push(h, {
      changes: [{ module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', 'v1') }],
    });

    const result = push(h, { changes: [{ module: 'tasks', key: 't1', baseRev: 1, op: 'delete' }] });

    expect(result.results[0]!.outcome).toBe('applied');
    expect(result.conflicts).toBe(0);
    expect(h.history[0]!.reason).toBe('overwritten');
  });
});

describe('内容比较的值语义', () => {
  it('键序无关', () => {
    expect(sameContent({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('嵌套对象与数组逐层比较', () => {
    expect(sameContent({ o: { x: 1 } }, { o: { x: 1 } })).toBe(true);
    expect(sameContent({ o: { x: 1 } }, { o: { x: 2 } })).toBe(false);
    expect(sameContent({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
    expect(sameContent({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameContent({ a: [1] }, { a: [1, 2] })).toBe(false);
  });

  it('多一个字段就不相等（字段级合并不在本版范围内）', () => {
    expect(sameContent({ id: 't1' }, { id: 't1', title: 'x' })).toBe(false);
  });

  it('null 与 undefined 区分', () => {
    expect(sameContent(null, undefined)).toBe(false);
    expect(sameContent(null, null)).toBe(true);
  });

  /**
   * 回归闸：`isPlainObject` 原来只查 `typeof === 'object' && !Array.isArray`，
   * 于是 `Date` / `Map` / `Set` / `RegExp` 都被算成对象 —— 而它们的 `Object.keys()` 是**空数组**，
   * 两个**不同的** Date 会判为相等，真实改动被当 noop 丢掉。
   *
   * 走 HTTP 时 JSON 不会产出这些类型，所以这是潜伏缺陷；但直接调 `handlePush` 的调用方
   * （工单 06 的 restore 路径）会踩到。
   */
  it('Date / Map / Set / RegExp 内容不同时**不**相等', () => {
    expect(sameContent({ d: new Date('2026-01-01') }, { d: new Date('2026-12-31') })).toBe(false);
    expect(sameContent({ m: new Map([['a', 1]]) }, { m: new Map([['b', 2]]) })).toBe(false);
    expect(sameContent({ s: new Set([1]) }, { s: new Set([2]) })).toBe(false);
    expect(sameContent({ r: /a/ }, { r: /b/ })).toBe(false);
  });

  it('同值的 Date 仍然相等（别把幂等弄坏）', () => {
    expect(sameContent({ d: new Date('2026-01-01') }, { d: new Date('2026-01-01') })).toBe(true);
  });

  it('改一个 Date 字段会被当成真实写入，而不是 noop', () => {
    const h = makeHarness();
    push(h, {
      changes: [
        {
          module: 'tasks',
          key: 't1',
          baseRev: 0,
          op: 'put',
          record: { id: 't1', due: new Date('2026-01-01') },
        },
      ],
    });

    const second = push(h, {
      changes: [
        {
          module: 'tasks',
          key: 't1',
          baseRev: 1,
          op: 'put',
          record: { id: 't1', due: new Date('2026-12-31') },
        },
      ],
    });

    expect(second.results[0]!.outcome).toBe('applied');
    expect(second.seq).toBe(2);
  });
});

describe('落盘由调用方决定', () => {
  it('handlePush 自己不动磁盘，save() 之后副本才带 rev 与 seq', () => {
    const h = makeHarness();
    push(h, {
      changes: [
        { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: task('t1', '写周报') },
      ],
    });

    // 还没存：磁盘上仍是初始的空副本
    const before = JSON.parse(readFileSync(join(h.dataDir, REPLICA_FILE), 'utf8')) as {
      sync: { seq: number };
      data: { tasks: unknown[] };
    };
    expect(before.sync.seq).toBe(0);
    expect(before.data.tasks).toEqual([]);

    h.replica.save();

    const after = JSON.parse(readFileSync(join(h.dataDir, REPLICA_FILE), 'utf8')) as {
      sync: { seq: number; rev: Record<string, number> };
      data: { tasks: unknown[] };
    };
    expect(after.sync.seq).toBe(1);
    expect(after.sync.rev[revKey('tasks', 't1')]).toBe(1);
    expect(after.data.tasks).toEqual([task('t1', '写周报')]);
  });
});

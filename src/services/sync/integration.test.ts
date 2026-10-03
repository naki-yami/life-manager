// @vitest-environment node
/**
 * 单元表与落库对着**真服务端**跑一遍。
 *
 * 前面两个测试文件各自锁住「表覆盖了哪些模块」与「落库语义」；这一份把它们合起来，
 * 走真 `handlePush` / 真副本，验证：客户端 `readUnits()` 读出来的东西推给服务端
 * **不被结构守卫拒**，推完再把副本的 `data` 段（＝服务端形状）交回 `applyChanges()`
 * 落库，值原样回来。
 *
 * 为什么值得单独写：单元表的形状错了，前面那些单测照样全绿 —— 它们两边都是我自己写的。
 * 这一份的判据来自**服务端的实现**，形状漂移会在这里红灯。
 *
 * 跑在 node 环境下（服务端只依赖 node:*，且不碰 localStorage / DOM）。
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useDietStore } from '../../store/dietStore';
import { useTaskStore } from '../../store/taskStore';
import { DEFAULT_DIET_GOALS } from '../../utils/diet';
import { handlePush } from '../../server/push';
import { loadReplica } from '../../server/replica';
import { applyChanges } from './apply';
import { computeBaseline, diffAgainstBaseline, revTableResolver, type RevTable } from './baseline';
import { readUnits } from './units';

/** 建一个临时数据目录上的真副本 */
function freshReplica() {
  return loadReplica({ dataDir: mkdtempSync(join(tmpdir(), 'lm-units-')) }).replica;
}

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

describe('readUnits 读出来的东西服务端收得下', () => {
  it('记录集合、饮水、目标三种单元推上去都被接受（没有一个被结构守卫拒）', () => {
    const replica = freshReplica();

    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });
    useDietStore.setState({
      records: [],
      templates: [],
      goals: { calories: 2100, protein: 120 },
      water: { '2026-10-02': 8, '2026-10-03': 6 },
    });

    const units = readUnits();
    const changes = [
      // 记录集合：每个 id 一个单元
      ...Object.entries(units.tasks!).map(([key, record]) => ({
        module: 'tasks',
        key,
        baseRev: 0,
        op: 'put' as const,
        record: record as Record<string, unknown>,
      })),
      // 日期键映射：每个日期一个单元，值是裸数字
      ...Object.entries(units.dietWater!).map(([key, value]) => ({
        module: 'dietWater',
        key,
        baseRev: 0,
        op: 'put' as const,
        record: { [key]: value },
      })),
      // 模块单值：key 固定为模块名
      ...Object.entries(units.dietGoals!).map(([key, value]) => ({
        module: 'dietGoals',
        key,
        baseRev: 0,
        op: 'put' as const,
        record: value as Record<string, unknown>,
      })),
    ];

    const response = handlePush(
      { replica, onHistory: () => {} } as never,
      { deviceId: 'dev-1', changes } as never,
    );

    // 一条都不能被拒：被拒说明单元形状与服务端的结构守卫对不上
    const rejected = response.results.filter((item) => item.outcome === 'rejected');
    expect(rejected).toEqual([]);
    expect(response.results).toHaveLength(changes.length);

    // 副本里存的就是**扁平**形状
    expect(replica.envelope.data.dietWater).toEqual({ '2026-10-02': 8, '2026-10-03': 6 });
    expect(replica.envelope.data.dietGoals).toEqual({ calories: 2100, protein: 120 });
  });
});

describe('服务端形状落回客户端 store', () => {
  it('推上去再拉回来，值逐字段相等', () => {
    const replica = freshReplica();

    const serverTask = task('t1', '写周报');
    useTaskStore.setState({ tasks: [serverTask] as never, memos: [] });
    useDietStore.setState({
      records: [],
      templates: [],
      goals: { calories: 2100, protein: 120 },
      water: { '2026-10-02': 8 },
    });

    // 推
    handlePush(
      { replica, onHistory: () => {} } as never,
      {
        deviceId: 'dev-1',
        changes: [
          { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: serverTask },
          {
            module: 'dietWater',
            key: '2026-10-02',
            baseRev: 0,
            op: 'put',
            record: { '2026-10-02': 8 },
          },
          {
            module: 'dietGoals',
            key: 'dietGoals',
            baseRev: 0,
            op: 'put',
            record: { calories: 2100, protein: 120 },
          },
        ],
      } as never,
    );

    // 清空本机，模拟「另一台设备」从零落库
    useTaskStore.setState({ tasks: [], memos: [] });
    useDietStore.setState({
      records: [],
      templates: [],
      goals: { ...DEFAULT_DIET_GOALS },
      water: {},
    });

    // 拉：把副本的 data 段拆回单元式的变更（引擎该做的事，这里用表来切）
    const data = replica.envelope.data;
    const pulled = [
      ...(data.tasks as Array<Record<string, unknown>>).map((record) => ({
        module: 'tasks',
        key: String(record.id),
        op: 'put' as const,
        record,
      })),
      ...Object.entries(data.dietWater as Record<string, number>).map(([key, value]) => ({
        module: 'dietWater',
        key,
        op: 'put' as const,
        record: { [key]: value },
      })),
      {
        module: 'dietGoals',
        key: 'dietGoals',
        op: 'put' as const,
        record: data.dietGoals as Record<string, unknown>,
      },
    ];

    const result = applyChanges(pulled);

    expect(result.skipped).toEqual([]);
    expect(useTaskStore.getState().tasks).toEqual([serverTask]);
    // 饮水落库后是扁平数字，不是 { glasses: 8 }
    expect(useDietStore.getState().water).toEqual({ '2026-10-02': 8 });
    expect(useDietStore.getState().goals).toEqual({ calories: 2100, protein: 120 });
  });
});

describe('diff 产出的载荷服务端收得下', () => {
  /**
   * 这一条抓的是一个**真实的坑**：单元表里三种单元的值形状并不一样。
   * 记录集合与 `dietGoals` 的值是对象，而 `dietWater` 的值是**裸数字** ——
   * diff 若把值原样塞进 `record`，饮水会推成 `record: 8`，
   * 而服务端 `waterValueOf` 要的是单键对象 `{ '2026-10-02': 8 }`。
   *
   * 单测两边都是我自己写的，抓不到这种「我以为是 A、服务端以为是 B」的偏差；
   * 判据取服务端实现才抓得到。
   */
  it('全量比对推上去，饮水落成扁平数字、一条都不被拒', async () => {
    const replica = freshReplica();

    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });
    useDietStore.setState({
      records: [],
      templates: [],
      goals: { calories: 2100, protein: 120 },
      water: { '2026-10-02': 8, '2026-10-03': 6 },
    });

    // 空基线 = 首次全量推送
    const changes = await diffAgainstBaseline({});
    const response = handlePush(
      { replica, onHistory: () => {} } as never,
      { deviceId: 'dev-1', changes } as never,
    );

    const rejected = response.results.filter((item) => item.outcome === 'rejected');
    expect(rejected).toEqual([]);

    // 饮水的形状必须对：扁平 date → 数字
    expect(replica.envelope.data.dietWater).toEqual({ '2026-10-02': 8, '2026-10-03': 6 });
    expect(replica.envelope.data.dietGoals).toEqual({ calories: 2100, protein: 120 });
    expect(replica.envelope.data.tasks).toEqual([task('t1', '写周报')]);
  });

  it('推完之后算的基线，再比一次得不出任何改动', async () => {
    const replica = freshReplica();

    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });
    useDietStore.setState({
      records: [],
      templates: [],
      goals: { calories: 2100, protein: 120 },
      water: { '2026-10-02': 8 },
    });

    const changes = await diffAgainstBaseline({});
    handlePush({ replica, onHistory: () => {} } as never, { deviceId: 'dev-1', changes } as never);

    // 一轮同步成功之后写基线 —— 这就是引擎该做的时序
    const baseline = await computeBaseline();

    // 本机没再动过 → 第二轮一条都不推（不会把整库按旧值重推一遍）
    expect(await diffAgainstBaseline(baseline)).toEqual([]);
  });

  /**
   * 把 rev 表整条链路接起来：服务端 push 的结果里带 rev → 记进 rev 表 →
   * 下一轮 diff 拿它当 `baseRev` → 服务端据它判冲突。
   *
   * 这一条是工单 03 要求 6（「基线里一并记上次推送后的 rev」）的可执行版本。
   */
  it('push 回来记下 rev，下一轮改同一条时带上的 baseRev 就是它', async () => {
    const replica = freshReplica();

    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    // 第一轮：全量推
    const first = await diffAgainstBaseline({});
    const firstResponse = handlePush(
      { replica, onHistory: () => {} } as never,
      { deviceId: 'dev-1', changes: first } as never,
    );

    // 从服务端的结果里收 rev（引擎该做的事）；此时服务端那条是第 1 版
    const revs: RevTable = {};
    for (const result of firstResponse.results) {
      revs[result.module] = { ...revs[result.module], [result.key]: result.rev };
    }
    expect(revs.tasks?.t1).toBe(1);

    const baseline = await computeBaseline();

    // 第二轮：本机改了 t1
    useTaskStore.setState({ tasks: [task('t1', '写周报（改）')] as never, memos: [] });
    const second = await diffAgainstBaseline(baseline, revTableResolver(revs));

    const pushed = second.find((change) => change.key === 't1')!;
    // baseRev 如实反映「我上次看到的是第 1 版」
    expect(pushed.baseRev).toBe(1);

    const secondResponse = handlePush(
      { replica, onHistory: () => {} } as never,
      { deviceId: 'dev-1', changes: second } as never,
    );

    // 服务端没有别处并发改过 → 不该被标冲突（若 baseRev 恒填 0，这里会被标 conflict）
    const result = secondResponse.results.find((item) => item.key === 't1')!;
    expect(result.outcome).toBe('applied');
    expect(secondResponse.conflicts).toBe(0);
    expect(replica.envelope.data.tasks).toEqual([task('t1', '写周报（改）')]);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { useDietStore } from '../../store/dietStore';
import { useTaskStore } from '../../store/taskStore';
import { DEFAULT_DIET_GOALS } from '../../utils/diet';
import {
  HASH_LENGTH,
  canonicalize,
  computeBaseline,
  contentHash,
  diffAgainstBaseline,
  revTableResolver,
  type Baseline,
  type RevTable,
} from './baseline';

/*
 * 内容哈希基线的判据来自 client spec 的 diff 那张表与 Testing Decisions 第 1、9、10 条。
 */

const task = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
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
  ...extra,
});

const empty = { tasks: [] as never[], memos: [] };

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({ ...empty });
  useDietStore.setState({
    records: [],
    templates: [],
    goals: { ...DEFAULT_DIET_GOALS },
    water: {},
  });
});

describe('规范化与哈希', () => {
  it('同一条记录用两种键序构造，规范化结果相同', () => {
    const a = { id: 't1', title: '写周报', dueDate: '2026-10-03' };
    const b = { dueDate: '2026-10-03', title: '写周报', id: 't1' };

    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('同一条记录用两种键序构造，算出的哈希相同', async () => {
    const a = { id: 't1', title: '写周报', nested: { x: 1, y: 2 } };
    const b = { nested: { y: 2, x: 1 }, title: '写周报', id: 't1' };

    expect(await contentHash(a)).toBe(await contentHash(b));
  });

  it('嵌套对象也按键名排序（只排顶层不够）', () => {
    const a = { outer: { b: 1, a: 2 } };
    const b = { outer: { a: 2, b: 1 } };

    // 若只排顶层，两个字符串会是 {"outer":{"b":1,"a":2}} vs {"outer":{"a":2,"b":1}}
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('数组保持原序：顺序有语义，不排序', () => {
    const a = { tags: ['工作', '紧急'] };
    const b = { tags: ['紧急', '工作'] };

    expect(canonicalize(a)).not.toBe(canonicalize(b));
    // 数组里面的对象仍然按键名排序
    expect(canonicalize({ items: [{ b: 1, a: 2 }] })).toBe(
      canonicalize({ items: [{ a: 2, b: 1 }] }),
    );
  });

  it('内容不同就哈希不同', async () => {
    const a = { id: 't1', title: '写周报' };
    const b = { id: 't1', title: '写周报（改）' };

    expect(await contentHash(a)).not.toBe(await contentHash(b));
  });

  it('哈希是 16 个十六进制字符', async () => {
    const hash = await contentHash({ id: 't1' });

    expect(hash).toHaveLength(HASH_LENGTH);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('diff：四种判定', () => {
  it('新增一条 → 推 put', async () => {
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    const changes = await diffAgainstBaseline({});

    expect(changes).toEqual([
      {
        module: 'tasks',
        key: 't1',
        op: 'put',
        record: task('t1', '写周报'),
        baseRev: 0,
      },
      // `dietGoals` 是模块单值，store 里恒有默认值 —— 空基线下它也必然算「新增」。
      // 这不是噪声，而是它本来就是这样：整块替换的模块永远有一个当前值。
      {
        module: 'dietGoals',
        key: 'dietGoals',
        op: 'put',
        record: { calories: 2000, protein: 80 },
        baseRev: 0,
      },
    ]);
  });

  it('改一条 → 推 put（哈希不同）', async () => {
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });
    const baseline = await computeBaseline();

    useTaskStore.setState({ tasks: [task('t1', '写周报（改）')] as never, memos: [] });
    const changes = await diffAgainstBaseline(baseline);

    expect(changes).toEqual([
      {
        module: 'tasks',
        key: 't1',
        op: 'put',
        record: task('t1', '写周报（改）'),
        baseRev: 0,
      },
    ]);
  });

  it('删一条 → 推 delete，且不带 record', async () => {
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });
    const baseline = await computeBaseline();

    useTaskStore.setState({ ...empty });
    const changes = await diffAgainstBaseline(baseline);

    expect(changes).toEqual([{ module: 'tasks', key: 't1', op: 'delete', baseRev: 0 }]);
    expect(changes[0]).not.toHaveProperty('record');
  });

  it('没动的一条都不推', async () => {
    useTaskStore.setState({
      tasks: [task('t1', '写周报'), task('t2', '看论文')] as never,
      memos: [],
    });
    const baseline = await computeBaseline();

    const changes = await diffAgainstBaseline(baseline);

    expect(changes).toEqual([]);
  });

  it('混合场景：只推真的变了的那几条', async () => {
    useTaskStore.setState({
      tasks: [task('t1', '写周报'), task('t2', '看论文'), task('t3', '要删的')] as never,
      memos: [],
    });
    const baseline = await computeBaseline();

    // t1 没动、t2 改了、t3 删了、t4 新增
    useTaskStore.setState({
      tasks: [task('t1', '写周报'), task('t2', '看论文（改）'), task('t4', '新任务')] as never,
      memos: [],
    });
    const changes = await diffAgainstBaseline(baseline);

    const byKey = Object.fromEntries(changes.map((change) => [change.key, change.op]));
    expect(byKey).toEqual({ t2: 'put', t4: 'put', t3: 'delete' });
    expect(changes).toHaveLength(3);
  });
});

describe('基线是可丢弃的派生物', () => {
  it('基线为空时退化成全量比对，且不产生任何 delete', async () => {
    useTaskStore.setState({
      tasks: [task('t1', '写周报'), task('t2', '看论文')] as never,
      memos: [],
    });

    // 空的基线 = 删掉 lm:sync 之后的状态
    const changes = await diffAgainstBaseline({});

    expect(changes.every((change) => change.op === 'put')).toBe(true);
    // 两条任务 + 恒有默认值的 dietGoals
    expect(changes).toHaveLength(3);
  });

  it('本机删光数据 + 基线为空 → 一条 delete 都不发（不会误删服务端）', async () => {
    useTaskStore.setState({ ...empty });

    const changes = await diffAgainstBaseline({});

    // 一条 delete 都没有；剩下的 put 只来自「模块单值恒有默认值」的 dietGoals
    expect(changes.filter((change) => change.op === 'delete')).toEqual([]);
  });

  it('基线里有、本机没有的才推 delete；基线里没记录过的 key 推不出 delete', async () => {
    // 基线只记过 t1；本机现在空
    const baseline: Baseline = { tasks: { t1: 'some-hash' } };
    const changes = await diffAgainstBaseline(baseline);

    // 只删基线里有的那一条，其余 22 个模块一条 delete 都不产生
    expect(changes.filter((change) => change.op === 'delete')).toEqual([
      { module: 'tasks', key: 't1', op: 'delete', baseRev: 0 },
    ]);
  });
});

describe('baseRev 的来源', () => {
  it('从 revOf 取每条记录当前的记录版本', async () => {
    useTaskStore.setState({
      tasks: [task('t1', '写周报'), task('t2', '看论文')] as never,
      memos: [],
    });
    const baseline = await computeBaseline();
    useTaskStore.setState({
      tasks: [task('t1', '写周报（改）'), task('t2', '看论文')] as never,
      memos: [],
    });

    const revs: Record<string, number> = { 'tasks:t1': 7 };
    const changes = await diffAgainstBaseline(
      baseline,
      (module, key) => revs[`${module}:${key}`] ?? 0,
    );

    expect(changes).toHaveLength(1);
    expect(changes[0]!.baseRev).toBe(7);
  });

  it('不传 revOf 时一律 0（= 服务端还没有这条，用于首次全量推送）', async () => {
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    const changes = await diffAgainstBaseline({});

    expect(changes[0]!.baseRev).toBe(0);
  });

  it('rev 表存在 lm:sync 里，diff 时用它填 baseRev', async () => {
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });
    const baseline = await computeBaseline();

    // 上一轮同步记下的 rev：服务端那条是第 5 版
    const revs: RevTable = { tasks: { t1: 5 } };
    useTaskStore.setState({ tasks: [task('t1', '写周报（改）')] as never, memos: [] });

    const changes = await diffAgainstBaseline(baseline, revTableResolver(revs));

    expect(changes).toEqual([
      {
        module: 'tasks',
        key: 't1',
        op: 'put',
        record: task('t1', '写周报（改）'),
        baseRev: 5,
      },
    ]);
  });

  it('rev 表里没有的条目按 0 处理（服务端还没有这条）', async () => {
    useTaskStore.setState({ tasks: [task('t9', '新任务')] as never, memos: [] });

    const changes = await diffAgainstBaseline({}, revTableResolver({ tasks: { t1: 5 } }));

    const t9 = changes.find((change) => change.key === 't9')!;
    expect(t9.baseRev).toBe(0);
  });

  it('改内容不丢 rev：哈希变了会推 put，而 baseRev 仍是服务端那一版', async () => {
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });
    const baseline = await computeBaseline();
    const revs: RevTable = { tasks: { t1: 3 } };

    // 本机改了内容：哈希变了 → 推 put；服务端那一版没变，所以 baseRev 还是 3。
    // 这正是「两边都改过」能被服务端标成 conflict 的前提。
    useTaskStore.setState({ tasks: [task('t1', '写周报（本机改）')] as never, memos: [] });
    const changes = await diffAgainstBaseline(baseline, revTableResolver(revs));

    const t1 = changes.find((change) => change.key === 't1')!;
    expect(t1.op).toBe('put');
    expect(t1.baseRev).toBe(3);
  });

  it('删掉的条目也带它已知的 baseRev（删除同样参与 LWW 判定）', async () => {
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });
    const baseline = await computeBaseline();
    const revs: RevTable = { tasks: { t1: 4 } };

    useTaskStore.setState({ ...empty });
    const changes = await diffAgainstBaseline(baseline, revTableResolver(revs));

    // 服务端拿 baseRev 判「你删的时候已经有更新的一版了」→ 标 conflict 而不是静默抹掉
    expect(changes).toEqual([{ module: 'tasks', key: 't1', op: 'delete', baseRev: 4 }]);
  });
});

describe('keyed 模块一起参与比对', () => {
  it('饮水按日期键、目标是模块单值，各成一个条目', async () => {
    useDietStore.setState({ water: { '2026-10-02': 8 } });
    const baseline = await computeBaseline();

    // 基线里两个 keyed 模块都在
    expect(baseline.dietWater).toEqual({ '2026-10-02': expect.any(String) });
    expect(Object.keys(baseline.dietGoals!)).toEqual(['dietGoals']);

    // 没动 → 一条都不推
    expect(await diffAgainstBaseline(baseline)).toEqual([]);

    // 改饮水的某一天 → 只推那一天
    useDietStore.setState({ water: { '2026-10-02': 8, '2026-10-03': 6 } });
    const changes = await diffAgainstBaseline(baseline);

    expect(changes).toEqual([
      {
        module: 'dietWater',
        key: '2026-10-03',
        op: 'put',
        record: { '2026-10-03': 6 },
        baseRev: 0,
      },
    ]);
  });

  it('饮水的值是裸数字，推上去的 record 也是单键数字（不是包一层）', async () => {
    useDietStore.setState({ water: { '2026-10-02': 8 } });

    const changes = await diffAgainstBaseline({});

    const water = changes.find((change) => change.module === 'dietWater')!;
    expect(water.record).toEqual({ '2026-10-02': 8 });
    expect(typeof (water.record as Record<string, unknown>)['2026-10-02']).toBe('number');
  });

  it('模块单值改了 → 推 put，且不产生 delete', async () => {
    const baseline = await computeBaseline();
    useDietStore.setState({ goals: { calories: 2100, protein: 120 } });

    const changes = await diffAgainstBaseline(baseline);

    expect(changes).toEqual([
      {
        module: 'dietGoals',
        key: 'dietGoals',
        op: 'put',
        record: { calories: 2100, protein: 120 },
        baseRev: 0,
      },
    ]);
  });

  it('基线里有 dietGoals、当前读不出时也不推 delete（模块单值不产生删除）', async () => {
    // 伪造一份「基线里有、当前没有」的局面：直接给基线塞一个当前不存在的 key
    const baseline: Baseline = { dietGoals: { dietGoals: 'stale-hash' } };
    const changes = await diffAgainstBaseline(baseline);

    // 当前的 dietGoals 还在（store 有默认值），且它的 key 就是模块名 → 走 put 分支
    expect(changes.every((change) => change.op !== 'delete')).toBe(true);
  });
});

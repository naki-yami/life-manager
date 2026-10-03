import { beforeEach, describe, expect, it } from 'vitest';
import { useBookStore } from '../../store/bookStore';
import { useDevStore } from '../../store/devStore';
import { useDietStore } from '../../store/dietStore';
import { useGoalStore } from '../../store/goalStore';
import { useTaskStore } from '../../store/taskStore';
import { DEFAULT_DIET_GOALS } from '../../utils/diet';
import { applyChange, applyChanges } from './apply';

/*
 * 落库的验收（client spec Testing Decisions 第 2 条）：
 * 拉到 put / delete → store 里确实变了，且**只变那一条**（另一条逐字段不变）；
 * 落库后该条**逐字段等于服务端那一份**（含派生字段）。
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

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({ tasks: [], memos: [] });
  useBookStore.setState({ books: [], sessions: [] });
  useDevStore.setState({ projects: [], sessions: [] });
  useGoalStore.setState({ goals: [] });
  useDietStore.setState({
    records: [],
    templates: [],
    goals: { ...DEFAULT_DIET_GOALS },
    water: {},
  });
});

describe('put：新增一条', () => {
  it('本地没有时追加进去', () => {
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    const result = applyChange({
      module: 'tasks',
      key: 't2',
      op: 'put',
      record: task('t2', '看论文'),
    });

    expect(result.applied).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(useTaskStore.getState().tasks.map((item) => item.title)).toEqual(['写周报', '看论文']);
  });
});

describe('put：改一条', () => {
  it('本地有时就地替换，且只变那一条', () => {
    const untouched = task('t2', '看论文');
    useTaskStore.setState({ tasks: [task('t1', '写周报'), untouched] as never, memos: [] });

    const result = applyChange({
      module: 'tasks',
      key: 't1',
      op: 'put',
      record: task('t1', '写周报（改）'),
    });

    expect(result.applied).toBe(1);
    expect(useTaskStore.getState().tasks).toHaveLength(2);
    expect(useTaskStore.getState().tasks[0]!.title).toBe('写周报（改）');
    // 另一条**逐字段不变**（而且是同一个对象引用 —— 没被重建、没被重算）
    expect(useTaskStore.getState().tasks[1]).toEqual(untouched);
    expect(useTaskStore.getState().tasks[1]).toBe(untouched);
  });

  it('落库后逐字段等于服务端那一份，含派生字段', () => {
    // 开发项目的 hoursSpent 是派生字段；远端那一份带着它的值，落库不该按本机逻辑重算
    const serverProject = {
      id: 'p1',
      name: 'Life Manager',
      description: '',
      status: 'active' as const,
      techStack: ['React'],
      repoUrl: '',
      startDate: '2026-09-01',
      endDate: '',
      archived: false,
      milestones: [],
      logs: [],
      hoursSpent: 42.5,
      createdAt: '2026-09-01T00:00:00.000Z',
    };

    useDevStore.setState({ projects: [serverProject] as never, sessions: [] });
    // 本机把它改成 0：远端那一份必须原样落回来（42.5），而不是走 updateProject 重算
    applyChange({ module: 'devProjects', key: 'p1', op: 'put', record: serverProject });

    expect(useDevStore.getState().projects[0]).toEqual(serverProject);
    expect(useDevStore.getState().projects[0]!.hoursSpent).toBe(42.5);
  });

  it('饮食记录的四个合计数原样落库，不被重算', () => {
    const meal = {
      id: 'm1',
      date: '2026-10-03',
      type: 'breakfast' as const,
      items: [{ id: 'f1', name: '燕麦', calories: 300, protein: 10, carbs: 50, fat: 5 }],
      // 刻意与服务端 items 算出来的值不同：落库必须原样用服务端那份
      totalCalories: 999,
      totalProtein: 999,
      totalCarbs: 999,
      totalFat: 999,
      tags: [],
    };

    applyChange({ module: 'dietRecords', key: 'm1', op: 'put', record: meal });

    const stored = useDietStore.getState().records[0]!;
    expect(stored).toEqual(meal);
    expect(stored.totalCalories).toBe(999);
  });
});

describe('delete：删一条', () => {
  it('按 key 删掉，只删那一条', () => {
    const kept = task('t2', '看论文');
    useTaskStore.setState({ tasks: [task('t1', '写周报'), kept] as never, memos: [] });

    const result = applyChange({ module: 'tasks', key: 't1', op: 'delete' });

    expect(result.applied).toBe(1);
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().tasks[0]).toEqual(kept);
    expect(useTaskStore.getState().tasks[0]).toBe(kept);
  });

  it('重复投递同一个删除是幂等的，不抛错也不动别的条目', () => {
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    const first = applyChange({ module: 'tasks', key: 'nope', op: 'delete' });
    const second = applyChange({ module: 'tasks', key: 'nope', op: 'delete' });

    expect(first.applied).toBe(1);
    expect(second.applied).toBe(1);
    expect(useTaskStore.getState().tasks).toHaveLength(1);
  });
});

describe('dietWater：日期键，值是裸数字', () => {
  it('按日期写一个数字（不是包一层对象）', () => {
    const result = applyChange({
      module: 'dietWater',
      key: '2026-10-02',
      op: 'put',
      record: { '2026-10-02': 8 },
    });

    expect(result.applied).toBe(1);
    // 形状必须是扁平的 date → 数字：包一层 {glasses:8} 会被 sanitizeWater 静默剔空
    expect(useDietStore.getState().water).toEqual({ '2026-10-02': 8 });
    expect(typeof useDietStore.getState().water['2026-10-02']).toBe('number');
  });

  it('旧形状 { glasses: 8 } 也认，但落库仍是数字', () => {
    applyChange({ module: 'dietWater', key: '2026-10-02', op: 'put', record: { glasses: 6 } });

    expect(useDietStore.getState().water).toEqual({ '2026-10-02': 6 });
  });

  it('取不出数字时跳过并回报，不写脏值进 store', () => {
    const result = applyChange({
      module: 'dietWater',
      key: '2026-10-02',
      op: 'put',
      record: { '2026-10-02': { glasses: 8 } },
    });

    // 这条 record 里没有可用的数字（值是个对象、也没有 glasses 键）
    expect(result.applied).toBe(0);
    expect(result.skipped).toHaveLength(1);
    expect(useDietStore.getState().water).toEqual({});
  });

  it('删除某一天', () => {
    useDietStore.setState({ water: { '2026-10-02': 8, '2026-10-03': 6 } });

    const result = applyChange({ module: 'dietWater', key: '2026-10-02', op: 'delete' });

    expect(result.applied).toBe(1);
    expect(useDietStore.getState().water).toEqual({ '2026-10-03': 6 });
  });
});

describe('dietGoals：模块单值', () => {
  it('整块替换', () => {
    const result = applyChange({
      module: 'dietGoals',
      key: 'dietGoals',
      op: 'put',
      record: { calories: 2100, protein: 120 },
    });

    expect(result.applied).toBe(1);
    expect(useDietStore.getState().goals).toEqual({ calories: 2100, protein: 120 });
  });

  it('不产生 delete：收到 delete 就跳过并回报，不把每日目标抹掉', () => {
    useDietStore.setState({ goals: { calories: 2100, protein: 120 } });

    const result = applyChange({ module: 'dietGoals', key: 'dietGoals', op: 'delete' });

    expect(result.applied).toBe(0);
    expect(result.skipped[0]!.reason).toContain('模块单值');
    // 用户的每日目标还在
    expect(useDietStore.getState().goals).toEqual({ calories: 2100, protein: 120 });
  });
});

describe('一批变更', () => {
  it('逐条独立：一条落不下去不影响后面的', () => {
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });

    const result = applyChanges([
      { module: 'tasks', key: 't1', op: 'delete' },
      { module: 'dietWater', key: '2026-10-02', op: 'put', record: { '2026-10-02': {} } },
      { module: 'tasks', key: 't2', op: 'put', record: task('t2', '看论文') },
    ]);

    expect(result.applied).toBe(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.module).toBe('dietWater');
    // 第三条在第二条失败之后照样落了
    expect(useTaskStore.getState().tasks.map((item) => item.id)).toEqual(['t2']);
  });

  it('不在同步单位表里的模块被跳过并回报，不静默', () => {
    const result = applyChange({ module: 'settings', key: 'x', op: 'put', record: {} });

    expect(result.applied).toBe(0);
    expect(result.skipped[0]!.reason).toContain('不在同步单位表');
  });
});

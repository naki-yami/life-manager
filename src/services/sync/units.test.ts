import { beforeEach, describe, expect, it } from 'vitest';
import { useDietStore } from '../../store/dietStore';
import { useTaskStore } from '../../store/taskStore';
import { DEFAULT_DIET_GOALS } from '../../utils/diet';
import { BACKUP_MODULES } from '../schemas';
import { SYNC_UNITS, SYNC_UNIT_BY_MODULE, readUnits, syncUnitModules } from './units';

/*
 * 单元表是「与服务端那份表一致」的可执行版本。这里断言的是**覆盖与 key 取法**，
 * 不测内部函数名 —— 判据来自服务端 spec 的「同步单位」表。
 */

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({ tasks: [], memos: [] });
  useDietStore.setState({
    records: [],
    templates: [],
    goals: { ...DEFAULT_DIET_GOALS },
    water: {},
  });
});

describe('同步单位表与服务端表一致', () => {
  it('覆盖服务端表里的每一个模块，一个不多一个不少', () => {
    expect([...syncUnitModules()].sort()).toEqual([...BACKUP_MODULES].sort());
  });

  it('模块数就是 23 条', () => {
    expect(SYNC_UNITS).toHaveLength(23);
  });

  it('模块名不重复', () => {
    expect(new Set(syncUnitModules()).size).toBe(SYNC_UNITS.length);
  });

  it('每个模块都能按名字查回它的单元', () => {
    for (const unit of SYNC_UNITS) {
      expect(SYNC_UNIT_BY_MODULE.get(unit.module)).toBe(unit);
    }
  });

  it('三种单元类型都在表里：记录集合、日期键映射、模块单值', () => {
    const kinds = new Set(SYNC_UNITS.map((unit) => unit.kind));
    expect(kinds).toEqual(new Set(['collection', 'dateMap', 'singleton']));
    expect(SYNC_UNIT_BY_MODULE.get('dietWater')?.kind).toBe('dateMap');
    expect(SYNC_UNIT_BY_MODULE.get('dietGoals')?.kind).toBe('singleton');
    expect(SYNC_UNIT_BY_MODULE.get('tasks')?.kind).toBe('collection');
  });
});

describe('不同步项一个都不在表里', () => {
  it('没有 settings（每台设备各自的 UI 状态）', () => {
    expect(syncUnitModules()).not.toContain('settings');
  });

  it('专注只同步流水，不同步正在跑的计时器', () => {
    expect(syncUnitModules()).toContain('focusSessions');
    expect(syncUnitModules()).not.toContain('active');
  });

  it('自建库只同步用户创造的两个集合，不同步 recent*Names', () => {
    expect(syncUnitModules()).toContain('customFoods');
    expect(syncUnitModules()).toContain('customExercises');
    expect(syncUnitModules()).not.toContain('recentFoodNames');
    expect(syncUnitModules()).not.toContain('recentExerciseNames');
  });

  it('主题与界面偏好不在表里（仍随备份导出）', () => {
    for (const module of ['theme', 'ui', 'themeMode', 'appearance', 'accent', 'density']) {
      expect(syncUnitModules()).not.toContain(module);
    }
  });
});

describe('readUnits 的 key 取法', () => {
  it('记录集合用记录的 id 当 key', () => {
    useTaskStore.setState({
      tasks: [
        { id: 't1', title: '写周报' },
        { id: 't2', title: '看论文' },
      ] as never,
      memos: [{ id: 'm1', content: '买咖啡豆' }] as never,
    });

    const units = readUnits();

    expect(Object.keys(units.tasks!).sort()).toEqual(['t1', 't2']);
    expect(units.tasks!.t1).toEqual({ id: 't1', title: '写周报' });
    expect(Object.keys(units.memos!)).toEqual(['m1']);
  });

  it('没有 id 的条目被跳过（服务端会拒收，推上去只会让整轮失败）', () => {
    useTaskStore.setState({
      tasks: [{ id: 't1' }, { title: '没有 id' }, { id: '' }, 'nonsense'] as never,
      memos: [],
    });

    expect(Object.keys(readUnits().tasks!)).toEqual(['t1']);
  });

  it('饮水按日期串当 key，值是裸数字', () => {
    useDietStore.setState({ water: { '2026-10-02': 8, '2026-10-03': 6 } });

    expect(readUnits().dietWater).toEqual({ '2026-10-02': 8, '2026-10-03': 6 });
  });

  it('dietGoals 的 key 固定是模块名本身（模块单值）', () => {
    const goals = readUnits().dietGoals;

    expect(Object.keys(goals!)).toEqual(['dietGoals']);
    // 值就是那个模块单值本身
    expect(goals!.dietGoals).toEqual({ calories: 2000, protein: 80 });
  });
});

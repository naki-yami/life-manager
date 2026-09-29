import { beforeEach, describe, expect, it } from 'vitest';
import { useHabitStore } from './habitStore';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { MAX_HABIT_AMOUNT } from '../utils/habits';

const store = () => useHabitStore.getState();
const first = () => store().habits[0]!;

beforeEach(() => {
  localStorage.clear();
  useHabitStore.setState({ habits: [] });
});

describe('habitStore 增删改', () => {
  it('新建习惯会补上默认节奏与空日志', () => {
    store().addHabit({ name: '晨跑' });

    expect(store().habits).toHaveLength(1);
    expect(first()).toMatchObject({
      name: '晨跑',
      kind: 'binary',
      target: 1,
      unit: '',
      schedule: { kind: 'daily', timesPerWeek: 1, everyDays: 1 },
      logs: {},
    });
    expect(first().createdAt).toBeTruthy();
  });

  it('量化习惯保留目标与单位，名字与单位会去空白', () => {
    store().addHabit({
      name: '  喝水  ',
      kind: 'count',
      target: 8,
      unit: ' 杯 ',
      schedule: { kind: 'interval', timesPerWeek: 1, everyDays: 2 },
    });

    expect(first()).toMatchObject({ name: '喝水', kind: 'count', target: 8, unit: '杯' });
    expect(first().schedule).toEqual({ kind: 'interval', timesPerWeek: 1, everyDays: 2 });
  });

  it('binary 习惯的目标量统一记成 1', () => {
    store().addHabit({ name: '冥想', kind: 'binary', target: 5 });
    expect(first().target).toBe(1);
  });

  it('updateHabit 会清洗名字、节奏与日志', () => {
    store().addHabit({ name: '晨跑' });
    const id = first().id;

    store().updateHabit(id, {
      name: '  晨跑 5 公里 ',
      schedule: { kind: 'weekly', timesPerWeek: 99, everyDays: 0 },
      logs: { '2026-09-29': 2, '2026-09-28': 0, bad: 1 },
    });

    expect(first().name).toBe('晨跑 5 公里');
    expect(first().schedule).toEqual({ kind: 'weekly', timesPerWeek: 7, everyDays: 1 });
    expect(first().logs).toEqual({ '2026-09-29': 2 });
  });

  it('deleteHabit 只删指定的那一条', () => {
    store().addHabit({ name: '晨跑' });
    store().addHabit({ name: '读书' });
    const [keep, remove] = store().habits;

    store().deleteHabit(remove!.id);

    expect(store().habits.map((habit) => habit.name)).toEqual([keep!.name]);
  });

  it('replaceHabits 整表写入（撤销与导入在用）', () => {
    store().addHabit({ name: '晨跑' });
    const snapshot = store().habits;

    store().replaceHabits([]);
    expect(store().habits).toHaveLength(0);

    store().replaceHabits(snapshot);
    expect(store().habits).toHaveLength(1);
  });

  it('每次生成的 id 互不重复', () => {
    for (let index = 0; index < 20; index += 1) store().addHabit({ name: `习惯 ${index}` });
    const ids = store().habits.map((habit) => habit.id);
    expect(new Set(ids).size).toBe(20);
  });
});

describe('打卡（点格子）', () => {
  it('binary：点一下达标，再点一下撤销', () => {
    store().addHabit({ name: '晨跑' });
    const id = first().id;

    store().toggleHabitLog(id, '2026-09-29');
    expect(first().logs).toEqual({ '2026-09-29': 1 });

    store().toggleHabitLog(id, '2026-09-29');
    expect(first().logs).toEqual({});
  });

  it('count：一次加一，满目标后再点即清零', () => {
    store().addHabit({ name: '喝水', kind: 'count', target: 3 });
    const id = first().id;

    store().toggleHabitLog(id, '2026-09-29');
    store().toggleHabitLog(id, '2026-09-29');
    expect(first().logs['2026-09-29']).toBe(2);

    store().toggleHabitLog(id, '2026-09-29');
    expect(first().logs['2026-09-29']).toBe(3);

    store().toggleHabitLog(id, '2026-09-29');
    expect(first().logs['2026-09-29']).toBeUndefined();
  });

  it('只动被点的那一天，其它日期原样保留', () => {
    store().addHabit({ name: '晨跑' });
    const id = first().id;

    store().toggleHabitLog(id, '2026-09-27');
    store().toggleHabitLog(id, '2026-09-29');

    expect(first().logs).toEqual({ '2026-09-27': 1, '2026-09-29': 1 });
  });

  it('打卡日志不记 0 值：取消即删键', () => {
    store().addHabit({ name: '晨跑' });
    const id = first().id;

    store().setHabitLog(id, '2026-09-29', 1);
    store().setHabitLog(id, '2026-09-29', 0);

    expect(first().logs).toEqual({});
  });

  it('非法日期与超量输入都会被挡掉', () => {
    store().addHabit({ name: '晨跑' });
    const id = first().id;

    store().setHabitLog(id, '2026/09/29', 1);
    expect(first().logs).toEqual({});

    store().setHabitLog(id, '2026-09-29', 99999);
    expect(first().logs['2026-09-29']).toBe(MAX_HABIT_AMOUNT);
  });
});

describe('持久化与归一化', () => {
  it('写入 lm:habits，日志随习惯一起落盘', () => {
    store().addHabit({ name: '晨跑' });
    store().toggleHabitLog(first().id, '2026-09-29');

    const raw = localStorage.getItem(STORAGE_KEYS.habits);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { state: { habits: Array<{ logs: unknown }> } };
    expect(parsed.state.habits[0]!.logs).toEqual({ '2026-09-29': 1 });
  });

  it('旧数据缺字段时按 schema 补齐（节奏 / 日志 / 单位）', async () => {
    localStorage.setItem(
      STORAGE_KEYS.habits,
      JSON.stringify({
        state: { habits: [{ id: 'h1', name: '喝水', kind: 'count', target: 8 }] },
        version: 11,
      }),
    );

    await useHabitStore.persist.rehydrate();

    const habit = store().habits[0]!;
    expect(habit).toMatchObject({
      id: 'h1',
      name: '喝水',
      target: 8,
      unit: '',
      schedule: { kind: 'daily', timesPerWeek: 1, everyDays: 1 },
      logs: {},
    });
    expect(habit.createdAt).toBeTruthy();
  });

  it('日志里的脏值在归一化时被清掉', async () => {
    localStorage.setItem(
      STORAGE_KEYS.habits,
      JSON.stringify({
        state: {
          habits: [
            {
              id: 'h1',
              name: '晨跑',
              kind: 'binary',
              target: 1,
              unit: '',
              schedule: { kind: 'daily', timesPerWeek: 1, everyDays: 1 },
              logs: { '2026-09-29': 1, '2026-09-28': 'x', oops: 2 },
              createdAt: '2026-09-01T12:00:00',
            },
          ],
        },
        version: 11,
      }),
    );

    await useHabitStore.persist.rehydrate();

    expect(store().habits[0]!.logs).toEqual({ '2026-09-29': 1 });
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { useGoalStore } from './goalStore';
import { STORAGE_KEYS } from '../utils/storageKeys';

const store = () => useGoalStore.getState();
const first = () => store().goals[0]!;

beforeEach(() => {
  localStorage.clear();
  useGoalStore.setState({ goals: [] });
});

describe('goalStore 增删改', () => {
  it('新建目标补上 id 与创建时间，只留「指标 + 周期 + 目标值」', () => {
    store().addGoal({ metric: 'fitness.sessions', period: 'week', target: 4 });

    expect(store().goals).toHaveLength(1);
    expect(first()).toMatchObject({
      metric: 'fitness.sessions',
      period: 'week',
      target: 4,
    });
    expect(first().id).toBeTruthy();
    expect(first().createdAt).toBeTruthy();
    // 进度不落库
    expect(Object.keys(first()).sort()).toEqual(['createdAt', 'id', 'metric', 'period', 'target']);
  });

  it('新增不会碰到已有目标', () => {
    store().addGoal({ metric: 'fitness.sessions', period: 'week', target: 4 });
    const id = first().id;
    store().addGoal({ metric: 'reading.minutes', period: 'month', target: 600 });

    expect(store().goals).toHaveLength(2);
    expect(store().goals[0]!.id).toBe(id);
    expect(store().goals[0]!.target).toBe(4);
  });

  it('updateGoal 只改命中 id 的那一条', () => {
    store().addGoal({ metric: 'fitness.sessions', period: 'week', target: 4 });
    store().addGoal({ metric: 'reading.minutes', period: 'month', target: 600 });
    const [a, b] = store().goals;

    store().updateGoal(a!.id, { target: 6 });

    expect(store().goals[0]).toMatchObject({ id: a!.id, target: 6, metric: 'fitness.sessions' });
    expect(store().goals[1]).toEqual(b);
  });

  it('updateGoal 认不出的 id 不会改动任何东西', () => {
    store().addGoal({ metric: 'fitness.sessions', period: 'week', target: 4 });
    const before = store().goals;

    store().updateGoal('nope', { target: 99 });

    expect(store().goals).toEqual(before);
  });

  it('removeGoal 只删这一条', () => {
    store().addGoal({ metric: 'fitness.sessions', period: 'week', target: 4 });
    store().addGoal({ metric: 'reading.minutes', period: 'month', target: 600 });
    const id = first().id;

    store().removeGoal(id);

    expect(store().goals).toHaveLength(1);
    expect(store().goals[0]!.metric).toBe('reading.minutes');
  });

  it('replaceGoals 整表替换，用于导入与删除撤销', () => {
    store().addGoal({ metric: 'fitness.sessions', period: 'week', target: 4 });
    const snapshot = store().goals;

    store().replaceGoals([]);
    expect(store().goals).toEqual([]);

    store().replaceGoals(snapshot);
    expect(store().goals).toEqual(snapshot);
  });
});

describe('goalStore 持久化', () => {
  it('数据落在 lm:goals 上', () => {
    store().addGoal({ metric: 'fitness.sessions', period: 'week', target: 4 });

    const raw = localStorage.getItem(STORAGE_KEYS.goals);
    expect(raw).toBeTruthy();
    expect(raw).toContain('fitness.sessions');
  });

  it('旧数据缺字段时补齐成当前结构', async () => {
    localStorage.setItem(
      STORAGE_KEYS.goals,
      JSON.stringify({ state: { goals: [{ id: 'g1', metric: 'fitness.sessions' }] }, version: 11 }),
    );

    await useGoalStore.persist.rehydrate();

    expect(first()).toMatchObject({
      id: 'g1',
      metric: 'fitness.sessions',
      period: 'week',
      target: 1,
    });
    expect(first().createdAt).toBeTruthy();
  });

  it('认不出的指标、非法目标值与不成形的条目在归一化时被处理掉', async () => {
    localStorage.setItem(
      STORAGE_KEYS.goals,
      JSON.stringify({
        state: {
          goals: [
            { id: 'ok', metric: 'focus.minutes', period: 'day', target: 60 },
            { id: 'bad-metric', metric: 'diet.averageCalories', period: 'day', target: 2000 },
            { id: 'bad-target', metric: 'dev.hours', period: 'week', target: 0 },
            'nonsense',
            42,
          ],
        },
        version: 11,
      }),
    );

    await useGoalStore.persist.rehydrate();

    expect(store().goals.map((goal) => goal.id)).toEqual(['ok', 'bad-target']);
    expect(store().goals[1]).toMatchObject({ metric: 'dev.hours', period: 'week', target: 1 });
  });

  it('完全没有 goals 字段的老数据得到空数组，不会崩', async () => {
    localStorage.setItem(STORAGE_KEYS.goals, JSON.stringify({ state: {}, version: 11 }));

    await useGoalStore.persist.rehydrate();

    expect(store().goals).toEqual([]);
  });
});

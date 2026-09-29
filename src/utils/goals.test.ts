import { describe, expect, it } from 'vitest';
import type { Goal, GoalMetric, GoalPeriod, Habit, Task, WorkoutRecord } from '../types';
import {
  GOAL_PERIODS,
  GOAL_PERIOD_LABELS,
  findGoalConflict,
  goalGapText,
  goalMetricLabel,
  goalPercent,
  goalProgress,
  goalRange,
  goalRangeLabel,
  goalValueText,
  groupGoalsByPeriod,
  sortGoals,
  summarizeGoals,
  type GoalProgress,
} from './goals';
import { periodLabel } from './review';
import type { MetricSnapshot } from './metrics';

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  metric: 'fitness.sessions',
  period: 'week',
  target: 4,
  createdAt: '2026-09-01T12:00:00',
  ...overrides,
});

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  title: '写周报',
  description: '',
  priority: 'medium',
  status: 'pending',
  dueDate: '',
  subtasks: [],
  repeat: null,
  timebox: null,
  tags: [],
  createdAt: '2026-09-28T09:00:00',
  ...overrides,
});

const workout = (overrides: Partial<WorkoutRecord> = {}): WorkoutRecord => ({
  id: 'w1',
  date: '2026-09-28',
  planName: '推日',
  exercises: [],
  notes: '',
  tags: [],
  createdAt: '2026-09-28T20:00:00',
  ...overrides,
});

const habit = (overrides: Partial<Habit> = {}): Habit => ({
  id: 'h1',
  name: '晨跑',
  kind: 'binary',
  target: 1,
  unit: '',
  schedule: { kind: 'daily', timesPerWeek: 1, everyDays: 1 },
  logs: {},
  createdAt: '2026-09-01T12:00:00',
  ...overrides,
});

const snapshot = (overrides: Partial<MetricSnapshot> = {}): MetricSnapshot => ({
  tasks: [],
  focusSessions: [],
  fitnessRecords: [],
  readingSessions: [],
  dietRecords: [],
  habits: [],
  workSessions: [],
  ...overrides,
});

describe('goalRange', () => {
  it('每日就是当天一天', () => {
    expect(goalRange('day', '2026-09-29')).toEqual({ start: '2026-09-29', end: '2026-09-29' });
  });

  it('每周从周一到周日，跨年也对', () => {
    // 2026-09-29 是周二，所在周是 09-28（周一）– 10-04（周日）
    expect(goalRange('week', '2026-09-29')).toEqual({ start: '2026-09-28', end: '2026-10-04' });
    // 2026-12-31 是周四，所在周跨进 2027 年
    expect(goalRange('week', '2026-12-31')).toEqual({ start: '2026-12-28', end: '2027-01-03' });
  });

  it('每月从 1 号到月末，30 / 31 / 28 天都对', () => {
    expect(goalRange('month', '2026-09-15')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(goalRange('month', '2026-10-01')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(goalRange('month', '2027-02-10')).toEqual({ start: '2027-02-01', end: '2027-02-28' });
    // 12 月跨到次年 1 月前后都不能串月
    expect(goalRange('month', '2026-12-31')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });
});

describe('goalRangeLabel', () => {
  it('日 / 周沿用复盘的文案，月单列', () => {
    expect(goalRangeLabel('day', '2026-09-29')).toBe(periodLabel('day', '2026-09-29'));
    expect(goalRangeLabel('week', '2026-09-29')).toBe(periodLabel('week', '2026-09-28'));
    expect(goalRangeLabel('month', '2026-09-15')).toBe('9 月');
  });
});

describe('goalProgress', () => {
  it('落在当前周期内的记录才计入，超额也算达成', () => {
    const data = snapshot({
      fitnessRecords: [
        workout({ id: 'w1', date: '2026-09-28' }),
        workout({ id: 'w2', date: '2026-09-30' }),
        // 上一条周的记录不该被算进本周
        workout({ id: 'w3', date: '2026-09-21' }),
      ],
    });

    const progress = goalProgress(goal({ target: 2 }), data, '2026-09-29');

    expect(progress).toMatchObject({ current: 2, target: 2, reached: true });
    expect(progress.rate).toBe(1);
  });

  it('还没到的目标 reached 是 false，rate 是当前比目标', () => {
    const data = snapshot({ fitnessRecords: [workout({ date: '2026-09-28' })] });
    const progress = goalProgress(goal({ target: 4 }), data, '2026-09-29');

    expect(progress.reached).toBe(false);
    expect(progress.rate).toBe(0.25);
  });

  it('目标值非法时按 0 处理，不会算出 Infinity', () => {
    const progress = goalProgress(goal({ target: 0 }), snapshot(), '2026-09-29');

    expect(progress.rate).toBe(0);
    expect(progress.reached).toBe(true);
  });

  it('习惯完成率目标按百分比比大小', () => {
    const data = snapshot({
      habits: [habit({ logs: { '2026-09-28': 1, '2026-09-29': 1 } })],
    });
    const progress = goalProgress(
      goal({ metric: 'habit.rate', period: 'day', target: 80 }),
      data,
      '2026-09-29',
    );

    expect(progress.current).toBe(100);
    expect(progress.reached).toBe(true);
  });
});

describe('findGoalConflict', () => {
  const goals = [
    goal({ id: 'a', metric: 'fitness.sessions', period: 'week' }),
    goal({ id: 'b', metric: 'fitness.sessions', period: 'month' }),
    goal({ id: 'c', metric: 'reading.minutes', period: 'week' }),
  ];

  it('同指标同周期才算冲突', () => {
    expect(findGoalConflict(goals, 'fitness.sessions', 'week')?.id).toBe('a');
    expect(findGoalConflict(goals, 'fitness.sessions', 'day')).toBeUndefined();
  });

  it('编辑时放过自己', () => {
    expect(findGoalConflict(goals, 'fitness.sessions', 'week', 'a')).toBeUndefined();
    expect(findGoalConflict(goals, 'fitness.sessions', 'week', 'c')?.id).toBe('a');
  });
});

describe('sortGoals', () => {
  it('按 registry 的顺序排，与添加早晚无关', () => {
    const sorted = sortGoals([
      goal({ id: 'a', metric: 'habit.rate' }),
      goal({ id: 'b', metric: 'reading.minutes' }),
      goal({ id: 'c', metric: 'tasks.completed' }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(['c', 'b', 'a']);
  });

  it('不改动传进来的数组', () => {
    const input = [
      goal({ id: 'a', metric: 'habit.rate' }),
      goal({ id: 'b', metric: 'tasks.completed' }),
    ];
    sortGoals(input);

    expect(input.map((item) => item.id)).toEqual(['a', 'b']);
  });
});

describe('groupGoalsByPeriod', () => {
  it('固定「每日 / 每周 / 每月」的顺序，空组不出现', () => {
    const groups = groupGoalsByPeriod([
      goal({ id: 'm', period: 'month' }),
      goal({ id: 'd', period: 'day' }),
      goal({ id: 'w', period: 'week' }),
    ]);

    expect(groups.map((group) => group.period)).toEqual(['day', 'week', 'month']);

    const onlyWeek = groupGoalsByPeriod([goal({ period: 'week' })]);
    expect(onlyWeek.map((group) => group.period)).toEqual(['week']);
  });

  it('组内同样按 registry 顺序排', () => {
    const groups = groupGoalsByPeriod([
      goal({ id: 'late', period: 'week', metric: 'habit.rate' }),
      goal({ id: 'early', period: 'week', metric: 'tasks.completed' }),
    ]);

    expect(groups[0]!.goals.map((item) => item.id)).toEqual(['early', 'late']);
  });

  it('没有目标时返回空数组', () => {
    expect(groupGoalsByPeriod([])).toEqual([]);
  });
});

describe('summarizeGoals', () => {
  it('数出达成的条数与总数', () => {
    const items: GoalProgress[] = [
      { goal: goal({ id: 'a' }), current: 5, target: 4, rate: 1.25, reached: true },
      { goal: goal({ id: 'b' }), current: 1, target: 4, rate: 0.25, reached: false },
    ];

    expect(summarizeGoals(items)).toEqual({ reached: 1, total: 2 });
    expect(summarizeGoals([])).toEqual({ reached: 0, total: 0 });
  });
});

describe('展示文本', () => {
  const progress = (overrides: Partial<GoalProgress> = {}): GoalProgress => ({
    goal: goal({ metric: 'focus.minutes', target: 120 }),
    current: 45,
    target: 120,
    rate: 0.375,
    reached: false,
    ...overrides,
  });

  it('goalValueText 把当前值与目标值各按指标格式化', () => {
    expect(goalValueText(progress())).toBe('45 分钟 / 2 小时');
  });

  it('goalGapText 未达成时给差值，达成时给一句肯定而不会出现负数', () => {
    expect(goalGapText(progress())).toBe('1 小时 15 分');
    expect(goalGapText(progress({ current: 200, reached: true, rate: 1.67 }))).toBe('已达成');
  });

  it('goalPercent 夹在 0–100 并四舍五入', () => {
    expect(goalPercent(progress({ rate: 0.375 }))).toBe(38);
    expect(goalPercent(progress({ rate: 1.4 }))).toBe(100);
    expect(goalPercent(progress({ rate: -0.5 }))).toBe(0);
  });

  it('goalMetricLabel 读的是 registry 的展示名', () => {
    expect(goalMetricLabel(goal({ metric: 'tasks.completed' }))).toBe('完成任务');
    expect(goalMetricLabel(goal({ metric: 'dev.hours' }))).toBe('开发工时');
  });
});

describe('常量', () => {
  it('周期顺序与名称固定', () => {
    expect(GOAL_PERIODS).toEqual(['day', 'week', 'month']);
    expect(GOAL_PERIOD_LABELS).toEqual({ day: '每日', week: '每周', month: '每月' });
  });

  it('GoalPeriod / GoalMetric 的字面量都在预期集合里', () => {
    const periods: GoalPeriod[] = ['day', 'week', 'month'];
    const metrics: GoalMetric[] = [
      'tasks.completed',
      'focus.minutes',
      'fitness.sessions',
      'reading.minutes',
      'dev.hours',
      'habit.rate',
    ];
    expect(periods).toHaveLength(GOAL_PERIODS.length);
    expect(metrics).toHaveLength(6);
  });

  it('task 与 habit 辅助工厂能编出合法对象（供上面的用例使用）', () => {
    expect(task({ status: 'completed' }).status).toBe('completed');
    expect(habit({ logs: { '2026-09-28': 1 } }).logs['2026-09-28']).toBe(1);
  });
});

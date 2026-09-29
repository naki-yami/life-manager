import { describe, expect, it } from 'vitest';
import type {
  FocusSession,
  Habit,
  MealRecord,
  ReadingSession,
  Task,
  WorkoutRecord,
  WorkSession,
} from '../types';
import {
  GOAL_METRIC_IDS,
  METRICS,
  formatMetricValue,
  isGoalMetric,
  metricValue,
  type MetricRange,
  type MetricSnapshot,
} from './metrics';

/** 2026-09-28 是周一，2026-10-04 是周日 */
const WEEK: MetricRange = { start: '2026-09-28', end: '2026-10-04' };

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

const focusSession = (overrides: Partial<FocusSession> = {}): FocusSession => ({
  id: 'f1',
  date: '2026-09-28',
  entityId: 't1',
  title: '写方案',
  target: 'task',
  mode: 'pomodoro',
  plannedMinutes: 25,
  minutes: 25,
  startedAt: '2026-09-28T09:00:00',
  endedAt: '2026-09-28T09:25:00',
  posted: false,
  createdAt: '2026-09-28T09:25:00',
  ...overrides,
});

const workout = (overrides: Partial<WorkoutRecord> = {}): WorkoutRecord => ({
  id: 'w1',
  date: '2026-09-28',
  planName: '推日',
  exercises: [{ name: '杠铃卧推', sets: 5, reps: 5, weight: 60 }],
  notes: '',
  tags: [],
  createdAt: '2026-09-28T20:00:00',
  ...overrides,
});

const reading = (overrides: Partial<ReadingSession> = {}): ReadingSession => ({
  id: 'r1',
  bookId: 'b1',
  date: '2026-09-28',
  minutes: 30,
  note: '',
  createdAt: '2026-09-28T21:00:00',
  ...overrides,
});

const meal = (overrides: Partial<MealRecord> = {}): MealRecord => ({
  id: 'm1',
  date: '2026-09-28',
  type: 'lunch',
  items: [],
  totalCalories: 600,
  tags: [],
  totalProtein: 0,
  totalCarbs: 0,
  totalFat: 0,
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

const workSession = (overrides: Partial<WorkSession> = {}): WorkSession => ({
  id: 's1',
  projectId: 'd1',
  date: '2026-09-28',
  hours: 2,
  note: '',
  createdAt: '2026-09-28T18:00:00',
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

describe('METRICS registry', () => {
  it('每个指标都能在自己的区间里算出数', () => {
    const data = snapshot({
      tasks: [
        task({ id: 't1', status: 'completed', completedAt: '2026-09-29T10:00:00' }),
        task({ id: 't2', status: 'completed', completedAt: '2026-09-30T10:00:00' }),
      ],
      focusSessions: [focusSession({ minutes: 25 }), focusSession({ id: 'f2', minutes: 35 })],
      fitnessRecords: [workout(), workout({ id: 'w2', date: '2026-10-01' })],
      readingSessions: [reading({ minutes: 30 }), reading({ id: 'r2', minutes: 45 })],
      dietRecords: [
        meal({ totalCalories: 600 }),
        meal({ id: 'm2', date: '2026-09-29', totalCalories: 800 }),
      ],
      workSessions: [workSession({ hours: 2 }), workSession({ id: 's2', hours: 3.5 })],
    });

    expect(metricValue('tasks.completed', data, WEEK)).toBe(2);
    expect(metricValue('focus.minutes', data, WEEK)).toBe(60);
    expect(metricValue('fitness.sessions', data, WEEK)).toBe(2);
    expect(metricValue('reading.minutes', data, WEEK)).toBe(75);
    expect(metricValue('dev.hours', data, WEEK)).toBe(5.5);
    // 两天各记了一餐：按「记过的天数」平均，而不是按区间长度
    expect(metricValue('diet.averageCalories', data, WEEK)).toBe(700);
  });

  it('区间是闭区间：边界那天算进来，区间外的流水一条也不碰', () => {
    const data = snapshot({
      tasks: [
        task({ id: 'start', status: 'completed', completedAt: '2026-09-28T00:00:00' }),
        task({ id: 'end', status: 'completed', completedAt: '2026-10-04T23:59:00' }),
        task({ id: 'before', status: 'completed', completedAt: '2026-09-27T10:00:00' }),
        task({ id: 'after', status: 'completed', completedAt: '2026-10-05T10:00:00' }),
      ],
      focusSessions: [
        focusSession({ id: 'in', date: '2026-10-04', minutes: 10 }),
        focusSession({ id: 'out', date: '2026-10-05', minutes: 999 }),
      ],
      fitnessRecords: [workout({ id: 'out', date: '2026-09-20' })],
      readingSessions: [reading({ id: 'out', date: '2026-09-27' })],
      workSessions: [workSession({ id: 'out', date: '2026-10-06' })],
    });

    expect(metricValue('tasks.completed', data, WEEK)).toBe(2);
    expect(metricValue('focus.minutes', data, WEEK)).toBe(10);
    expect(metricValue('fitness.sessions', data, WEEK)).toBe(0);
    expect(metricValue('reading.minutes', data, WEEK)).toBe(0);
    expect(metricValue('dev.hours', data, WEEK)).toBe(0);
  });

  it('完成任务只认已完成的：待办与没有完成时间的都不算', () => {
    const data = snapshot({
      tasks: [
        task({ id: 'a', status: 'completed' }),
        task({ id: 'b', status: 'pending', completedAt: '2026-09-29T10:00:00' }),
        task({ id: 'c', status: 'completed', completedAt: undefined }),
      ],
    });

    expect(metricValue('tasks.completed', data, WEEK)).toBe(0);
  });

  it('热量日均按「记过的天数」平均，一天没记就是 0 而不是被拉低', () => {
    expect(metricValue('diet.averageCalories', snapshot(), WEEK)).toBe(0);

    // 同一天两餐合计 1200，仍只算一天
    const sameDay = snapshot({
      dietRecords: [meal({ totalCalories: 500 }), meal({ id: 'm2', totalCalories: 700 })],
    });
    expect(metricValue('diet.averageCalories', sameDay, WEEK)).toBe(1200);

    // 两天分别记了 500 与 700，平均 600
    const twoDays = snapshot({
      dietRecords: [
        meal({ totalCalories: 500 }),
        meal({ id: 'm2', date: '2026-09-29', totalCalories: 700 }),
      ],
    });
    expect(metricValue('diet.averageCalories', twoDays, WEEK)).toBe(600);
  });

  it('习惯完成率走 habits.habitProgress，换算成百分比', () => {
    const data = snapshot({
      habits: [habit({ logs: { '2026-09-28': 1, '2026-09-29': 1 } })],
    });

    // 两天各一次晨跑，两天都到了
    expect(metricValue('habit.rate', data, { start: '2026-09-28', end: '2026-09-29' })).toBe(100);

    const half = snapshot({ habits: [habit({ logs: { '2026-09-28': 1 } })] });
    expect(metricValue('habit.rate', half, { start: '2026-09-28', end: '2026-09-29' })).toBe(50);
    // 区间里没有到期项时不除零
    expect(metricValue('habit.rate', snapshot(), WEEK)).toBe(0);
  });
});

describe('formatMetricValue', () => {
  it('带单位的指标拼上单位', () => {
    expect(formatMetricValue('tasks.completed', 12)).toBe('12 件');
    expect(formatMetricValue('fitness.sessions', 4)).toBe('4 次');
    expect(formatMetricValue('habit.rate', 36.4)).toBe('36%');
  });

  it('时长类指标由格式函数自带单位，不再重复拼接', () => {
    expect(formatMetricValue('focus.minutes', 85)).toBe('1 小时 25 分');
    expect(formatMetricValue('reading.minutes', 30)).toBe('30 分钟');
    expect(formatMetricValue('dev.hours', 2)).toBe('2 小时');
  });
});

describe('GOAL_METRIC_IDS', () => {
  it('不包含「越低越好」的热量日均，其余指标都在', () => {
    expect(GOAL_METRIC_IDS).not.toContain('diet.averageCalories');
    expect(GOAL_METRIC_IDS).toContain('tasks.completed');
    expect(GOAL_METRIC_IDS).toHaveLength(6);
  });

  it('每个可选目标指标都有展示名、单位与三个周期的建议值', () => {
    for (const id of GOAL_METRIC_IDS) {
      const definition = METRICS[id];
      expect(definition.id).toBe(id);
      expect(definition.label).not.toBe('');
      for (const period of ['day', 'week', 'month'] as const) {
        expect(definition.suggested[period]).toBeGreaterThan(0);
      }
    }
  });

  it('isGoalMetric 认得出合法指标、挡得住其余值', () => {
    expect(isGoalMetric('fitness.sessions')).toBe(true);
    expect(isGoalMetric('diet.averageCalories')).toBe(false);
    expect(isGoalMetric('nope')).toBe(false);
    expect(isGoalMetric(undefined)).toBe(false);
    expect(isGoalMetric(42)).toBe(false);
  });
});

import type {
  FocusSession,
  GoalMetric,
  GoalPeriod,
  Habit,
  MealRecord,
  ReadingSession,
  Task,
  WorkSession,
  WorkoutRecord,
} from '../types';
import { dayKeyOf, daysInRange, formatDuration } from './date';
import { formatFocusDuration } from './focus';
import { habitProgress } from './habits';

/**
 * 指标取数的唯一实现。
 *
 * 为什么要有这一层：同一个「训练了几次」以前会在复盘页、统计页、目标卡里各算一遍，
 * 三处只要有一处忘了按区间裁、忘了过滤没完成的记录，数字就对不上，
 * 而且没人知道哪一处才是对的。于是所有跨模块取数都收进这张表，
 * 每个指标只说两件事：**怎么从流水里算出一个数**、**算出来的数怎么显示**。
 *
 * 与 `review.ts` 的分工：这里只管数字。footer 文案（「其中紧急 1 件」）
 * 与配色仍留在各自页面 —— 硬塞进 registry 只会让它长成一个万能但不透明的对象。
 *
 * 与 `goals.ts` 的分工：这里只回答「这段时间是多少」，不回答「离目标还差多少」。
 */

/** 一条指标能看到的全部流水 */
export interface MetricSnapshot {
  tasks: readonly Task[];
  focusSessions: readonly FocusSession[];
  fitnessRecords: readonly WorkoutRecord[];
  readingSessions: readonly ReadingSession[];
  dietRecords: readonly MealRecord[];
  habits: readonly Habit[];
  workSessions: readonly WorkSession[];
}

/** 取数区间，含首含尾 */
export interface MetricRange {
  start: string;
  end: string;
}

/** registry 的键；比 `GoalMetric` 多出「不适合当目标」的指标 */
export type MetricId = GoalMetric | 'diet.averageCalories';

export interface MetricDefinition {
  id: MetricId;
  /** 展示名 */
  label: string;
  /** 计量单位；空串表示格式里已经带了单位（如「1 小时 25 分」） */
  unit: string;
  /** 新建目标时按周期预填的建议值 */
  suggested: Record<GoalPeriod, number>;
  /** 数值 → 展示文本 */
  format: (value: number) => string;
  /** 取数：给定流水与闭区间，返回一个数 */
  value: (snapshot: MetricSnapshot, range: MetricRange) => number;
}

const within = (day: string, range: MetricRange): boolean => day >= range.start && day <= range.end;

const count = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0);

export const METRICS: Record<MetricId, MetricDefinition> = {
  'tasks.completed': {
    id: 'tasks.completed',
    label: '完成任务',
    unit: '件',
    suggested: { day: 3, week: 15, month: 60 },
    format: (value) => String(value),
    value: (snapshot, range) =>
      snapshot.tasks.filter((task) => {
        if (task.status !== 'completed') return false;
        const day = dayKeyOf(task.completedAt);
        return day !== undefined && within(day, range);
      }).length,
  },
  'focus.minutes': {
    id: 'focus.minutes',
    label: '专注时长',
    unit: '',
    suggested: { day: 60, week: 300, month: 1200 },
    format: formatFocusDuration,
    value: (snapshot, range) =>
      count(
        snapshot.focusSessions
          .filter((session) => within(session.date, range))
          .map((session) => session.minutes),
      ),
  },
  'fitness.sessions': {
    id: 'fitness.sessions',
    label: '训练次数',
    unit: '次',
    suggested: { day: 1, week: 4, month: 16 },
    format: (value) => String(value),
    value: (snapshot, range) =>
      snapshot.fitnessRecords.filter((record) => within(record.date, range)).length,
  },
  'reading.minutes': {
    id: 'reading.minutes',
    label: '阅读时长',
    unit: '',
    suggested: { day: 30, week: 150, month: 600 },
    format: formatFocusDuration,
    value: (snapshot, range) =>
      count(
        snapshot.readingSessions
          .filter((session) => within(session.date, range))
          .map((session) => session.minutes),
      ),
  },
  'dev.hours': {
    id: 'dev.hours',
    label: '开发工时',
    unit: '',
    suggested: { day: 2, week: 10, month: 40 },
    format: formatDuration,
    value: (snapshot, range) =>
      count(
        snapshot.workSessions
          .filter((session) => within(session.date, range))
          .map((session) => session.hours),
      ),
  },
  'habit.rate': {
    id: 'habit.rate',
    label: '习惯完成率',
    unit: '%',
    // 完成率的目标本身就按百分比给，跟周期无关
    suggested: { day: 80, week: 80, month: 80 },
    format: (value) => String(Math.round(value)),
    value: (snapshot, range) =>
      habitProgress(snapshot.habits, daysInRange(range.start, range.end)).rate * 100,
  },
  'diet.averageCalories': {
    id: 'diet.averageCalories',
    label: '热量日均',
    unit: 'kcal',
    suggested: { day: 2000, week: 2000, month: 2000 },
    format: (value) => String(Math.round(value)),
    value: (snapshot, range) => {
      const meals = snapshot.dietRecords.filter((record) => within(record.date, range));
      const days = new Set(meals.map((record) => record.date));
      // 只按「记过的天数」平均：漏记的那天不是 0 卡，算进去等于凭空拉低
      if (days.size === 0) return 0;
      return count(meals.map((record) => record.totalCalories)) / days.size;
    },
  },
};

/**
 * 可以拿来设目标的指标，顺序即界面下拉的顺序。
 *
 * 「热量日均」不在这里：它越低越好，而 `达成率 = 当前值 / 目标值` 只对越高越好成立。
 */
export const GOAL_METRIC_IDS: readonly GoalMetric[] = [
  'tasks.completed',
  'focus.minutes',
  'fitness.sessions',
  'reading.minutes',
  'dev.hours',
  'habit.rate',
];

export function isGoalMetric(value: unknown): value is GoalMetric {
  return typeof value === 'string' && (GOAL_METRIC_IDS as readonly string[]).includes(value);
}

/** 取一个指标在区间内的数值 */
export function metricValue(id: MetricId, snapshot: MetricSnapshot, range: MetricRange): number {
  return METRICS[id].value(snapshot, range);
}

/** 数值 + 单位拼成一行文本，例如「12 件」「1 小时 25 分」「36%」 */
export function formatMetricValue(id: MetricId, value: number): string {
  const definition = METRICS[id];
  const text = definition.format(value);
  if (!definition.unit) return text;
  return definition.unit === '%' ? `${text}%` : `${text} ${definition.unit}`;
}

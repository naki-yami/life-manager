import type { Goal, GoalMetric, GoalPeriod } from '../types';
import { addDays, formatMonthLabel } from './date';
import { weekStartOf } from './habits';
import {
  GOAL_METRIC_IDS,
  METRICS,
  formatMetricValue,
  metricValue,
  type MetricRange,
  type MetricSnapshot,
} from './metrics';
import { monthStartKey } from './stats';
import { periodLabel } from './review';

/**
 * 目标的纯计算。
 *
 * 与 `metrics.ts` 的分工：那边回答「这段时间是多少」，这里回答「离目标还差多少」。
 * 达成率永远现算，不落库 —— 数据一变动，存下来的百分比就开始撒谎。
 */

export const GOAL_PERIODS: readonly GoalPeriod[] = ['day', 'week', 'month'];

export const GOAL_PERIOD_LABELS: Record<GoalPeriod, string> = {
  day: '每日',
  week: '每周',
  month: '每月',
};

/** 目标周期覆盖的区间（含首含尾） */
export function goalRange(period: GoalPeriod, day: string): MetricRange {
  if (period === 'day') return { start: day, end: day };
  if (period === 'week') {
    const start = weekStartOf(day);
    return { start, end: addDays(start, 6) };
  }
  const start = monthStartKey(day);
  // 下个月的 1 号往前一天就是本月最后一天；+32 天必然落进下个月
  return { start, end: addDays(monthStartKey(addDays(start, 32)), -1) };
}

/**
 * 周期的说法：日 / 周沿用复盘的口径，月单列。
 *
 * 起点取 `goalRange()` 算出来的那一个 —— 周三打开页面时标题也要写
 * 「9 月 28 日 – 10 月 4 日」，跟进度实际统计的区间一致，否则标题和数字对不上。
 */
export function goalRangeLabel(period: GoalPeriod, day: string): string {
  const { start } = goalRange(period, day);
  if (period === 'month') return formatMonthLabel(start);
  return periodLabel(period, start);
}

export interface GoalProgress {
  goal: Goal;
  current: number;
  target: number;
  /** 0–1；目标值非法时按 0 处理，避免除零 */
  rate: number;
  reached: boolean;
}

/**
 * 一个目标在这段时间走到了哪一步。
 *
 * `>=` 而不是 `===`：超额完成也算达成 —— 「每周训练 4 次」练了 5 次，
 * 不该因为多练一次就变成没达标。
 */
export function goalProgress(goal: Goal, snapshot: MetricSnapshot, day: string): GoalProgress {
  const current = metricValue(goal.metric, snapshot, goalRange(goal.period, day));
  const target = goal.target;
  const rate = target > 0 ? current / target : 0;
  return { goal, current, target, rate, reached: current >= target };
}

/** 找出会与「指标 + 周期」冲突的那一条；`exceptId` 用于编辑时放过自己 */
export function findGoalConflict(
  goals: readonly Goal[],
  metric: GoalMetric,
  period: GoalPeriod,
  exceptId?: string,
): Goal | undefined {
  return goals.find(
    (goal) => goal.metric === metric && goal.period === period && goal.id !== exceptId,
  );
}

/** 按 registry 的顺序排，界面上的目标不会因为添加早晚而跳来跳去 */
export function sortGoals(goals: readonly Goal[]): Goal[] {
  const rank = (goal: Goal): number => GOAL_METRIC_IDS.indexOf(goal.metric);
  return [...goals].sort((a, b) => rank(a) - rank(b));
}

/** 按周期分组，空组不出现；顺序固定为「每日 / 每周 / 每月」 */
export function groupGoalsByPeriod(
  goals: readonly Goal[],
): Array<{ period: GoalPeriod; goals: Goal[] }> {
  return GOAL_PERIODS.map((period) => ({
    period,
    goals: sortGoals(goals.filter((goal) => goal.period === period)),
  })).filter((group) => group.goals.length > 0);
}

export function summarizeGoals(items: readonly GoalProgress[]): {
  reached: number;
  total: number;
} {
  return { reached: items.filter((item) => item.reached).length, total: items.length };
}

/** 「1 小时 15 分 / 5 小时」，进度条下面那行字 */
export function goalValueText(progress: GoalProgress): string {
  const current = formatMetricValue(progress.goal.metric, progress.current);
  const target = formatMetricValue(progress.goal.metric, progress.target);
  return `${current} / ${target}`;
}

/** 还差多少；已达成时给一句肯定，不显示负数的「还差 -2」 */
export function goalGapText(progress: GoalProgress): string {
  if (progress.reached) return '已达成';
  const gap = Math.max(0, progress.target - progress.current);
  return formatMetricValue(progress.goal.metric, gap);
}

/** 达成率百分比，用于圆环中央与无障碍标签 */
export function goalPercent(progress: GoalProgress): number {
  return Math.round(Math.min(1, Math.max(0, progress.rate)) * 100);
}

/** 指标展示名，避免各处再去 registry 里查一遍 */
export function goalMetricLabel(goal: Goal): string {
  return METRICS[goal.metric].label;
}

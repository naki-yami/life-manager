import type { DevProject, ReviewEntry, ReviewPeriod, WorkSession, WritingProject } from '../types';
import { addDays, dayKeyOf, daysBetween, daysInRange, formatDayLabel, isDayKey } from './date';
import { habitProgress, weekStartOf } from './habits';
import {
  METRICS,
  metricValue,
  type MetricId,
  type MetricRange,
  type MetricSnapshot,
} from './metrics';

/**
 * 复盘的纯计算。
 *
 * 三个约定：
 * - **周期用一个起点表示**：日复盘是当天，周复盘是那周的周一。有了起点，区间、
 *   上/下周期、标题、查重都能推出来，不必在数据里存「起止两个日期」再担心它们不自洽；
 * - **汇总永远现算**：完成任务数、训练次数这些不落库，每次都从各模块流水重算 ——
 *   存下来的数字会在数据变动之后悄悄撒谎；
 * - **只回答三个问题**：复盘的价值在写下判断，不在多填几个字段。
 */

/** 复盘周期的展示顺序：先看这周，再落到今天 */
export const REVIEW_PERIODS: readonly ReviewPeriod[] = ['week', 'day'];

export const REVIEW_PERIOD_LABELS: Record<ReviewPeriod, string> = {
  day: '每日复盘',
  week: '每周复盘',
};

/** 多久没动就算「停滞」：两周足够看出是搁置而不是这周没空 */
export const STALLED_DAYS = 14;

/** 三个固定问题的字段顺序 */
export const REVIEW_ANSWERS = ['best', 'blocker', 'next'] as const;

export interface ReviewQuestions {
  best: string;
  blocker: string;
  next: string;
}

/** 三个固定问题的文案；周与日的措辞不同，避免出现「今天的本周」 */
export function reviewQuestions(period: ReviewPeriod): ReviewQuestions {
  return period === 'week'
    ? { best: '本周最有价值的一件事', blocker: '本周最大的阻碍', next: '下周最重要的事' }
    : { best: '今天最有价值的一件事', blocker: '今天最大的阻碍', next: '明天最重要的事' };
}

/** 周期起始日：周复盘落在周一（与习惯打卡同一套口径），日复盘就是当天 */
export function periodStartOf(period: ReviewPeriod, day: string): string {
  return period === 'week' ? weekStartOf(day) : day;
}

/** 周期结束日（含）：周一 + 6 天 / 当天 */
export function periodEndOf(period: ReviewPeriod, start: string): string {
  return addDays(start, period === 'week' ? 6 : 0);
}

/** 周期覆盖的每一天（含首含尾），汇总与完成率都按它算 */
export function periodDays(period: ReviewPeriod, start: string): string[] {
  const length = period === 'week' ? 7 : 1;
  return Array.from({ length }, (_, offset) => addDays(start, offset));
}

/** 前后挪一个周期：周挪 7 天，日挪 1 天 */
export function shiftPeriod(period: ReviewPeriod, start: string, delta: number): string {
  return addDays(start, delta * (period === 'week' ? 7 : 1));
}

function monthDay(key: string): string {
  const [, month, day] = key.split('-').map((part) => Number(part));
  if (!month || !day) return key;
  return `${month} 月 ${day} 日`;
}

/** 周期标题：「9 月 28 日 – 10 月 4 日」/「9 月 29 日 周一」 */
export function periodLabel(period: ReviewPeriod, start: string): string {
  if (period === 'day') return formatDayLabel(start);
  return `${monthDay(start)} – ${monthDay(periodEndOf(period, start))}`;
}

/** 同一个周期的复盘只有一条，靠它查重 */
export function reviewKey(period: ReviewPeriod, start: string): string {
  return `${period}:${start}`;
}

export function findReview(
  reviews: readonly ReviewEntry[],
  period: ReviewPeriod,
  start: string,
): ReviewEntry | undefined {
  return reviews.find((entry) => entry.period === period && entry.date === start);
}

/** 是否写过内容：三个问题全空视为「没写」，列表里不占位 */
export function hasAnswer(entry: ReviewEntry): boolean {
  return REVIEW_ANSWERS.some((key) => entry[key].trim() !== '');
}

// ---------------------------------------------------------------- 自动汇总

/**
 * 复盘要用到的流水，与指标 registry 看到的是同一份。
 * 直接复用 `MetricSnapshot`，保证「复盘里的数」和「目标里的数」出自同一段代码。
 */
export type ReviewSnapshot = MetricSnapshot;

/** 与 `StatCard` 的 `StatTone` 结构一致；写成局部字面量让 utils 不必依赖组件层 */
export type ReviewTone = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export interface ReviewMetric {
  key: string;
  label: string;
  value: string;
  unit: string;
  footer: string;
  tone: ReviewTone;
}

const within = (day: string, start: string, end: string): boolean => day >= start && day <= end;

/**
 * 周期内的自动汇总：六个数字，够看清这一段时间花在哪。
 *
 * 数字一律来自 `metrics.ts` 的 registry —— 「这周训练了几次」在复盘、目标、统计三处
 * 各算一遍，迟早会出现两个不一样的结果。这里只补 registry 不关心的部分：
 * footer 文案与配色。
 */
export function reviewMetrics(
  snapshot: ReviewSnapshot,
  start: string,
  end: string,
): ReviewMetric[] {
  const range: MetricRange = { start, end };
  const show = (id: MetricId): string => METRICS[id].format(metricValue(id, snapshot, range));

  const urgentDone = snapshot.tasks.filter((task) => {
    if (task.status !== 'completed' || task.priority !== 'high') return false;
    const day = dayKeyOf(task.completedAt);
    return day !== undefined && within(day, start, end);
  }).length;

  const focus = snapshot.focusSessions.filter((session) => within(session.date, start, end));

  const sets = snapshot.fitnessRecords
    .filter((record) => within(record.date, start, end))
    .reduce((sum, record) => sum + record.exercises.reduce((n, item) => n + item.sets, 0), 0);

  const reading = snapshot.readingSessions.filter((session) => within(session.date, start, end));

  const mealDays = new Set(
    snapshot.dietRecords
      .filter((record) => within(record.date, start, end))
      .map((record) => record.date),
  );

  const habit = habitProgress(snapshot.habits, daysInRange(start, end));

  return [
    {
      key: 'tasks',
      label: METRICS['tasks.completed'].label,
      value: show('tasks.completed'),
      unit: METRICS['tasks.completed'].unit,
      footer: urgentDone > 0 ? `其中紧急 ${urgentDone} 件` : '没有紧急任务',
      tone: 'success',
    },
    {
      key: 'focus',
      label: METRICS['focus.minutes'].label,
      value: show('focus.minutes'),
      unit: METRICS['focus.minutes'].unit,
      footer: focus.length > 0 ? `共 ${focus.length} 次专注` : '这一段时间没有计时',
      tone: 'accent',
    },
    {
      key: 'workout',
      label: METRICS['fitness.sessions'].label,
      value: show('fitness.sessions'),
      unit: METRICS['fitness.sessions'].unit,
      footer: sets > 0 ? `累计 ${sets} 组` : '还没有训练记录',
      tone: 'warning',
    },
    {
      key: 'reading',
      label: METRICS['reading.minutes'].label,
      value: show('reading.minutes'),
      unit: METRICS['reading.minutes'].unit,
      footer: reading.length > 0 ? `共 ${reading.length} 次阅读` : '这一段时间没有阅读',
      tone: 'accent',
    },
    {
      key: 'diet',
      label: METRICS['diet.averageCalories'].label,
      value: show('diet.averageCalories'),
      unit: METRICS['diet.averageCalories'].unit,
      footer: mealDays.size > 0 ? `按记过的 ${mealDays.size} 天算` : '还没有饮食记录',
      tone: 'danger',
    },
    {
      key: 'habits',
      label: METRICS['habit.rate'].label,
      value: show('habit.rate'),
      unit: METRICS['habit.rate'].unit,
      footer: habit.due > 0 ? `${habit.done}/${habit.due} 次到期达成` : '这一段时间没有到期习惯',
      tone: habit.rate >= 0.8 ? 'success' : habit.rate >= 0.4 ? 'accent' : 'warning',
    },
  ];
}

// ---------------------------------------------------------------- 停滞项目

export interface StalledProject {
  id: string;
  name: string;
  kind: 'dev' | 'writing';
  /** 最近一次投入是哪天；从未投入时用创建日兜底 */
  lastActive: string;
  /** 距周期结束日有多少天没动 */
  idleDays: number;
}

export interface StalledSnapshot {
  devProjects: readonly DevProject[];
  workSessions: readonly WorkSession[];
  writingProjects: readonly WritingProject[];
}

/**
 * 停滞项目：在推进，却已经 `days` 天没有任何投入。
 *
 * 归档 / 完结的项目不算 —— 那些是主动收尾，不是搁置。
 */
export function stalledProjects(
  snapshot: StalledSnapshot,
  end: string,
  days: number = STALLED_DAYS,
): StalledProject[] {
  const lastWork = new Map<string, string>();
  for (const session of snapshot.workSessions) {
    if (!isDayKey(session.date)) continue;
    const current = lastWork.get(session.projectId);
    if (!current || session.date > current) lastWork.set(session.projectId, session.date);
  }

  const result: StalledProject[] = [];
  const push = (id: string, name: string, kind: 'dev' | 'writing', from: string): void => {
    const idleDays = daysBetween(from, end) ?? 0;
    if (idleDays < days) return;
    result.push({ id, name, kind, lastActive: from, idleDays });
  };

  for (const project of snapshot.devProjects) {
    if (project.status !== 'in-progress' || project.archived) continue;
    const created = dayKeyOf(project.createdAt);
    push(project.id, project.name, 'dev', lastWork.get(project.id) ?? created ?? end);
  }

  for (const project of snapshot.writingProjects) {
    if (project.status === 'completed') continue;
    const lastActive = dayKeyOf(project.updatedAt) ?? dayKeyOf(project.createdAt);
    push(project.id, project.title, 'writing', lastActive ?? end);
  }

  return result.sort((a, b) => b.idleDays - a.idleDays);
}

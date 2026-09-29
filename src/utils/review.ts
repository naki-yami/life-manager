import type {
  DevProject,
  FocusSession,
  Habit,
  MealRecord,
  ReadingSession,
  ReviewEntry,
  ReviewPeriod,
  Task,
  WorkoutRecord,
  WorkSession,
  WritingProject,
} from '../types';
import { addDays, dayKeyOf, daysBetween, formatDayLabel, isDayKey } from './date';
import {
  habitCreatedDay,
  isHabitDoneOn,
  isHabitScheduledOn,
  weekStartOf,
  weeklyDoneCount,
  weeklyTarget,
} from './habits';
import { formatFocusDuration } from './focus';

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

export interface ReviewSnapshot {
  tasks: readonly Task[];
  focusSessions: readonly FocusSession[];
  fitnessRecords: readonly WorkoutRecord[];
  readingSessions: readonly ReadingSession[];
  dietRecords: readonly MealRecord[];
  habits: readonly Habit[];
}

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

/** 起止日之间的每一天（含首含尾）；比按周期推导更抗脏输入 */
export function daysInRange(start: string, end: string): string[] {
  const span = (daysBetween(start, end) ?? 0) + 1;
  if (span <= 0) return [];
  return Array.from({ length: span }, (_, offset) => addDays(start, offset));
}

const within = (day: string, start: string, end: string): boolean => day >= start && day <= end;

export interface HabitProgress {
  /** 周期内达标的次数 */
  done: number;
  /** 周期内到期的次数 */
  due: number;
  /** 0–1；没有到期项时为 0 */
  rate: number;
}

/**
 * 周期内的习惯完成率。
 *
 * 「每周 N 次」按**整周**结算：只有整个自然周都落在周期里才算这一周的份额，
 * 单日复盘里它不参与 —— 一天的数量说明不了这一周，硬算只会让完成率乱跳。
 */
export function habitProgress(habits: readonly Habit[], days: readonly string[]): HabitProgress {
  let done = 0;
  let due = 0;

  for (const habit of habits) {
    const created = habitCreatedDay(habit);
    const buckets = new Map<string, string[]>();

    for (const day of days) {
      if (day < created) continue;
      const bucket = habit.schedule.kind === 'weekly' ? weekStartOf(day) : day;
      const list = buckets.get(bucket);
      if (list) list.push(day);
      else buckets.set(bucket, [day]);
    }

    for (const [bucket, list] of buckets) {
      if (habit.schedule.kind === 'weekly') {
        if (list.length < 7) continue;
        const target = weeklyTarget(habit.schedule);
        due += target;
        done += Math.min(weeklyDoneCount(habit, bucket), target);
        continue;
      }
      for (const day of list) {
        if (!isHabitScheduledOn(habit, day)) continue;
        due += 1;
        if (isHabitDoneOn(habit, day)) done += 1;
      }
    }
  }

  return { done, due, rate: due === 0 ? 0 : done / due };
}

/** 周期内的自动汇总：六个数字，够看清这一段时间花在哪 */
export function reviewMetrics(
  snapshot: ReviewSnapshot,
  start: string,
  end: string,
): ReviewMetric[] {
  const completed = snapshot.tasks.filter((task) => {
    if (task.status !== 'completed') return false;
    const day = dayKeyOf(task.completedAt);
    return day !== undefined && within(day, start, end);
  });
  const urgentDone = completed.filter((task) => task.priority === 'high').length;

  const focus = snapshot.focusSessions.filter((session) => within(session.date, start, end));
  const focusTotal = focus.reduce((sum, session) => sum + session.minutes, 0);

  const workouts = snapshot.fitnessRecords.filter((record) => within(record.date, start, end));
  const sets = workouts.reduce(
    (sum, record) => sum + record.exercises.reduce((count, item) => count + item.sets, 0),
    0,
  );

  const reading = snapshot.readingSessions.filter((session) => within(session.date, start, end));
  const readingTotal = reading.reduce((sum, session) => sum + session.minutes, 0);

  const meals = snapshot.dietRecords.filter((record) => within(record.date, start, end));
  const mealDays = new Set(meals.map((record) => record.date));
  const calories = meals.reduce((sum, record) => sum + record.totalCalories, 0);
  // 只按「记过的天数」平均：漏记的那天不是 0 卡，算进去等于凭空拉低
  const averageCalories = mealDays.size > 0 ? Math.round(calories / mealDays.size) : 0;

  const habit = habitProgress(snapshot.habits, daysInRange(start, end));

  return [
    {
      key: 'tasks',
      label: '完成任务',
      value: String(completed.length),
      unit: '件',
      footer: urgentDone > 0 ? `其中紧急 ${urgentDone} 件` : '没有紧急任务',
      tone: 'success',
    },
    {
      key: 'focus',
      label: '专注时长',
      value: focusTotal > 0 ? formatFocusDuration(focusTotal) : '0 分钟',
      unit: '',
      footer: focus.length > 0 ? `共 ${focus.length} 次专注` : '这一段时间没有计时',
      tone: 'accent',
    },
    {
      key: 'workout',
      label: '训练次数',
      value: String(workouts.length),
      unit: '次',
      footer: sets > 0 ? `累计 ${sets} 组` : '还没有训练记录',
      tone: 'warning',
    },
    {
      key: 'reading',
      label: '阅读时长',
      value: readingTotal > 0 ? formatFocusDuration(readingTotal) : '0 分钟',
      unit: '',
      footer: reading.length > 0 ? `共 ${reading.length} 次阅读` : '这一段时间没有阅读',
      tone: 'accent',
    },
    {
      key: 'diet',
      label: '热量日均',
      value: String(averageCalories),
      unit: 'kcal',
      footer: mealDays.size > 0 ? `按记过的 ${mealDays.size} 天算` : '还没有饮食记录',
      tone: 'danger',
    },
    {
      key: 'habits',
      label: '习惯完成率',
      value: String(Math.round(habit.rate * 100)),
      unit: '%',
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

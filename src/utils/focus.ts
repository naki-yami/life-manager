import type { FocusMode, FocusSession, FocusTarget, TaskTimebox } from '../types';
import { isDayKey } from './date';

/**
 * 时间盒与专注时长的纯计算。
 *
 * 两个约定：
 * - 时长一律取整到分钟：秒级精度对记录没有价值，却会让「今天专注了多久」
 *   变成一串小数；
 * - 不合法的时间盒一律收成 null（= 没排），绝不留半条盒子挂在那里。
 *
 * 原「今日时间轴」页面的排版计算（刻度 / 吸附 / 重叠分列 / 位置百分比）随
 * 那张卡一起下线了 —— 它已经不在这份文件里。
 */

/** 时间盒最短 15 分钟：再短就不值得占一格 */
export const MIN_TIMEBOX_MINUTES = 15;
/** 时间盒最长 10 小时：一次排 12 小时多半是手滑 */
export const MAX_TIMEBOX_MINUTES = 600;
/** 番茄钟默认时长 */
export const POMODORO_MINUTES = 25;
/** 一次专注的时长上界（分钟）：超过 10 小时多半是忘了停表 */
export const MAX_FOCUS_MINUTES = 600;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** 'HH:mm' 是否为合法的 24 小时制时间 */
export function isTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

/**
 * 时间盒的合法性检查 + 归一化。
 * 日期必须是本地日键、开始时间必须是 HH:mm、时长必须是有穷数，
 * 任何一项不合法都返回 null —— 宁可不排，也不要画一个假盒子。
 */
export function normalizeTimebox(value: unknown): TaskTimebox | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const { date, start, minutes } = record;
  if (typeof date !== 'string' || !isDayKey(date)) return null;
  if (!isTimeOfDay(start)) return null;
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return null;
  const bounded = Math.min(Math.max(Math.round(minutes), MIN_TIMEBOX_MINUTES), MAX_TIMEBOX_MINUTES);
  return { date, start, minutes: bounded };
}

export const FOCUS_TARGET_LABELS: Record<FocusTarget, string> = {
  task: '任务',
  dev: '开发项目',
  book: '书籍',
  game: '游戏',
};

export const FOCUS_MODE_LABELS: Record<FocusMode, string> = {
  pomodoro: '番茄钟',
  stopwatch: '正计时',
};

/** 一次专注真正记下来的分钟数：夹在 1 – 600 之间，脏数据退回 1 */
export function focusMinutes(value: unknown): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(Math.max(Math.round(raw), 1), MAX_FOCUS_MINUTES);
}

/** 把分钟数说成「1 小时 25 分」 */
export function formatFocusDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} 分钟`;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分`;
}

/** 已经过去的秒数（向下取整）；开始时间在未来或非法时返回 0 */
export function elapsedSeconds(startedAt: string, now: Date | number = Date.now()): number {
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return 0;
  const at = typeof now === 'number' ? now : now.getTime();
  return Math.max(0, Math.floor((at - start) / 1000));
}

/** 已经过去的分钟数（向上取整）；开始时间在未来或非法时返回 0 */
export function elapsedMinutes(startedAt: string, now: Date | number = Date.now()): number {
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return 0;
  const at = typeof now === 'number' ? now : now.getTime();
  return Math.max(0, Math.ceil((at - start) / 60000));
}

/**
 * 秒 -> 'mm:ss'；超过一小时用 'h:mm:ss'。
 * 秒表按秒走，整分钟跳动会让人怀疑表停了，所以显示到秒。
 */
export function formatTimer(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

/** 某一天的专注总时长与次数 */
export function focusSummary(
  sessions: readonly FocusSession[],
  date: string,
): { minutes: number; count: number } {
  let minutes = 0;
  let count = 0;
  for (const session of sessions) {
    if (session.date !== date) continue;
    minutes += session.minutes;
    count += 1;
  }
  return { minutes, count };
}

/** 若干天的专注分钟数，按 dayKeys 的顺序返回（图表直接用） */
export function focusMinutesByDay(
  sessions: readonly FocusSession[],
  dayKeys: readonly string[],
): number[] {
  const byDay = new Map<string, number>();
  for (const session of sessions) {
    byDay.set(session.date, (byDay.get(session.date) ?? 0) + session.minutes);
  }
  return dayKeys.map((key) => byDay.get(key) ?? 0);
}

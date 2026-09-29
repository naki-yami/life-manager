import type { FocusMode, FocusSession, FocusTarget, Task, TaskTimebox } from '../types';
import { isDayKey } from './date';

/**
 * 时间盒与专注时长的纯计算。
 *
 * 三个约定：
 * - 时间轴只画 06:00–24:00：凌晨那一段对「今天要做什么」没有指导意义，
 *   画出来只会把白天压扁；
 * - 时长一律取整到分钟：秒级精度对记录没有价值，却会让「今天专注了多久」
 *   变成一串小数；
 * - 不合法的时间盒一律收成 null（= 没排），绝不留半条盒子挂在时间轴上。
 */

/** 时间轴起点（含）：06:00 */
export const TIMELINE_START_HOUR = 6;
/** 时间轴终点（不含）：24:00 */
export const TIMELINE_END_HOUR = 24;
/** 时间轴的可视总长（分钟）：06:00–24:00 共 18 小时 */
export const TIMELINE_MINUTES = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;
/** 刻度粒度：一格 30 分钟，拖拽落点与吸附都按它对齐 */
export const SLOT_MINUTES = 30;
/** 时长吸附粒度：15 分钟 */
export const STEP_MINUTES = 15;
/** 时间盒最短 15 分钟：再短就不值得占一格 */
export const MIN_TIMEBOX_MINUTES = 15;
/** 时间盒最长 10 小时：一次排 12 小时多半是手滑 */
export const MAX_TIMEBOX_MINUTES = 600;
/** 番茄钟默认时长 */
export const POMODORO_MINUTES = 25;
/** 一次专注的时长上界（分钟）：超过 10 小时多半是忘了停表 */
export const MAX_FOCUS_MINUTES = 600;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTES_IN_DAY = 24 * 60;

/** 是否为合法的 HH:mm（24 小时制） */
export function isTimeOfDay(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

/** 'HH:mm' -> 从 00:00 起的分钟数；非法输入返回 null */
export function timeToMinutes(value: unknown): number | null {
  if (!isTimeOfDay(value)) return null;
  const [hour, minute] = value.split(':');
  return Number(hour) * 60 + Number(minute);
}

/** 从 00:00 起的分钟数 -> 'HH:mm'；超出一天按取模回绕 */
export function minutesToTime(total: number): string {
  const wrapped = ((Math.round(total) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** 时间轴的刻度：['06:00', '06:30', …, '23:30'] */
export function timelineSlots(): string[] {
  const slots: string[] = [];
  const end = TIMELINE_END_HOUR * 60;
  for (let minute = TIMELINE_START_HOUR * 60; minute < end; minute += SLOT_MINUTES) {
    slots.push(minutesToTime(minute));
  }
  return slots;
}

/**
 * 把开始时间吸附到 30 分钟刻度上，并夹在时间轴的可见范围内。
 * 拖拽落点与键盘微调都走这里，保证「怎么放都落在刻度上」。
 */
export function snapToSlot(minutes: number): number {
  const snapped = Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
  const latest = TIMELINE_END_HOUR * 60 - SLOT_MINUTES;
  return Math.min(Math.max(snapped, TIMELINE_START_HOUR * 60), latest);
}

/** 时长吸附：按 15 分钟取整，并夹在 15 分钟 – 10 小时之间 */
export function snapMinutes(value: unknown): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : NaN;
  if (Number.isNaN(raw)) return MIN_TIMEBOX_MINUTES;
  const rounded = Math.round(raw / STEP_MINUTES) * STEP_MINUTES;
  return Math.min(Math.max(rounded, MIN_TIMEBOX_MINUTES), MAX_TIMEBOX_MINUTES);
}

/** 时间盒的结束时刻（从 00:00 起的分钟数） */
export function timeboxEnd(timebox: TaskTimebox): number {
  return (timeToMinutes(timebox.start) ?? 0) + timebox.minutes;
}

/** '09:00–10:30'；跨到第二天时收口成 24:00，不写成 00:00 让人误以为是第二个盒子 */
export function timeboxRangeLabel(timebox: TaskTimebox): string {
  const end = timeboxEnd(timebox);
  return `${timebox.start}–${end >= MINUTES_IN_DAY ? '24:00' : minutesToTime(end)}`;
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

/** 这一天排了时间盒的任务，按开始时间排序（同刻则短盒子在前） */
export function timeboxedTasks(
  tasks: readonly Task[],
  date: string,
): Array<{ task: Task; timebox: TaskTimebox }> {
  const startOf = (task: Task): number => timeToMinutes(task.timebox?.start ?? '') ?? 0;
  return tasks
    .filter((task) => task.timebox?.date === date)
    .map((task) => ({ task, timebox: task.timebox! }))
    .sort((a, b) => startOf(a.task) - startOf(b.task) || a.timebox.minutes - b.timebox.minutes);
}

export interface TimeboxInput {
  id: string;
  title: string;
  /** 从 00:00 起的开始分钟数 */
  start: number;
  minutes: number;
}

export interface LaidOutBox extends TimeboxInput {
  /** 同一组重叠盒子里的第几列（从 0 开始） */
  lane: number;
  /** 这一组重叠盒子一共几列 */
  lanes: number;
}

/**
 * 给重叠的时间盒分列。
 *
 * 时间轴是「一天」，同一个人不可能同时做两件事 —— 重叠多半是排的时候没注意。
 * 与其偷偷把其中一个挪走，不如并排画出来让人自己决定删哪个。
 * 分列只在「互相重叠的那一组」内计算（经典日历做法）：别处有重叠，
 * 不会把这边不相干的盒子一起压窄。
 */
export function layoutTimeboxes(items: readonly TimeboxInput[]): LaidOutBox[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.minutes - a.minutes);
  const laid: LaidOutBox[] = [];
  let group: LaidOutBox[] = [];
  let groupEnd = -Infinity;

  const flush = (): void => {
    if (group.length === 0) return;
    const laneCount = group.reduce((max, box) => Math.max(max, box.lane + 1), 0);
    for (const box of group) box.lanes = laneCount;
    laid.push(...group);
    group = [];
    groupEnd = -Infinity;
  };

  for (const item of sorted) {
    if (group.length > 0 && item.start >= groupEnd) flush();

    const laneEnds: number[] = [];
    for (const box of group) {
      laneEnds[box.lane] = Math.max(laneEnds[box.lane] ?? -Infinity, box.start + box.minutes);
    }
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.length;

    group.push({ ...item, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, item.start + item.minutes);
  }
  flush();

  return laid;
}

/** 时间盒在时间轴上的位置（百分比）；落在轴外的部分会被夹掉 */
export function timelinePosition(start: number, minutes: number): { top: number; height: number } {
  const axisStart = TIMELINE_START_HOUR * 60;
  const axisEnd = TIMELINE_END_HOUR * 60;
  const from = Math.min(Math.max(start, axisStart), axisEnd);
  const to = Math.min(Math.max(start + Math.max(minutes, 0), axisStart), axisEnd);
  return {
    top: ((from - axisStart) / TIMELINE_MINUTES) * 100,
    height: ((to - from) / TIMELINE_MINUTES) * 100,
  };
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

import type { Habit, HabitSchedule } from '../types';
import { addDays, dayKeyOf, daysBetween, isDayKey, todayKey } from './date';

// 日期键校验是通用工具，实现在 date.ts；这里转出去，避免调用方多记一个来源
export { isDayKey };

/**
 * 习惯的「强度分数」模型（参考 uhabits）。
 *
 * 不看「连续多少天」，而是把最近一段时间的完成度做**指数加权平均**：
 * 越近的日子权重越高，半衰期分别为 7 天（按天）与 2 周（按周）。
 * 于是断签只会让分数慢慢下滑，永远不会一夜归零 —— 这正是它比 streak 更适合
 * 「养成中」阶段的原因。
 */
export const HABIT_DAY_HALF_LIFE = 7;
export const HABIT_WEEK_HALF_LIFE = 2;
/** 强度分数的观察窗口：按天 30 天，按周 6 周 */
export const HABIT_DAY_WINDOW = 30;
export const HABIT_WEEK_WINDOW = 6;

/** streak 回看上限，避免脏数据（比如创建日填成 1970 年）把循环拖死 */
const MAX_LOOKBACK_DAYS = 3650;
const MAX_LOOKBACK_WEEKS = 520;

/** 打卡量的上限：脏数据不至于把进度条算成天文数字 */
export const MAX_HABIT_AMOUNT = 9999;

/**
 * 清洗打卡日志：只保留合法日期键与正数，并把数值取整。
 *
 * 0 值直接删掉而不是留着 —— 日志是「每天一条」的量级，一年下来几千个键，
 * localStorage 里存的每一个 `"2026-09-29":0` 都是纯浪费。
 */
export function sanitizeHabitLogs(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};

  const logs: Record<string, number> = {};
  for (const [day, amount] of Object.entries(value as Record<string, unknown>)) {
    if (!isDayKey(day)) continue;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) continue;
    const rounded = Math.round(amount);
    if (rounded <= 0) continue;
    logs[day] = Math.min(rounded, MAX_HABIT_AMOUNT);
  }
  return logs;
}

/** 目标量：binary 型固定 1，count 型至少 1 */
export function habitTarget(habit: Habit): number {
  if (habit.kind !== 'count') return 1;
  return Math.max(1, Math.round(habit.target) || 1);
}

/** 每周目标次数（1-7） */
export function weeklyTarget(schedule: HabitSchedule): number {
  const value = Math.round(schedule.timesPerWeek);
  if (!Number.isFinite(value)) return 1;
  return Math.min(7, Math.max(1, value));
}

/** 间隔天数（>=1） */
export function intervalDays(schedule: HabitSchedule): number {
  const value = Math.round(schedule.everyDays);
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, value);
}

/**
 * 只保留当前节奏真正会用到的那一个字段。
 *
 * 「每天」的习惯不该存下 timesPerWeek=3 这种没意义的数字 —— 数据要能自解释，
 * 否则以后读日志、比对备份时会误以为它还有别的含义。
 */
export function normalizeSchedule(schedule: HabitSchedule): HabitSchedule {
  if (schedule.kind === 'weekly') {
    return { kind: 'weekly', timesPerWeek: weeklyTarget(schedule), everyDays: 1 };
  }
  if (schedule.kind === 'interval') {
    return { kind: 'interval', timesPerWeek: 1, everyDays: intervalDays(schedule) };
  }
  return { kind: 'daily', timesPerWeek: 1, everyDays: 1 };
}

/** 习惯的建立日：createdAt 换算成本地日期键；解析不了就按今天算 */
export function habitCreatedDay(habit: Habit): string {
  return dayKeyOf(habit.createdAt) ?? todayKey();
}

export function habitAmountOn(habit: Habit, day: string): number {
  const amount = habit.logs[day];
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/** 这一天是否达标 */
export function isHabitDoneOn(habit: Habit, day: string): boolean {
  return habitAmountOn(habit, day) >= habitTarget(habit);
}

/** 这一天的完成度 0..1，用于强度分数 */
export function habitCompletionOn(habit: Habit, day: string): number {
  return Math.min(1, habitAmountOn(habit, day) / habitTarget(habit));
}

/** 含 day 的那个自然周的周一（本地日历） */
export function weekStartOf(day: string): string {
  const parts = day.split('-').map((part) => Number(part));
  const [year, month, date] = parts;
  if (!year || !month || !date) return day;
  const weekday = new Date(year, month - 1, date).getDay();
  // getDay()：0 = 周日；换算成「周一为 0」
  return addDays(day, -((weekday + 6) % 7));
}

/** 某一天所属自然周里达标的次数，用于「每周 N 次」的进度与判定 */
export function weeklyDoneCount(habit: Habit, day: string): number {
  const start = weekStartOf(day);
  let count = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    if (isHabitDoneOn(habit, addDays(start, offset))) count += 1;
  }
  return count;
}

/**
 * day **之前**最近一次达标的日期；从未达标则返回建立日。
 *
 * 用「严格早于 day」而不是「不晚于 day」：判定某一天是否到期时，
 * 不能把这一天的打卡本身算进「上次达标」——否则刚打完卡的当天会算出间隔 0，
 * 连「今天算不算一次完成」都判不出来（streak / 强度分数都会漏掉这一天）。
 */
function lastDoneBefore(habit: Habit, day: string): string {
  let latest = '';
  for (const [logged, amount] of Object.entries(habit.logs)) {
    if (!isDayKey(logged)) continue;
    if (logged >= day) continue;
    if (amount < habitTarget(habit)) continue;
    if (logged > latest) latest = logged;
  }
  return latest === '' ? habitCreatedDay(habit) : latest;
}

/**
 * 这一天是否「轮到这个习惯」。
 *
 * - daily / weekly：每天都可以打卡（weekly 的意义在每周累计次数）
 * - interval：距上次达标满 N 天才算到期
 *
 * 注意它与 isHabitPending 的分工：这里只回答「今天是不是该做」，
 * 「今天已经做过了」由 isHabitPending 先一步排除。
 */
export function isHabitScheduledOn(habit: Habit, day: string): boolean {
  if (habit.schedule.kind !== 'interval') return true;
  const since = daysBetween(lastDoneBefore(habit, day), day);
  if (since === null) return true;
  return since >= intervalDays(habit.schedule);
}

/**
 * 今天是否「还欠着」这个习惯 —— 首页「今日未打卡」用的就是它。
 * 断签后到期日会一直是 true，直到补上或跳过一次。
 */
export function isHabitPending(habit: Habit, day: string = todayKey()): boolean {
  if (habit.schedule.kind === 'weekly') {
    return weeklyDoneCount(habit, day) < weeklyTarget(habit.schedule);
  }
  if (isHabitDoneOn(habit, day)) return false;
  return isHabitScheduledOn(habit, day);
}

/** 今日未打卡的习惯（按创建时间排序，保持列表稳定） */
export function pendingHabits(habits: readonly Habit[], day: string = todayKey()): Habit[] {
  return habits.filter((habit) => isHabitPending(habit, day));
}

/**
 * 连续达标次数。
 * - 按天的习惯数「到期日」而不是自然日：间隔型跳过不该打卡的那几天；
 * - 今天还没打卡不算断（否则每天早上一睁眼 streak 就归零了）；
 * - 按周的习惯数「连续达标的周」，本周还没过完不算断。
 */
export function habitStreak(habit: Habit, day: string = todayKey()): number {
  const created = habitCreatedDay(habit);

  if (habit.schedule.kind === 'weekly') {
    const target = weeklyTarget(habit.schedule);
    let streak = 0;
    for (let week = 0; week < MAX_LOOKBACK_WEEKS; week += 1) {
      const start = weekStartOf(addDays(day, -7 * week));
      if (start < weekStartOf(created)) break;
      if (weeklyDoneCount(habit, start) >= target) {
        streak += 1;
        continue;
      }
      // 本周尚未结束，未达标不算断签
      if (week !== 0) break;
    }
    return streak;
  }

  let cursor = isHabitDoneOn(habit, day) ? day : addDays(day, -1);
  let streak = 0;
  for (let step = 0; step < MAX_LOOKBACK_DAYS; step += 1) {
    if (cursor < created) break;
    if (isHabitScheduledOn(habit, cursor)) {
      if (!isHabitDoneOn(habit, cursor)) break;
      streak += 1;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** 强度分数 0..1（指数加权平均，见文件头注释） */
export function habitStrength(habit: Habit, day: string = todayKey()): number {
  const created = habitCreatedDay(habit);

  if (habit.schedule.kind === 'weekly') {
    const target = weeklyTarget(habit.schedule);
    let weighted = 0;
    let total = 0;
    for (let week = 0; week < HABIT_WEEK_WINDOW; week += 1) {
      const start = weekStartOf(addDays(day, -7 * week));
      // 习惯建立之前的周不参与，否则新建的习惯一上来就被打 0 分
      if (addDays(start, 6) < created) continue;
      const completion = Math.min(1, weeklyDoneCount(habit, start) / target);
      const weight = Math.pow(0.5, week / HABIT_WEEK_HALF_LIFE);
      weighted += weight * completion;
      total += weight;
    }
    return total === 0 ? 0 : weighted / total;
  }

  let weighted = 0;
  let total = 0;
  for (let offset = 0; offset < HABIT_DAY_WINDOW; offset += 1) {
    const cursor = addDays(day, -offset);
    if (cursor < created) break;
    if (!isHabitScheduledOn(habit, cursor)) continue;
    const weight = Math.pow(0.5, offset / HABIT_DAY_HALF_LIFE);
    weighted += weight * habitCompletionOn(habit, cursor);
    total += weight;
  }
  return total === 0 ? 0 : weighted / total;
}

/** 最近 days 天（含今天）里达标的天数，用于「近 30 天完成 X 天」这类说明 */
export function habitDoneCount(habit: Habit, day: string, days: number): number {
  let count = 0;
  for (let offset = 0; offset < days; offset += 1) {
    if (isHabitDoneOn(habit, addDays(day, -offset))) count += 1;
  }
  return count;
}

/** 强度分数的定性描述，用于给分数配一句人话 */
export function strengthLabel(strength: number): string {
  if (strength >= 0.8) return '稳固';
  if (strength >= 0.5) return '养成中';
  if (strength >= 0.2) return '起步';
  return '待开始';
}

/** 节奏的中文描述，例如「每天」「每周 3 次」「每 2 天」 */
export function scheduleLabel(schedule: HabitSchedule): string {
  if (schedule.kind === 'weekly')
    return `每周 ${Math.min(7, Math.max(1, Math.round(schedule.timesPerWeek)))} 次`;
  if (schedule.kind === 'interval') {
    const every = Math.max(1, Math.round(schedule.everyDays));
    return every === 1 ? '每天' : `每 ${every} 天`;
  }
  return '每天';
}

/** 目标的中文描述，例如「做到即可」「8 杯」 */
export function goalLabel(habit: Habit): string {
  if (habit.kind !== 'count') return '做到即可';
  const unit = habit.unit.trim();
  return unit === '' ? `${habitTarget(habit)} 次` : `${habitTarget(habit)} ${unit}`;
}

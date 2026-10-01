import { addDays } from './date';

export interface DayPoint {
  /** 日期键 YYYY-MM-DD */
  date: string;
  value: number;
}

/**
 * 从 endKey 往前推 days 天（含 endKey），按时间升序返回日期键。
 * 所有「按天」的统计都从这里出发，保证图表与列表用同一套日期口径。
 */
export function dayRange(endKey: string, days: number): string[] {
  if (days <= 0) return [];
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) keys.push(addDays(endKey, -i));
  return keys;
}

/** 把流水账按「天」聚合成图表数据；没有记录的日期补 0，保证 x 轴连续 */
export function seriesByDay<T>(
  items: readonly T[],
  days: number,
  endKey: string,
  dateOf: (item: T) => string | undefined,
  valueOf: (item: T) => number = () => 1,
): DayPoint[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const date = dateOf(item);
    if (!date) continue;
    totals.set(date, (totals.get(date) ?? 0) + valueOf(item));
  }
  return dayRange(endKey, days).map((date) => ({ date, value: totals.get(date) ?? 0 }));
}

/** 热力等级：0 表示没有活动，1-4 表示活动量递增（按当前区间最大值分档） */
export function heatLevel(value: number, max: number, levels = 4): number {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  return Math.max(1, Math.min(levels, Math.ceil(ratio * levels)));
}

/** 线性归一到 0..1，用于迷你折线的高度比例；全部相等时统一给 0.5 避免贴底 */
export function normalizeToUnit(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (max === min) return values.map(() => (max === 0 ? 0 : 0.5));
  const span = max - min;
  return values.map((value) => (value - min) / span);
}

/** 百分比整数；分母 <= 0 时返回 0，避免 NaN 渗透到界面 */
export function percentOf(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

/** 平均值取整；空数组返回 0 */
export function averageOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** 求和 */
export function sumOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

/** 只保留值大于 0 的日期（用于「有记录的天数」这类统计） */
export function activeDays(series: readonly DayPoint[]): string[] {
  return series.filter((point) => point.value > 0).map((point) => point.date);
}

/**
 * 把逐日序列按自然周合并（`date` 取那周的周一）。
 *
 * 时间范围一拉长（90 天 / 全部），一天一根柱子会细得看不清，按周汇总才有可读性。
 * 就地把已有的日序列合并，而不是回头按周重新取一次数 —— 同一条序列两处各算一遍，
 * 迟早会算出两个数。
 */
export function weekBuckets(series: readonly DayPoint[]): DayPoint[] {
  const buckets = new Map<string, number>();
  for (const point of series) {
    const key = weekStartKey(point.date);
    buckets.set(key, (buckets.get(key) ?? 0) + point.value);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}

/** 把逐日序列按自然月合并（`date` 取当月 1 号）；区间拉到一年以上时用 */
export function monthBuckets(series: readonly DayPoint[]): DayPoint[] {
  const buckets = new Map<string, number>();
  for (const point of series) {
    const key = monthStartKey(point.date);
    buckets.set(key, (buckets.get(key) ?? 0) + point.value);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}

/** 从 endKey 往前数连续有记录的天数；今天没有记录时为 0 */
export function currentStreak(series: readonly DayPoint[], endKey: string): number {
  let streak = 0;
  let cursor = endKey;
  const byDate = new Map(series.map((point) => [point.date, point.value]));
  while ((byDate.get(cursor) ?? 0) > 0) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * 整段序列里最长的那一段连续有记录天数。
 *
 * 和 `currentStreak` 是两个问题：那个问「到今天为止连着多少天」（今天没记就是 0），
 * 这个问「这一窗口里最长连着过多少天」—— 中断过又重新开始的人，前者会归零，
 * 后者才留得住「我最长坚持过多久」。
 *
 * 口径是**窗口内最长**，不是历史最长：序列是从别处切好的（首页给的是近 30 天），
 * 越过窗口起点的那段连续会在这里被截断。要历史最长就把整条序列传进来。
 */
export function longestStreak(series: readonly DayPoint[]): number {
  const days = [...new Set(activeDays(series))].sort();
  let longest = 0;
  let run = 0;
  let previous = '';
  for (const day of days) {
    run = previous !== '' && addDays(previous, 1) === day ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = day;
  }
  return longest;
}

/** 日期键 → 星期几（0 = 周一，6 = 周日）；按 UTC 解析，和日期键的生成口径一致 */
export function weekdayIndex(key: string): number {
  const date = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 0;
  return (date.getUTCDay() + 6) % 7;
}

/** 把多条同区间序列逐日相加（例如任务 + 训练 + 饮食 = 当日活动量） */
export function sumSeries(...series: DayPoint[][]): DayPoint[] {
  const totals = new Map<string, number>();
  for (const line of series) {
    for (const point of line) totals.set(point.date, (totals.get(point.date) ?? 0) + point.value);
  }
  return [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, value]) => ({ date, value }));
}

/** 某个日期键所在自然周的周一（周一为一周之始） */
export function weekStartKey(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

/** 某个日期键所在自然月的 1 号 */
export function monthStartKey(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

/** 月份键平移，跨年也能算对 */
function shiftMonth(monthKey: string, delta: number): string {
  const parts = monthKey.split('-').map((part) => Number(part));
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * 按任意「桶」聚合流水账的通用实现。
 * keyOf 决定一条记录属于哪个桶，step 决定桶怎么往前推，
 * 这样周、月共用一套补零与排序逻辑。
 */
function bucketSeries<T>(
  items: readonly T[],
  buckets: number,
  endKey: string,
  dateOf: (item: T) => string | undefined,
  valueOf: (item: T) => number,
  keyOf: (date: string) => string,
  step: (key: string, delta: number) => string,
): DayPoint[] {
  if (buckets <= 0) return [];
  const totals = new Map<string, number>();
  for (const item of items) {
    const date = dateOf(item);
    if (!date) continue;
    const bucket = keyOf(date);
    totals.set(bucket, (totals.get(bucket) ?? 0) + valueOf(item));
  }
  const last = keyOf(endKey);
  const keys: string[] = [];
  for (let i = buckets - 1; i >= 0; i -= 1) keys.push(step(last, -i));
  return keys.map((date) => ({ date, value: totals.get(date) ?? 0 }));
}

/** 按自然周（周一起）聚合，最后一格是包含 endKey 的那一周；日期键是当周周一 */
export function seriesByWeek<T>(
  items: readonly T[],
  weeks: number,
  endKey: string,
  dateOf: (item: T) => string | undefined,
  valueOf: (item: T) => number = () => 1,
): DayPoint[] {
  return bucketSeries(items, weeks, endKey, dateOf, valueOf, weekStartKey, (key, delta) =>
    addDays(key, delta * 7),
  );
}

/** 按自然月聚合，最后一格是包含 endKey 的那个月；日期键是当月 1 号 */
export function seriesByMonth<T>(
  items: readonly T[],
  months: number,
  endKey: string,
  dateOf: (item: T) => string | undefined,
  valueOf: (item: T) => number = () => 1,
): DayPoint[] {
  return bucketSeries(items, months, endKey, dateOf, valueOf, monthStartKey, shiftMonth);
}

/**
 * 环比变化百分比（四舍五入）。
 * 上期为 0 时：本期有增长记 100%，没有增长记 0%，避免出现 ∞ 或 NaN。
 */
export function changeRate(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

/** 把区间按天切成前后两半，返回本期与上期的合计，用于「环比上一周期」 */
export function splitWindow(series: readonly DayPoint[]): {
  current: number;
  previous: number;
} {
  const half = Math.floor(series.length / 2);
  if (half === 0) return { current: sumOf(series.map((point) => point.value)), previous: 0 };
  const currentHalf = series.slice(series.length - half);
  const previousHalf = series.slice(series.length - half * 2, series.length - half);
  return {
    current: sumOf(currentHalf.map((point) => point.value)),
    previous: sumOf(previousHalf.map((point) => point.value)),
  };
}

/**
 * 本地日期键（YYYY-MM-DD）。
 *
 * 这里用的是**本地日历字段**，不是 `toISOString()`：后者取的是 UTC 日期，
 * 在东八区凌晨 0–8 点会把「今天」算成昨天 —— 今日计划、饮食、打卡、热力图
 * 会集体错位一天。项目从一开始就按本地日期存数据（`addDays` / `daysBetween`
 * 也都按本地日历算），这里必须对齐。
 */
export function todayKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 时间戳 → 本地日期键。
 *
 * 记录上的 `createdAt` / `completedAt` / `startedAt` 存的是完整 ISO 时间（UTC），
 * 要按天分组（热力图、今日完成、连续打卡）就得换算成本地日期键；
 * 直接 `slice(0, 10)` 拿到的是 UTC 那一天，凌晨记的事会被算到前一天。
 *
 * 本来就是日期键的输入原样返回，不经过 `Date` 解析 ——
 * 否则 `new Date('2026-09-28')` 被当成 UTC 零点，在负时区又会错一天。
 * 认不出来的时间戳返回 undefined，由调用方决定怎么兜底。
 */
export function dayKeyOf(value: string | Date | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    if (DATE_KEY_PATTERN.test(value)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : todayKey(parsed);
  }
  return Number.isNaN(value.getTime()) ? undefined : todayKey(value);
}

/** 按小时段返回问候语；hour 由调用方传入方便测试 */
export function greeting(hour: number = new Date().getHours()): string {
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

/** 首页顶部的长日期，例如「2026年9月28日 星期一」 */
export function formatLongDate(date: Date = new Date()): string {
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
}

/** 千分位数字，用于字数、热量这类统计值 */
export function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN');
}

/** 秒数 → 「1 小时 23 分」，用于游戏时长等 */
export function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分`;
}

/** 在 YYYY-MM-DD 日期键上按本地日历加减天数，避免时区把日期挪到前一天 */
export function addDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map((part) => Number(part));
  if (!year || !month || !day) return key;
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** 日期键 → 「9月28日 周一」，用于按天展示的标题 */
export function formatDayLabel(key: string): string {
  const [year, month, day] = key.split('-').map((part) => Number(part));
  if (!year || !month || !day) return key;
  return new Date(year, month - 1, day).toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

/** 日期键 → 「9月」，用于按月聚合的图表刻度 */
export function formatMonthLabel(key: string): string {
  const parts = key.split('-').map((part) => Number(part));
  const month = parts[1];
  if (!month) return key;
  return `${month} 月`;
}

/** 日期键 → 「9/28」，用作图表刻度这种空间很小的地方 */
export function formatShortDate(key: string): string {
  const parts = key.split('-').map((part) => Number(part));
  const month = parts[1];
  const day = parts[2];
  if (!month || !day) return key;
  return `${month}/${day}`;
}

/** 两个日期键之间相差的天数（to - from）；无效键返回 null，由调用方决定怎么展示 */
export function daysBetween(from: string, to: string): number | null {
  const parse = (key: string): number | null => {
    const parts = key.split('-').map((part) => Number(part));
    const [year, month, day] = parts;
    if (!year || !month || !day) return null;
    return Date.UTC(year, month - 1, day);
  };
  const fromMs = parse(from);
  const toMs = parse(to);
  if (fromMs === null || toMs === null) return null;
  return Math.round((toMs - fromMs) / 86_400_000);
}

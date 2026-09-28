/** 与各页面持久化时一致的本地日期键（YYYY-MM-DD） */
export function todayKey(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
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

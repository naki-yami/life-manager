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

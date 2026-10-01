import type { DayPoint } from '../../utils/stats';
import { formatShortDate } from '../../utils/date';

export type ChartValueFormatter = (value: number) => string;
export type ChartDateFormatter = (key: string) => string;

/**
 * 图表描述里的「峰值 / 谷值 + 它落在哪一天」。
 *
 * 只说「单日最高 4 个」，读屏用户只拿到一半信息：看图表的人一眼就能看出最高那根柱子是哪天，
 * 读屏用户却得把 figcaption 的明细整段听完再自己比对。这里把那一天并进同一个句子。
 *
 * **整段没有信号时不报日期**：全为 0（或压根没数据）时不存在「最高的那一天」，
 * 随手挑一天等于编数据。此时只回数值，`单日最高 0 个` 就是全部事实。
 *
 * 注意 `hasChartSignal` 判的是「有没有非零值」而不是「极值是不是 0」——
 * 一周里六天有记录、只有一天是 0，那个 0 是真实记录，它落在哪天值得说。
 */
export function hasChartSignal(data: readonly DayPoint[]): boolean {
  return data.some((point) => point.value !== 0);
}

export function extremeWithDate(
  data: readonly DayPoint[],
  pick: 'max' | 'min',
  formatValue: ChartValueFormatter = (value) => String(value),
  formatDate: ChartDateFormatter = formatShortDate,
): string {
  if (data.length === 0) return formatValue(0);

  let best = data[0]!;
  for (const point of data) {
    if (pick === 'max' ? point.value > best.value : point.value < best.value) best = point;
  }
  if (!hasChartSignal(data)) return formatValue(best.value);
  return `${formatValue(best.value)}（${formatDate(best.date)}）`;
}

/** 最大值 + 落点日期，如 `4 个（1/8）` */
export function peakWithDate(
  data: readonly DayPoint[],
  formatValue?: ChartValueFormatter,
  formatDate?: ChartDateFormatter,
): string {
  return extremeWithDate(data, 'max', formatValue, formatDate);
}

/** 最小值 + 落点日期，如 `68 kg（9/2）` */
export function troughWithDate(
  data: readonly DayPoint[],
  formatValue?: ChartValueFormatter,
  formatDate?: ChartDateFormatter,
): string {
  return extremeWithDate(data, 'min', formatValue, formatDate);
}

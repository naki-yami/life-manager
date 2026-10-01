import React from 'react';
import type { DayPoint } from '../../utils/stats';
import { sumOf } from '../../utils/stats';
import { BAR_PEAK_LABEL } from './buckets';
import type { ChartBucket } from './buckets';
import { CHART_BAR } from './tones';
import type { ChartTone } from './tones';
import { formatShortDate } from '../../utils/date';
import { CHART_FOCUS_RING, useChartCursor } from './useChartCursor';
import { peakWithDate } from './digest';

export interface BarChartProps {
  data: DayPoint[];
  /** 无障碍描述，必填 */
  label: string;
  tone?: ChartTone;
  height?: number;
  formatValue?: (value: number) => string;
  /** 底部首尾刻度的格式化；按周或按月聚合时换成对应标签 */
  formatDate?: (key: string) => string;
  /** 聚合粒度：描述里「单日最高」还是「单周最高」跟着它走 */
  bucket?: ChartBucket;
  className?: string;
}

/**
 * 逐日柱状图。高度用百分比设置，所以容器多宽都能自适应；
 * 读屏用户走 figcaption 里的明细列表，键盘用户可聚焦后用左右键逐点读。
 */
export const BarChart: React.FC<BarChartProps> = ({
  data,
  label,
  tone = 'accent',
  height = 120,
  formatValue = (value) => String(value),
  formatDate = formatShortDate,
  bucket = 'day',
  className = '',
}) => {
  const cursor = useChartCursor(data.length);
  /**
   * 缩放用的下界：全是 0 时也得有个非零除数，否则柱高会算成 NaN。
   * 它**只服务于画图** —— 描述里的峰值走 peakWithDate，从真实数据取，不碰这个 floor。
   */
  const scale = Math.max(1, ...data.map((point) => point.value));
  const total = sumOf(data.map((point) => point.value));
  const active = cursor.index === null ? undefined : data[cursor.index];

  if (data.length === 0) {
    return (
      <div
        role="img"
        aria-label={`${label}（暂无数据）`}
        style={{ height }}
        className={`w-full rounded-sm bg-inset ${className}`}
      />
    );
  }

  return (
    <figure className={className}>
      <div
        {...cursor.containerProps}
        role="img"
        aria-label={`${label}：合计 ${formatValue(total)}，${BAR_PEAK_LABEL[bucket]} ${peakWithDate(data, formatValue, formatDate)}`}
        className={`flex items-end gap-1 ${CHART_FOCUS_RING}`}
        style={{ height }}
      >
        {data.map((point, index) => (
          <span
            key={point.date}
            title={`${point.date} · ${formatValue(point.value)}`}
            className={`min-w-0 flex-1 rounded-t-sm ${
              point.value > 0 ? CHART_BAR[tone] : 'bg-inset'
            } ${index === cursor.index ? 'ring-2 ring-line-focus' : ''}`}
            style={{
              height: point.value > 0 ? `${Math.max(4, (point.value / scale) * 100)}%` : '2px',
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-2xs text-content-tertiary">
        <span>{data.length > 0 ? formatDate(data[0]!.date) : ''}</span>
        <span aria-live="polite" className="tabular">
          {active
            ? `${formatDate(active.date)} · ${formatValue(active.value)}`
            : `合计 ${formatValue(total)}`}
        </span>
        <span>{data.length > 0 ? formatDate(data[data.length - 1]!.date) : ''}</span>
      </div>
      <figcaption className="sr-only">
        <ul>
          {data.map((point) => (
            <li key={point.date}>
              {point.date}：{formatValue(point.value)}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
};

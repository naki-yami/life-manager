import React from 'react';
import type { DayPoint } from '../../utils/stats';
import { sumOf } from '../../utils/stats';
import { CHART_BAR } from './tones';
import type { ChartTone } from './tones';
import { formatShortDate } from '../../utils/date';

export interface BarChartProps {
  data: DayPoint[];
  /** 无障碍描述，必填 */
  label: string;
  tone?: ChartTone;
  height?: number;
  formatValue?: (value: number) => string;
  /** 底部首尾刻度的格式化；按周或按月聚合时换成对应标签 */
  formatDate?: (key: string) => string;
  className?: string;
}

/**
 * 逐日柱状图。高度用百分比设置，所以容器多宽都能自适应；
 * 读屏用户走 figcaption 里的明细列表，图形本身只作视觉呈现。
 */
export const BarChart: React.FC<BarChartProps> = ({
  data,
  label,
  tone = 'accent',
  height = 120,
  formatValue = (value) => String(value),
  formatDate = formatShortDate,
  className = '',
}) => {
  const max = Math.max(1, ...data.map((point) => point.value));
  const total = sumOf(data.map((point) => point.value));

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
        role="img"
        aria-label={`${label}：合计 ${formatValue(total)}，单日最高 ${formatValue(max)}`}
        className="flex items-end gap-1"
        style={{ height }}
      >
        {data.map((point) => (
          <span
            key={point.date}
            title={`${point.date} · ${formatValue(point.value)}`}
            className={`min-w-0 flex-1 rounded-t-sm ${
              point.value > 0 ? CHART_BAR[tone] : 'bg-inset'
            }`}
            style={{
              height: point.value > 0 ? `${Math.max(4, (point.value / max) * 100)}%` : '2px',
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-2xs text-content-tertiary">
        <span>{data.length > 0 ? formatDate(data[0]!.date) : ''}</span>
        <span>合计 {formatValue(total)}</span>
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

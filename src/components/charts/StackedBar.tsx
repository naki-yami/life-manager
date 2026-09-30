import React from 'react';
import { formatShortDate } from '../../utils/date';
import { STACKED_PEAK_LABEL } from './buckets';
import type { ChartBucket } from './buckets';
import { CHART_SERIES_BAR, CHART_SERIES_DOT, seriesAt, type ChartSeriesIndex } from './tones';
import { CHART_FOCUS_RING, useChartCursor } from './useChartCursor';

export interface StackedSeries {
  name: string;
  /** 与 `dates` 等长的逐日数值 */
  values: number[];
  /** 序列色序号（1–8）；不传时按声明顺序取 */
  color?: ChartSeriesIndex;
}

export interface StackedBarProps {
  /** 与各序列一一对应的日期键，按时间升序 */
  dates: string[];
  series: StackedSeries[];
  /** 无障碍描述，必填 */
  label: string;
  height?: number;
  formatValue?: (value: number) => string;
  formatDate?: (key: string) => string;
  /** 聚合粒度：描述里「最高一天」还是「最高一周」跟着它走 */
  bucket?: ChartBucket;
  className?: string;
}

/**
 * 堆叠柱状图：一张图里看几条序列**各自贡献了多少**，以及它们的合计走势。
 *
 * 与 BarChart 的分工：BarChart 画单一序列，堆叠柱画「合计由几部分构成」。
 * 之所以不做多折线：任务 / 训练 / 饮食这类计数叠加起来才是有意义的「活动量」，
 * 三条线互相交叉反而更难读；要比较趋势时，下方仍可按模块单独看图。
 */
export const StackedBar: React.FC<StackedBarProps> = ({
  dates,
  series,
  label,
  height = 120,
  formatValue = (value) => String(value),
  formatDate = formatShortDate,
  bucket = 'day',
  className = '',
}) => {
  const cursor = useChartCursor(dates.length);
  const totals = dates.map((_, index) =>
    series.reduce((sum, item) => sum + Math.max(0, item.values[index] ?? 0), 0),
  );
  /** 缩放用的下界（理由同 BarChart）：全 0 时给个非零除数，别拿它当峰值报出去 */
  const scale = Math.max(1, ...totals);
  /** 描述里报的真实峰值：totals 已按非负累加，取最大值即可 */
  const peak = totals.reduce((top, value) => Math.max(top, value), 0);
  const grandTotal = totals.reduce((sum, value) => sum + value, 0);
  const activeIndex = cursor.index;
  const activeDate = activeIndex === null ? undefined : dates[activeIndex];

  if (dates.length === 0) {
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
        aria-label={`${label}：合计 ${formatValue(grandTotal)}，${STACKED_PEAK_LABEL[bucket]} ${formatValue(peak)}`}
        className={`flex items-end gap-1 ${CHART_FOCUS_RING}`}
        style={{ height }}
      >
        {dates.map((date, index) => (
          <div
            key={date}
            title={`${date} · ${series
              .map((item) => `${item.name} ${formatValue(item.values[index] ?? 0)}`)
              .join('，')}`}
            className={`flex h-full min-w-0 flex-1 flex-col justify-end overflow-hidden rounded-t-sm ${
              index === activeIndex ? 'ring-2 ring-line-focus' : ''
            }`}
          >
            {/* 自上而下画：先渲染最上面的一段，视觉顺序与图例一致 */}
            {[...series].reverse().map((item, reversedIndex) => {
              const value = Math.max(0, item.values[index] ?? 0);
              const color = item.color ?? seriesAt(series.length - 1 - reversedIndex);
              if (value <= 0) return null;
              return (
                <span
                  key={item.name}
                  className={`w-full ${CHART_SERIES_BAR[color]}`}
                  style={{ height: `${(value / scale) * 100}%` }}
                />
              );
            })}
            {totals[index] === 0 && <span className="h-0.5 w-full bg-inset" />}
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-2xs text-content-tertiary">
        <span>{formatDate(dates[0]!)}</span>
        <span aria-live="polite" className="tabular">
          {activeIndex === null || activeDate === undefined
            ? `合计 ${formatValue(grandTotal)}`
            : `${formatDate(activeDate)} · ${series
                .map((item) => `${item.name} ${formatValue(item.values[activeIndex] ?? 0)}`)
                .join(' · ')}`}
        </span>
        <span>{formatDate(dates[dates.length - 1]!)}</span>
      </div>

      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-content-secondary">
        {series.map((item, index) => {
          const color = item.color ?? seriesAt(index);
          return (
            <li key={item.name} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-sm ${CHART_SERIES_DOT[color]}`} aria-hidden />
              {item.name}
            </li>
          );
        })}
      </ul>

      <figcaption className="sr-only">
        <ul>
          {dates.map((date, index) => (
            <li key={date}>
              {date}：
              {series
                .map((item) => `${item.name} ${formatValue(item.values[index] ?? 0)}`)
                .join('，')}
              ，合计 {formatValue(totals[index] ?? 0)}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
};

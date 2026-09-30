import React from 'react';
import type { DayPoint } from '../../utils/stats';
import { CHART_FILL, CHART_STROKE } from './tones';
import type { ChartTone } from './tones';
import { formatShortDate } from '../../utils/date';
import { CHART_FOCUS_RING, useChartCursor } from './useChartCursor';
import { LINE_POINT_LABEL } from './buckets';
import type { ChartBucket } from './buckets';

export interface LineChartProps {
  /** 按时间升序的数据点；折线按给定顺序连线，不会自己排序 */
  data: DayPoint[];
  /** 无障碍描述，必填（图形本身读不出来） */
  label: string;
  tone?: ChartTone;
  height?: number;
  formatValue?: (value: number) => string;
  /** 底部首尾刻度的格式化 */
  formatDate?: (key: string) => string;
  /** 聚合粒度：描述里说「次记录」还是「周 / 个月」跟着它走 */
  bucket?: ChartBucket;
  className?: string;
}

/** 折线只画在上下各留 8% 的区间里，避免最高 / 最低点贴着边框 */
const TOP = 8;
const BOTTOM = 92;

/**
 * 折线图，用于**数值本身有意义**的序列（体重、体脂这类）。
 *
 * 与 BarChart 的区别很关键：柱状图默认从 0 起算，适合「数量」，
 * 而体重从 0 起算会变成一条毫无信息的直线，所以这里按 min–max 自适应。
 * 点之间按数据顺序直连，缺测的日子不会被补成 0 —— 补出来的 0 会把折线拽到底部。
 *
 * 键盘用户可聚焦图表后用左右键逐点读：图里落一条竖线，底部说明行同步显示那一天的数值。
 */
export const LineChart: React.FC<LineChartProps> = ({
  data,
  label,
  tone = 'accent',
  height = 140,
  formatValue = (value) => String(value),
  formatDate = formatShortDate,
  bucket = 'day',
  className = '',
}) => {
  // 钩子必须在提前 return 之前调用，否则空数据与非空数据走的是两套 Hook 顺序
  const cursor = useChartCursor(data.length);
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

  const values = data.map((point) => point.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min;
  /** 数值全相同时给一条居中水平线，而不是压在最底下 */
  const ratioOf = (value: number): number => (span === 0 ? 0.5 : (value - min) / span);
  const step = data.length > 1 ? 100 / (data.length - 1) : 0;

  const coords = data.map((point, index) => ({
    x: data.length > 1 ? index * step : 50,
    y: BOTTOM - ratioOf(point.value) * (BOTTOM - TOP),
    point,
  }));

  const line = coords.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${coords[0]!.x.toFixed(2)},100 ${line} ${coords[coords.length - 1]!.x.toFixed(2)},100`;
  const latest = data[data.length - 1]!;
  /** 悬停热区的宽度：点数越多越窄，单点时铺满 */
  const band = data.length > 1 ? step : 100;
  const active = cursor.index === null ? undefined : coords[cursor.index];

  return (
    <figure className={className}>
      <div
        {...cursor.containerProps}
        role="img"
        aria-label={`${label}：共 ${data.length} ${LINE_POINT_LABEL[bucket]}，最新 ${formatValue(latest.value)}，最低 ${formatValue(min)}，最高 ${formatValue(max)}`}
        className={`relative ${CHART_FOCUS_RING}`}
        style={{ height }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
          {/* 上下各一条虚线，标出这段区间的高低水位 */}
          {span > 0 && (
            <>
              <line
                x1={0}
                x2={100}
                y1={TOP}
                y2={TOP}
                className="stroke-line-subtle"
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={0}
                x2={100}
                y1={BOTTOM}
                y2={BOTTOM}
                className="stroke-line-subtle"
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
          <polygon points={area} className={`${CHART_FILL[tone]} opacity-15`} aria-hidden />
          <polyline
            points={line}
            fill="none"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={CHART_STROKE[tone]}
            aria-hidden
          />
          {/* 键盘光标：一条竖线指出当前读到的是哪一天 */}
          {active && (
            <line
              x1={active.x}
              x2={active.x}
              y1={0}
              y2={100}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
              className="stroke-line-strong"
              aria-hidden
            />
          )}
          {/* 透明热区负责鼠标悬停提示；用矩形而不是圆点，避免拉伸后变形 */}
          {coords.map(({ x, point }) => (
            <rect
              key={point.date}
              x={Math.max(0, x - band / 2)}
              y={0}
              width={band}
              height={100}
              fill="transparent"
            >
              <title>{`${point.date} · ${formatValue(point.value)}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-2xs text-content-tertiary">
        <span>{formatDate(data[0]!.date)}</span>
        <span aria-live="polite" className="tabular">
          {active
            ? `${formatDate(active.point.date)} · ${formatValue(active.point.value)}`
            : `最低 ${formatValue(min)} · 最高 ${formatValue(max)}`}
        </span>
        <span>{formatDate(latest.date)}</span>
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

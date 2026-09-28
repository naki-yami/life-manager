import React from 'react';
import { normalizeToUnit } from '../../utils/stats';
import { CHART_FILL, CHART_STROKE } from './tones';
import type { ChartTone } from './tones';

export interface SparklineProps {
  data: number[];
  /** 无障碍描述，必填（图形本身读不出来） */
  label: string;
  tone?: ChartTone;
  height?: number;
  className?: string;
}

/**
 * 迷你折线：只用来表示趋势，没有坐标轴，
 * 所以数据不足两个点时直接给一条底色，避免画出误导性的直线。
 */
export const Sparkline: React.FC<SparklineProps> = ({
  data,
  label,
  tone = 'accent',
  height = 32,
  className = '',
}) => {
  if (data.length < 2) {
    return (
      <div
        role="img"
        aria-label={`${label}（数据不足）`}
        style={{ height }}
        className={`w-full rounded-sm bg-inset ${className}`}
      />
    );
  }

  const points = normalizeToUnit(data);
  const width = 100;
  const step = width / (points.length - 1);
  const coords = points
    .map((point, index) => `${(index * step).toFixed(2)},${((1 - point) * 100).toFixed(2)}`)
    .join(' ');
  const area = `0,100 ${coords} ${width},100`;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} 100`}
      preserveAspectRatio="none"
      style={{ height }}
      className={`w-full ${className}`}
    >
      <polygon points={area} className={`${CHART_FILL[tone]} opacity-15`} aria-hidden />
      <polyline
        points={coords}
        fill="none"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={CHART_STROKE[tone]}
        aria-hidden
      />
    </svg>
  );
};

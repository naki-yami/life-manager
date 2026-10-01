import React from 'react';
import { normalizeToUnit } from '../../utils/stats';
import { CHART_BAR, CHART_FILL, CHART_STROKE } from './tones';
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
 * 折线在 viewBox 里留的横向余量（占宽度的百分比）。
 * 描边固定 2px（non-scaling-stroke），贴到边缘会被裁掉半个线宽，
 * 所以四个方向都往回收一点，圆头端点才有地方站完整。
 */
const PAD_X = 2;

/**
 * 纵向余量，单位同样是 viewBox 的百分比。
 *
 * 它是按比例缩放的：渲染高度一变余量跟着变，短图不会因为被压扁而切角
 * （2px 描边是固定像素，在 24px 高的图里占的比重比 64px 高的大得多）。
 * 取值保证「2px 描边的一半」和「末端圆点半径 2px」都落在框内。
 */
const PAD_Y = 10;

/** 末端圆点的直径（px），与上面 PAD_Y 的取值是一对 */
const DOT_SIZE = 4;

/**
 * 迷你折线：只用来表示趋势，没有坐标轴，
 * 所以数据不足两个点时直接给一条底色，避免画出误导性的直线。
 *
 * 末端点一个圆点标出「现在」——否则右端只是一个硬切下来的斜口，
 * 读不出走势停在哪一档。
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
  const step = (100 - PAD_X * 2) / (points.length - 1);
  const yOf = (point: number) => PAD_Y + (1 - point) * (100 - PAD_Y * 2);
  const coords = points
    .map((point, index) => `${(PAD_X + index * step).toFixed(2)},${yOf(point).toFixed(2)}`)
    .join(' ');
  const area = `${PAD_X},100 ${coords} ${100 - PAD_X},100`;
  const lastY = yOf(points[points.length - 1] ?? 0);

  return (
    <div
      role="img"
      aria-label={label}
      style={{ height }}
      className={`relative w-full ${className}`}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
        <polygon points={area} className={`${CHART_FILL[tone]} opacity-15`} />
        <polyline
          points={coords}
          fill="none"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={CHART_STROKE[tone]}
        />
      </svg>
      <span
        aria-hidden
        style={{ left: `${100 - PAD_X}%`, top: `${lastY}%`, width: DOT_SIZE, height: DOT_SIZE }}
        className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${CHART_BAR[tone]}`}
      />
    </div>
  );
};

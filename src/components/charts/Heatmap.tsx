import React from 'react';
import type { DayPoint } from '../../utils/stats';
import { activeDays, heatLevel, sumOf, weekdayIndex } from '../../utils/stats';

export interface HeatmapProps {
  data: DayPoint[];
  /** 无障碍描述，必填 */
  label: string;
  cellSize?: number;
  className?: string;
}

const LEVEL_BACKGROUND = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'];

/**
 * 日历热力图（GitHub 贡献图那种）。
 * 按周一到周日排成 7 行，不足一周的部分用空格子补齐。
 */
export const Heatmap: React.FC<HeatmapProps> = ({ data, label, cellSize = 12, className = '' }) => {
  const max = Math.max(0, ...data.map((point) => point.value));
  const total = sumOf(data.map((point) => point.value));
  const active = activeDays(data).length;

  const slots: Array<DayPoint | null> = [];
  if (data.length > 0) {
    const offset = weekdayIndex(data[0]!.date);
    for (let i = 0; i < offset; i += 1) slots.push(null);
    slots.push(...data);
    while (slots.length % 7 !== 0) slots.push(null);
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto pb-1">
        <div
          role="img"
          aria-label={`${label}：${data.length} 天里有 ${active} 天有记录，合计 ${total}`}
          className="grid w-max grid-flow-col gap-1"
          style={{ gridTemplateRows: `repeat(7, ${cellSize}px)` }}
        >
          {slots.map((point, index) =>
            point === null ? (
              <span
                key={`blank-${index}`}
                aria-hidden
                style={{ width: cellSize, height: cellSize }}
              />
            ) : (
              <span
                key={point.date}
                title={`${point.date} · ${point.value}`}
                style={{ width: cellSize, height: cellSize }}
                className={`rounded-sm ${LEVEL_BACKGROUND[heatLevel(point.value, max)]}`}
              />
            ),
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-2xs text-content-tertiary">
        <span>少</span>
        {LEVEL_BACKGROUND.map((background) => (
          <span key={background} aria-hidden className={`h-2.5 w-2.5 rounded-sm ${background}`} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
};

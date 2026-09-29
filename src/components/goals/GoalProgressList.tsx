import React from 'react';
import { Badge, ProgressRing, type ProgressTone } from '../ui';
import {
  GOAL_PERIOD_LABELS,
  goalGapText,
  goalMetricLabel,
  goalPercent,
  goalValueText,
  type GoalProgress,
} from '../../utils/goals';

/**
 * 目标进度列表。
 *
 * 首页卡片与统计页共用同一份列表，于是「还差多少」「达成率怎么配色」
 * 只在这里写一次 —— 两处口径不一致比样式不一致更让人困惑。
 */
export interface GoalProgressListProps {
  items: readonly GoalProgress[];
  /** 行尾的操作按钮（编辑 / 删除）；只读场景不传 */
  renderActions?: (item: GoalProgress) => React.ReactNode;
  /** 是否显示周期标签；按周期分组后它已经是冗余信息 */
  showPeriod?: boolean;
  className?: string;
}

/** 达成率配色：到了就是绿的，过半给主色，其余给提醒色 */
const ringTone = (rate: number): ProgressTone =>
  rate >= 1 ? 'success' : rate >= 0.6 ? 'accent' : 'warning';

export const GoalProgressList: React.FC<GoalProgressListProps> = ({
  items,
  renderActions,
  showPeriod = true,
  className = '',
}) => (
  <ul className={`space-y-3 ${className}`}>
    {items.map((item) => {
      const percent = goalPercent(item);
      const label = goalMetricLabel(item.goal);
      return (
        <li key={item.goal.id} className="flex items-center gap-3">
          <ProgressRing
            size={44}
            strokeWidth={5}
            value={item.current}
            max={item.target}
            tone={ringTone(item.rate)}
            label={`${label}达成率 ${percent}%`}
          >
            <span className="text-2xs tabular text-content-secondary">{percent}%</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-content">{label}</p>
            <p className="truncate text-xs text-content-tertiary">
              {showPeriod ? `${GOAL_PERIOD_LABELS[item.goal.period]} · ` : ''}
              {goalValueText(item)}
            </p>
          </div>
          <Badge tone={item.reached ? 'success' : 'default'}>
            {item.reached ? '已达成' : `还差 ${goalGapText(item)}`}
          </Badge>
          {renderActions?.(item)}
        </li>
      );
    })}
  </ul>
);

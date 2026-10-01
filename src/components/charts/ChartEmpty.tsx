import React from 'react';

export interface ChartEmptyProps {
  /** 图表的无障碍描述（会拼上 suffix 作为后缀） */
  label: string;
  height: number;
  /** 空态原因，默认「暂无数据」 */
  suffix?: string;
  className?: string;
}

/**
 * 图表没有数据时的占位。
 *
 * 原先只有一块底色，页面上看就是一个空的灰盒子 —— 不说为什么空、也不知道该做什么。
 * 这里补一行说明。因为整体是 `role="img"` + `aria-label`，里层的文字对读屏是静默的，
 * 读到的仍然是上面那一句描述，不会读两遍。
 */
export const ChartEmpty: React.FC<ChartEmptyProps> = ({
  label,
  height,
  suffix = '暂无数据',
  className = '',
}) => (
  <div
    role="img"
    aria-label={`${label}（${suffix}）`}
    style={{ height }}
    className={`flex w-full items-center justify-center rounded-sm bg-inset text-xs text-content-tertiary ${className}`}
  >
    {suffix}
  </div>
);

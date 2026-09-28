/** 图表配色统一复用语义状态色，避免多套色板 */
export type ChartTone = 'accent' | 'success' | 'warning' | 'danger';

export const CHART_STROKE: Record<ChartTone, string> = {
  accent: 'stroke-accent',
  success: 'stroke-success',
  warning: 'stroke-warning',
  danger: 'stroke-danger',
};

export const CHART_FILL: Record<ChartTone, string> = {
  accent: 'fill-accent',
  success: 'fill-success',
  warning: 'fill-warning',
  danger: 'fill-danger',
};

export const CHART_BAR: Record<ChartTone, string> = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

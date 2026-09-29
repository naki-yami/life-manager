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

/**
 * 多序列用的分类色序号。
 *
 * 语义色只有 4 个（accent / success / warning / danger），而一张图里可能有 6、7 条序列，
 * 硬套语义色只会让两条无关的线同色。这 8 个色相在亮暗两套主题里都两两可区分、
 * 与底色对比度 >= 3:1（`tokens.css` 的 `--lm-chart-N`，校验见 `tokens.test.ts`）。
 */
export type ChartSeriesIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const CHART_SERIES: readonly ChartSeriesIndex[] = [1, 2, 3, 4, 5, 6, 7, 8];

/** 第 n 条序列取第 n 个色，超出 8 条就从头轮转 */
export function seriesAt(index: number): ChartSeriesIndex {
  const normalized = ((Math.trunc(index) % 8) + 8) % 8;
  return (normalized + 1) as ChartSeriesIndex;
}

export const CHART_SERIES_BAR: Record<ChartSeriesIndex, string> = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
  6: 'bg-chart-6',
  7: 'bg-chart-7',
  8: 'bg-chart-8',
};

export const CHART_SERIES_STROKE: Record<ChartSeriesIndex, string> = {
  1: 'stroke-chart-1',
  2: 'stroke-chart-2',
  3: 'stroke-chart-3',
  4: 'stroke-chart-4',
  5: 'stroke-chart-5',
  6: 'stroke-chart-6',
  7: 'stroke-chart-7',
  8: 'stroke-chart-8',
};

export const CHART_SERIES_FILL: Record<ChartSeriesIndex, string> = {
  1: 'fill-chart-1',
  2: 'fill-chart-2',
  3: 'fill-chart-3',
  4: 'fill-chart-4',
  5: 'fill-chart-5',
  6: 'fill-chart-6',
  7: 'fill-chart-7',
  8: 'fill-chart-8',
};

/** 图例色块：与柱子/折线同一套分类色 */
export const CHART_SERIES_DOT: Record<ChartSeriesIndex, string> = CHART_SERIES_BAR;

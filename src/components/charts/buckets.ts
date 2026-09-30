/**
 * 图表的聚合粒度。
 *
 * 图表自己不知道数据是「一天一根柱子」还是「一周一根」，但无障碍描述里得说对 ——
 * 按周聚合的图念成「单日最高」是在骗读屏用户。所以由调用方把粒度报进来，
 * 措辞留在图表这边，各图按自己的句式取词（柱状图说「单日最高」，堆叠柱说「最高一天」）。
 */
export type ChartBucket = 'day' | 'week' | 'month';

export const BAR_PEAK_LABEL: Record<ChartBucket, string> = {
  day: '单日最高',
  week: '单周最高',
  month: '单月最高',
};

export const STACKED_PEAK_LABEL: Record<ChartBucket, string> = {
  day: '最高一天',
  week: '最高一周',
  month: '最高一月',
};

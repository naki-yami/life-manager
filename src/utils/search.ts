/**
 * 列表页共用的关键词过滤。
 *
 * 统一成「忽略大小写 + 去首尾空格 + 任一字段命中即保留」，
 * 避免每个页面各写一遍、行为逐渐不一致。
 *
 * 开头的 `#` 会被去掉：标签在界面上显示成 `#工作`，直接照抄进搜索框也应该能筛出来。
 */
export function matchesKeyword(
  keyword: string,
  ...fields: Array<string | undefined | null>
): boolean {
  const query = keyword.trim().toLowerCase().replace(/^#+/, '');
  if (query === '') return true;
  return fields.some((field) => field?.toLowerCase().includes(query));
}

export function filterByKeyword<T>(
  items: readonly T[],
  keyword: string,
  fields: (item: T) => Array<string | undefined | null>,
): T[] {
  if (keyword.trim() === '') return [...items];
  return items.filter((item) => matchesKeyword(keyword, ...fields(item)));
}

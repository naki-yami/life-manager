import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { filterByKeyword } from '../utils/search';

/**
 * 列表页共用的「关键词 + 状态筛选」状态机。
 *
 * 抽它的理由很直白：读书 / 写作 / 游戏 / 开发 / 健身 / 饮食六个页面写的是同一段东西
 * （两个 useState、一个 useMemo 筛两遍、一个 countOf、一个「是空库还是没筛出来」的判断），
 * 各写一遍的代价不是行数，是行为会慢慢漂移 —— 有的页面 #标签 能搜出来，有的不能。
 *
 * 渲染部分不在这一层：这一层只管「哪些条目要展示」，列表长什么样仍由页面决定。
 */

/** 筛选值：'all' 表示不筛 */
export type ListFilter<F extends string> = F | 'all';

export interface UseEntityListOptions<T, F extends string> {
  /** 全量数据 */
  items: readonly T[];
  /**
   * 一条记录里参与关键词匹配的字段。
   *
   * **建议定义在模块级**（`const BOOK_FIELDS = (book: Book) => [...]`）或包一层 `useCallback`：
   * 它进 useMemo 的依赖，每次渲染都新建的内联箭头函数会让缓存失效。
   * 真写成内联的也不会算错，只是白算一遍。
   */
  searchFields: (item: T) => Array<string | undefined | null>;
  /** 状态取值函数；不传就是「只能搜、不能筛」。同样建议是稳定引用 */
  statusOf?: (item: T) => F;
  initialFilter?: ListFilter<F>;
}

export interface EntityList<T, F extends string> {
  keyword: string;
  setKeyword: Dispatch<SetStateAction<string>>;
  filter: ListFilter<F>;
  setFilter: Dispatch<SetStateAction<ListFilter<F>>>;
  /** 按当前关键词与筛选条件算出来的、真正要展示的条目 */
  visible: T[];
  /** 某个筛选项下有多少条（'all' 返回总数），给分段控件显示角标用 */
  countOf: (value: ListFilter<F>) => number;
  /** 本来有数据、但被当前条件筛空了：空态文案要据此区分「库是空的」和「没筛出来」 */
  filteredOut: boolean;
  /** 清掉关键词、筛选回到「全部」；空态里那个「清除筛选」按钮用 */
  clearFilters: () => void;
}

export function useEntityList<T, F extends string>({
  items,
  searchFields,
  statusOf,
  initialFilter = 'all',
}: UseEntityListOptions<T, F>): EntityList<T, F> {
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<ListFilter<F>>(initialFilter);

  const visible = useMemo(() => {
    const byStatus =
      statusOf === undefined || filter === 'all'
        ? items
        : items.filter((item) => statusOf(item) === filter);
    return filterByKeyword(byStatus, keyword, searchFields);
  }, [items, filter, keyword, searchFields, statusOf]);

  const countOf = useCallback(
    (value: ListFilter<F>): number => {
      if (value === 'all' || statusOf === undefined) return items.length;
      return items.filter((item) => statusOf(item) === value).length;
    },
    [items, statusOf],
  );

  const clearFilters = useCallback((): void => {
    setKeyword('');
    setFilter('all');
  }, []);

  return {
    keyword,
    setKeyword,
    filter,
    setFilter,
    visible,
    countOf,
    filteredOut: items.length > 0 && visible.length === 0,
    clearFilters,
  };
}

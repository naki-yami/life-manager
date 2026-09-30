import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * 列表页共用的「多选 → 批量操作」状态机。
 *
 * 抽它的理由跟 useEntityList 一样：任务 / 书 / 游戏三个页面写的是同一段东西
 * （一个 Set、一个 isActive、一个 toggle、一个全选/清空），各写一遍的代价不是行数，
 * 是行为会漂移 —— 有的页面全选选的是全部、有的是筛出来的，用户根本猜不到。
 *
 * 这里把语义定死：**全选只作用于传进来的那批 id**，也就是「当前看得见的东西」。
 * 用户筛出 5 条之后点全选，删的就是这 5 条。
 */

export interface UseMultiSelectOptions {
  /**
   * 当前可选的 id 集合，通常是「当前展示的条目」。
   *
   * 这个参数不只是给 selectAll 用的，更重要的用途是**自动失效**：
   * 筛条件变了、条目被删了、切了视图，选中集里那些已经不在列表里的 id 必须被剔除。
   * 不剔的话，用户看不到它们却仍在选中集里，批量删除就会删掉屏幕上没有的东西。
   */
  ids: readonly string[];
}

export interface MultiSelect {
  /** 有没有进入批量模式（选中了至少一条） */
  isActive: boolean;
  /** 选中了多少条 */
  count: number;
  /** 某条是否被选中 */
  has: (id: string) => boolean;
  /** 勾选 / 取消某一条 */
  toggle: (id: string) => void;
  /** 全选当前可选的条目 */
  selectAll: () => void;
  /** 退出批量模式、清空选中 */
  clear: () => void;
  /** 当前选中的 id 列表（顺序按选择先后） */
  selectedIds: string[];
}

export function useMultiSelect({ ids }: UseMultiSelectOptions): MultiSelect {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  /*
   * 失效剔除。
   *
   * 用「求交集」而不是「遍历已选、逐个判断在不在 ids 里」：前者是 O(n+m)，后者对每条
   * 已选项都做一次 includes。差别在小列表上无所谓，但这段代码抄进任何一个列表页都会
   * 被带着走，不如一开始就写对。
   *
   * 求完交集如果大小没变，就把原引用还回去 —— 否则每次渲染都 new 一个 Set，
   * 下面所有以 selected 为依赖的 useMemo/useCallback 全部失效，白算。
   */
  const available = useMemo(() => new Set(ids), [ids]);
  useEffect(() => {
    setSelected((previous) => {
      let kept = 0;
      for (const id of previous) if (available.has(id)) kept += 1;
      if (kept === previous.size) return previous;

      const next = new Set<string>();
      for (const id of previous) if (available.has(id)) next.add(id);
      return next;
    });
  }, [available]);

  const toggle = useCallback((id: string): void => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((): void => {
    setSelected(new Set(ids));
  }, [ids]);

  const clear = useCallback((): void => {
    setSelected(new Set());
  }, []);

  const has = useCallback((id: string): boolean => selected.has(id), [selected]);

  return {
    isActive: selected.size > 0,
    count: selected.size,
    has,
    toggle,
    selectAll,
    clear,
    selectedIds: [...selected],
  };
}

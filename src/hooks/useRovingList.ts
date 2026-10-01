import { useCallback, type KeyboardEvent } from 'react';
import { FOCUSABLE_SELECTOR } from './useFocusTrap';
import { isTextEntryTarget } from './useShortcuts';

/**
 * 列表项的行间键盘导航。
 *
 * 为什么要有它：一份 40 条的书单，纯靠 Tab 走一遍要按几百下 —— 每一行里都有收藏、状态、
 * 标签、进度、几个操作按钮。j / k 把「走完整份列表」从几百下压成几十下，x 则让键盘用户
 * 够得着批量模式（那个入口本来只有「批量」按钮能点）。
 *
 * 契约（三条，页面上照做就行）：
 * 1. 每行根元素带 `data-row-id={id}`，id 与本 hook 收到的 `ids` 是同一批；
 * 2. 行里想被 j / k 落到的那个控件带 `data-row-focus`（一般是这一行的主操作，
 *    比如「笔记」「编辑」）—— 于是**回车就是它的原生动作**，不需要再发明一套激活语义；
 * 3. `onKeyDown` 挂到包住所有行的容器上（通常是 `<ul>`）。
 *
 * 行里没标锚点时退到第一个可聚焦控件，一个都没有就落在行本身（`rowProps` 已经给了
 * `tabIndex={-1}`，所以落得上）。
 *
 * 为什么不挂 window：全局单键（`n` / `/` / `g+数字`）在 useShortcuts 里，那是「整页级」的；
 * 列表导航只在焦点落在列表里时生效，所以贴着容器挂。多份列表并排时也各管各的，不会打架。
 *
 * **不拦截回车**：焦点已经落在锚点控件上，回车交给它自己。
 */

export const ROW_ID_ATTR = 'data-row-id';
export const ROW_FOCUS_ATTR = 'data-row-focus';

export interface UseRovingListOptions {
  /** 当前列表里可见条目的 id，顺序即 j / k 走动的顺序 */
  ids: readonly string[];
  /**
   * 按 x 时对当前行做的事，通常是多选 toggle。
   * 不传就没有 x —— 没有批量操作的列表不该假装有。
   */
  onToggleSelect?: (id: string) => void;
}

export interface RovingList {
  /** 挂到包住所有行的容器上 */
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/** 行根元素的约定属性；`tabIndex=-1` 是为了「行里没有任何可聚焦控件」时焦点也有落点 */
export function rowProps(id: string): { 'data-row-id': string; tabIndex: number } {
  return { 'data-row-id': id, tabIndex: -1 };
}

/** 标在行内那个「主操作」控件上，j / k 落在它身上 */
export const ROW_FOCUS_PROP = { [ROW_FOCUS_ATTR]: true } as const;

/** 焦点落到这一行的哪儿 */
function focusRow(row: HTMLElement): void {
  const focusTarget =
    row.querySelector<HTMLElement>(`[${ROW_FOCUS_ATTR}]`) ??
    row.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  (focusTarget ?? row).focus();
}

/** 从容器里捞出某一行的元素；按 dataset 比对，省得给 id 做选择器转义 */
function rowIn(container: HTMLElement, id: string): HTMLElement | undefined {
  return Array.from(container.querySelectorAll<HTMLElement>(`[${ROW_ID_ATTR}]`)).find(
    (node) => node.dataset.rowId === id,
  );
}

export function useRovingList({ ids, onToggleSelect }: UseRovingListOptions): RovingList {
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // 行里的标签编辑器、进度输入框都是真输入框，在它们里面打字时 j / k 让路
      if (isTextEntryTarget(event.target)) return;
      if (!(event.target instanceof HTMLElement)) return;

      const container = event.currentTarget;
      const row = event.target.closest<HTMLElement>(`[${ROW_ID_ATTR}]`);
      if (!row || !container.contains(row)) return;

      const currentId = row.dataset.rowId;
      const index = currentId === undefined ? -1 : ids.indexOf(currentId);
      if (index < 0) return;

      if (event.key === 'x') {
        event.preventDefault();
        if (onToggleSelect && currentId !== undefined) onToggleSelect(currentId);
        return;
      }

      const clamp = (value: number): number => Math.min(ids.length - 1, Math.max(0, value));
      let next: number;
      switch (event.key) {
        case 'j':
        case 'ArrowDown':
          next = clamp(index + 1);
          break;
        case 'k':
        case 'ArrowUp':
          next = clamp(index - 1);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = ids.length - 1;
          break;
        default:
          return;
      }

      /*
       * 方向键在这里是「走列表」而不是滚页面 —— 与图表光标同一套规矩。
       * 到头了也照样 preventDefault：不然最后一行按 j 会突然开始滚页面，手感很怪。
       */
      event.preventDefault();
      if (next === index) return;

      const nextId = ids[next];
      if (nextId === undefined) return;
      const nextRow = rowIn(container, nextId);
      if (nextRow) focusRow(nextRow);
    },
    [ids, onToggleSelect],
  );

  return { onKeyDown };
}

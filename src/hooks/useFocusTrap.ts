import { useCallback, useEffect, type KeyboardEvent, type RefObject } from 'react';

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface UseFocusTrapOptions {
  /** 按下 Esc 时调用 */
  onClose?: () => void;
  /** 是否锁住背景滚动，默认开 */
  lockScroll?: boolean;
}

/**
 * 浮层的通用行为：打开时把焦点移入、Tab 在内部循环、Esc 关闭、关闭后归还焦点。
 *
 * Modal / Drawer / 命令面板共用同一份实现，避免三处各写一遍后行为逐渐跑偏。
 * 返回的 handler 要挂到浮层根元素的 onKeyDown 上。
 */
export function useFocusTrap<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  options: UseFocusTrapOptions = {},
) {
  const { onClose, lockScroll = true } = options;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const first = container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? container)?.focus();

    const previousOverflow = lockScroll ? document.body.style.overflow : null;
    if (lockScroll) document.body.style.overflow = 'hidden';

    return () => {
      if (lockScroll && previousOverflow !== null) document.body.style.overflow = previousOverflow;
      // 元素已经从 DOM 上摘掉时不要再 focus，否则会把焦点丢到 body 上
      if (previous?.isConnected) previous.focus?.();
    };
  }, [containerRef, lockScroll]);

  return useCallback(
    (event: KeyboardEvent<T>) => {
      if (event.key === 'Escape' && onClose) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first?.focus();
      }
    },
    [containerRef, onClose],
  );
}

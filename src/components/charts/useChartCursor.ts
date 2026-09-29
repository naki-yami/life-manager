import { useCallback, useState, type KeyboardEvent } from 'react';

export interface ChartCursor {
  /** 当前读到的点下标；没聚焦时为 null */
  index: number | null;
  /** 挂到图表容器上：可聚焦 + 左右键移动光标 */
  containerProps: {
    tabIndex: number;
    onFocus: () => void;
    onBlur: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  };
}

/**
 * 图表的键盘读点。
 *
 * 每个点都有 `title` 提示，但那只对鼠标有效；读屏用户虽然能听 figcaption 里的明细，
 * 键盘用户却没有任何办法逐点查看。于是给图表容器一个 tabIndex：
 * 聚焦后用左右键移动（Home / End 到首尾）光标，图上高亮那一个点，
 * 底部说明行同步换成它的日期与数值 —— 那行带 aria-live，读屏也会念出来。
 *
 * 焦点进入时落在**最后一个点**（最近一天）：绝大多数时候要看的就是它。
 * 失焦即清空光标，图表回到「合计 / 极值」的常态说明。
 */
export function useChartCursor(count: number): ChartCursor {
  const [index, setIndex] = useState<number | null>(null);

  const onFocus = useCallback(() => {
    setIndex((current) => (current === null && count > 0 ? count - 1 : current));
  }, [count]);

  const onBlur = useCallback(() => setIndex(null), []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (count === 0) return;
      const current = index ?? count - 1;
      const clamp = (value: number): number => Math.min(count - 1, Math.max(0, value));

      switch (event.key) {
        case 'ArrowLeft':
          setIndex(clamp(current - 1));
          break;
        case 'ArrowRight':
          setIndex(clamp(current + 1));
          break;
        case 'Home':
          setIndex(0);
          break;
        case 'End':
          setIndex(count - 1);
          break;
        case 'Escape':
          setIndex(null);
          return;
        default:
          return;
      }
      // 方向键在这里是「读点」而不是滚动页面
      event.preventDefault();
    },
    [count, index],
  );

  return { index, containerProps: { tabIndex: 0, onFocus, onBlur, onKeyDown } };
}

/** 图表容器在键盘聚焦时的样式：与其它可聚焦控件同一套焦点环 */
export const CHART_FOCUS_RING =
  'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-1 focus-visible:ring-offset-canvas';

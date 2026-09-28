import { useEffect, useState } from 'react';

/**
 * 订阅 CSS 媒体查询。
 *
 * jsdom 与老旧浏览器没有 matchMedia，这里统一降级为 false，
 * 让调用方不必到处判空。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => queryMatches(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const list = window.matchMedia(query);
    setMatches(list.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    // Safari < 14 只支持已废弃的 addListener，做一层兜底
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    }
    list.addListener(onChange);
    return () => list.removeListener(onChange);
  }, [query]);

  return matches;
}

function queryMatches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

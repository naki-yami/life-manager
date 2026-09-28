import { useEffect } from 'react';
import { useUiStore, type Density } from '../store/uiStore';

/**
 * 密度入口：把 compact / comfortable 写到 <html data-density> 上，
 * 由 tokens.css 里的 CSS 变量驱动实际间距。
 */
export function useDensity() {
  const density = useUiStore((state) => state.density);
  const setDensity = useUiStore((state) => state.setDensity);
  const toggleDensity = useUiStore((state) => state.toggleDensity);

  useEffect(() => {
    const root = document.documentElement;
    if (density === 'compact') root.setAttribute('data-density', 'compact');
    else root.removeAttribute('data-density');
  }, [density]);

  return {
    density,
    setDensity: (value: Density) => setDensity(value),
    toggleDensity,
  };
}

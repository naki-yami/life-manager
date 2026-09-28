import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { clearAppStorage } from '../utils/storageKeys';

/*
 * jsdom 没有实现 matchMedia。
 * 这里给一个能记录回调的最小实现：默认不匹配任何查询，
 * 需要控制结果的用例可以用 vi.spyOn(window, 'matchMedia') 覆盖它。
 */
function createMediaQueryList(query: string): MediaQueryList {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener === 'function') {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
}

beforeEach(() => {
  clearAppStorage();
  localStorage.clear();
  vi.stubGlobal('matchMedia', (query: string) => createMediaQueryList(query));
  window.matchMedia = globalThis.matchMedia as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

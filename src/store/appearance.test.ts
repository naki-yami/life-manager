import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { prefersDark, resolveThemeMode, useThemeStore } from './themeStore';
import { DEFAULT_DASHBOARD, useUiStore } from './uiStore';
import { useTheme } from '../hooks/useTheme';
import { useDensity } from '../hooks/useDensity';

/** 让 prefers-color-scheme 返回指定结果 */
function mockSystemPrefersDark(dark: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: dark && query.includes('prefers-color-scheme: dark'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

function persistedState(key: string): Record<string, unknown> | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return (JSON.parse(raw) as { state?: Record<string, unknown> }).state ?? null;
}

beforeEach(() => {
  useThemeStore.setState({ themeMode: 'system' });
  useUiStore.setState({
    sidebarCollapsed: false,
    density: 'comfortable',
    dashboard: DEFAULT_DASHBOARD.map((widget) => ({ ...widget })),
  });
});

afterEach(() => {
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-density');
  vi.restoreAllMocks();
});

describe('resolveThemeMode', () => {
  it('system 按系统偏好解析', () => {
    expect(resolveThemeMode('system', true)).toBe('dark');
    expect(resolveThemeMode('system', false)).toBe('light');
  });

  it('显式模式不受系统影响', () => {
    expect(resolveThemeMode('light', true)).toBe('light');
    expect(resolveThemeMode('dark', false)).toBe('dark');
  });
});

describe('themeStore', () => {
  it('默认跟随系统', () => {
    expect(useThemeStore.getState().themeMode).toBe('system');
  });

  it('切换后持久化到 lm:theme', async () => {
    useThemeStore.getState().setThemeMode('dark');

    // 落盘是异步的（数据可能写进 IndexedDB），断言存储前先等它写完
    await vi.waitFor(() => {
      expect(persistedState(STORAGE_KEYS.theme)?.themeMode).toBe('dark');
    });
  });

  it('旧 API setTheme 等价于设定具体模式', () => {
    useThemeStore.getState().setTheme('light');
    expect(useThemeStore.getState().themeMode).toBe('light');
  });

  it('当前是「跟随系统」时，toggle 按系统解析结果取反', () => {
    mockSystemPrefersDark(true);
    useThemeStore.setState({ themeMode: 'system' });
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().themeMode).toBe('light');
  });

  it('prefersDark 在 matchMedia 缺失时安全降级', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => {
      throw new Error('not supported');
    });
    expect(prefersDark()).toBe(false);
  });

  it('旧版 { theme } 结构会被迁移成 themeMode', async () => {
    localStorage.setItem(
      STORAGE_KEYS.theme,
      JSON.stringify({ state: { theme: 'dark' }, version: 2 }),
    );
    vi.resetModules();

    const fresh = await import('./themeStore');
    expect(fresh.useThemeStore.getState().themeMode).toBe('dark');
  });

  it('损坏的持久化数据不会让 store 崩掉', async () => {
    localStorage.setItem(STORAGE_KEYS.theme, 'not-json');
    vi.resetModules();

    const fresh = await import('./themeStore');
    expect(fresh.useThemeStore.getState().themeMode).toBe('system');
  });
});

describe('uiStore', () => {
  it('折叠状态与密度都会持久化', async () => {
    useUiStore.getState().toggleSidebar();
    useUiStore.getState().toggleDensity();

    await vi.waitFor(() => {
      const state = persistedState(STORAGE_KEYS.ui);
      expect(state?.sidebarCollapsed).toBe(true);
      expect(state?.density).toBe('compact');
    });
  });

  it('密度在两种取值之间来回切换', () => {
    useUiStore.getState().toggleDensity();
    expect(useUiStore.getState().density).toBe('compact');
    useUiStore.getState().toggleDensity();
    expect(useUiStore.getState().density).toBe('comfortable');
  });
});

describe('useTheme', () => {
  it('跟随系统为暗色时给 <html> 加 dark 类', () => {
    mockSystemPrefersDark(true);
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('切换成亮色后移除 dark 类', () => {
    mockSystemPrefersDark(true);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setThemeMode('light'));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});

describe('useDensity', () => {
  it('紧凑密度写到 <html data-density>', () => {
    const { result } = renderHook(() => useDensity());

    act(() => result.current.toggleDensity());

    expect(document.documentElement.getAttribute('data-density')).toBe('compact');

    act(() => result.current.toggleDensity());
    expect(document.documentElement.hasAttribute('data-density')).toBe(false);
  });
});

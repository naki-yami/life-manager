import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { STORE_VERSION, migrateState } from './persist';

export type ThemeMode = 'light' | 'dark' | 'system';
/** 三种模式解析之后一定是亮或暗，组件只需要关心这个 */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

interface ThemeState {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /** 在亮/暗之间切换；当前是「跟随系统」时，按系统解析结果取反 */
  toggleTheme: () => void;
  /** 兼容旧 API：等价于 setThemeMode('light' | 'dark') */
  setTheme: (theme: ResolvedTheme) => void;
}

const defaultState: { themeMode: ThemeMode } = { themeMode: 'system' };

/**
 * 兼容 v2 及更早存下来的 { theme: 'light' | 'dark' }。
 * 由 STORE_VERSION 升到 3 触发调用；同时做一层就地探测，
 * 防止某些环境里版本号没写进存储的情况。
 */
function migrateTheme(persisted: unknown): { themeMode: ThemeMode } {
  if (typeof persisted !== 'object' || persisted === null) return defaultState;

  const raw = persisted as Record<string, unknown>;
  if (isThemeMode(raw.themeMode)) return { themeMode: raw.themeMode };
  if (isThemeMode(raw.theme)) return { themeMode: raw.theme };

  return migrateState(persisted, defaultState);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      ...defaultState,
      setThemeMode: (themeMode) => set({ themeMode }),
      toggleTheme: () =>
        set((state) => {
          const current = resolveThemeMode(state.themeMode, prefersDark());
          return { themeMode: current === 'dark' ? 'light' : 'dark' };
        }),
      setTheme: (theme) => set({ themeMode: theme }),
    }),
    {
      name: STORAGE_KEYS.theme,
      version: STORE_VERSION,
      partialize: (state) => ({ themeMode: state.themeMode }),
      migrate: migrateTheme,
    },
  ),
);

/** 'system' 解析成具体的亮/暗 */
export function resolveThemeMode(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light';
  return mode;
}

export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

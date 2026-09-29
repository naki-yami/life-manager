import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { persistOptions } from './persist';
import { asRecord } from './normalize';

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
    persistOptions<ThemeState, Pick<ThemeState, 'themeMode'>>({
      name: STORAGE_KEYS.theme,
      partialize: (state) => ({ themeMode: state.themeMode }),
      // 兼容 v2 存下来的二态 { theme: 'light' | 'dark' }，非法值挡回默认
      normalize: (persisted) => {
        const raw = asRecord(persisted);
        if (isThemeMode(raw.themeMode)) return { themeMode: raw.themeMode };
        if (isThemeMode(raw.theme)) return { themeMode: raw.theme };
        return { themeMode: defaultState.themeMode };
      },
    }),
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

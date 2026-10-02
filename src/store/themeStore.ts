import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { persistOptions } from './persist';
import { asRecord } from './normalize';

export type ThemeMode = 'light' | 'dark' | 'system';

/** 主题色预设（U6）：indigo 是默认（不写 data-accent 属性），其余是 CSS 里的覆盖块 */
export type AccentId = 'indigo' | 'teal' | 'green' | 'orange' | 'pink' | 'violet';

export const ACCENT_IDS: AccentId[] = ['indigo', 'teal', 'green', 'orange', 'pink', 'violet'];

export const ACCENT_LABELS: Record<AccentId, string> = {
  indigo: '靛蓝',
  teal: '青',
  green: '绿',
  orange: '橙',
  pink: '粉',
  violet: '紫',
};

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === 'string' && (ACCENT_IDS as string[]).includes(value);
}

/** 界面皮肤：glass 流光玻璃（默认，基线令牌） / paper 纸面扁平（data-appearance 覆盖块） */
export type AppearanceId = 'glass' | 'paper';

export const APPEARANCE_IDS: AppearanceId[] = ['glass', 'paper'];

export const APPEARANCE_LABELS: Record<AppearanceId, string> = {
  glass: '流光玻璃',
  paper: '纸面扁平',
};

export function isAppearanceId(value: unknown): value is AppearanceId {
  return typeof value === 'string' && (APPEARANCE_IDS as string[]).includes(value);
}

/** 三种模式解析之后一定是亮或暗，组件只需要关心这个 */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

interface ThemeState {
  themeMode: ThemeMode;
  /** 主题色预设；indigo 表示不挂 data-accent 属性（用默认令牌） */
  accent: AccentId;
  /** 界面皮肤；glass 表示不挂 data-appearance 属性（基线令牌就是玻璃） */
  appearance: AppearanceId;
  setAccent: (accent: AccentId) => void;
  setAppearance: (appearance: AppearanceId) => void;
  setThemeMode: (mode: ThemeMode) => void;
  /** 在亮/暗之间切换；当前是「跟随系统」时，按系统解析结果取反 */
  toggleTheme: () => void;
  /** 兼容旧 API：等价于 setThemeMode('light' | 'dark') */
  setTheme: (theme: ResolvedTheme) => void;
}

const defaultState: { themeMode: ThemeMode; accent: AccentId; appearance: AppearanceId } = {
  themeMode: 'system',
  accent: 'indigo',
  appearance: 'glass',
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      ...defaultState,
      setAccent: (accent) => set({ accent }),
      setAppearance: (appearance) => set({ appearance }),
      setThemeMode: (themeMode) => set({ themeMode }),
      toggleTheme: () =>
        set((state) => {
          const current = resolveThemeMode(state.themeMode, prefersDark());
          return { themeMode: current === 'dark' ? 'light' : 'dark' };
        }),
      setTheme: (theme) => set({ themeMode: theme }),
    }),
    persistOptions<ThemeState, Pick<ThemeState, 'themeMode' | 'accent' | 'appearance'>>({
      name: STORAGE_KEYS.theme,
      partialize: (state) => ({
        themeMode: state.themeMode,
        accent: state.accent,
        appearance: state.appearance,
      }),
      // 兼容 v2 存下来的二态 { theme: 'light' | 'dark' }，非法值挡回默认
      normalize: (persisted) => {
        const raw = asRecord(persisted);
        const themeMode = isThemeMode(raw.themeMode)
          ? { themeMode: raw.themeMode }
          : isThemeMode(raw.theme)
            ? { themeMode: raw.theme }
            : { themeMode: defaultState.themeMode };
        return {
          ...themeMode,
          accent: isAccentId(raw.accent) ? raw.accent : defaultState.accent,
          // 老存档没有 appearance 字段：默认进玻璃皮（v1.0 之后的新默认）
          appearance: isAppearanceId(raw.appearance) ? raw.appearance : defaultState.appearance,
        };
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

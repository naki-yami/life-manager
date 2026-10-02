import { useEffect } from 'react';
import { useMediaQuery } from './useMediaQuery';
import {
  useThemeStore,
  resolveThemeMode,
  type AppearanceId,
  type ResolvedTheme,
  type ThemeMode,
} from '../store/themeStore';

/** 只解析「跟随系统」的结果，不产生副作用 —— 供只需要读值的组件使用 */
export function useResolvedTheme(): ResolvedTheme {
  const themeMode = useThemeStore((state) => state.themeMode);
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  return resolveThemeMode(themeMode, systemPrefersDark);
}

/**
 * 主题入口：解析出实际亮暗，并把它写到 <html> 上。
 *
 * 真正改主题的是这里（Tailwind 的 darkMode: 'class'），
 * 为了首屏不闪，index.html 里还有一段等价的内联脚本先跑一遍。
 */
export function useTheme() {
  const themeMode = useThemeStore((state) => state.themeMode);
  const accent = useThemeStore((state) => state.accent);
  const appearance = useThemeStore((state) => state.appearance);
  const setThemeMode = useThemeStore((state) => state.setThemeMode);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const setAppearance = useThemeStore((state) => state.setAppearance);
  const theme = useResolvedTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
  }, [theme]);

  // 主题色预设：indigo 是默认令牌，不挂属性；其余挂上让 tokens.css 的覆盖块生效
  useEffect(() => {
    const root = document.documentElement;
    if (accent === 'indigo') delete root.dataset.accent;
    else root.dataset.accent = accent;
  }, [accent]);

  // 界面皮肤：glass 是基线令牌，不挂属性；paper 挂上让覆盖块生效
  useEffect(() => {
    const root = document.documentElement;
    if (appearance === 'glass') delete root.dataset.appearance;
    else root.dataset.appearance = appearance;
  }, [appearance]);

  return {
    /** 用户选择的模式：light / dark / system */
    themeMode,
    /** 解析后的实际主题：light / dark */
    theme,
    isDark: theme === 'dark',
    /** 界面皮肤：glass 流光玻璃 / paper 纸面扁平 */
    appearance: appearance as AppearanceId,
    setThemeMode: (mode: ThemeMode) => setThemeMode(mode),
    toggleTheme,
    setTheme,
    setAppearance: (next: AppearanceId) => setAppearance(next),
  };
}

import React from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Monitor, Moon, Rows3, Rows4, Save, Search, Sun } from 'lucide-react';
import { IconButton, Kbd } from '../ui';
import { ToastContext } from '../ui/toastContext';
import { useTheme } from '../../hooks/useTheme';
import { useUiStore } from '../../store/uiStore';
import { findLocationLabel, findNavItem } from './navItems';
import { useCommandPalette } from './commandPaletteContext';
import type { ThemeMode } from '../../store/themeStore';

interface HeaderProps {
  /** 窄屏打开导航抽屉 */
  onOpenNav: () => void;
}

const THEME_ICON: Record<ThemeMode, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };
const NEXT_THEME_MODE: Record<ThemeMode, ThemeMode> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};
const THEME_LABEL: Record<ThemeMode, string> = {
  light: '亮色',
  dark: '暗色',
  system: '跟随系统',
};

export const Header: React.FC<HeaderProps> = ({ onOpenNav }) => {
  const { pathname } = useLocation();
  const { themeMode, setThemeMode } = useTheme();
  const density = useUiStore((state) => state.density);
  const toggleDensity = useUiStore((state) => state.toggleDensity);
  const { open: openPalette } = useCommandPalette();
  // 单测可能没有 ToastProvider，这里用可选上下文，没 Provider 时静默
  const { toast } = React.useContext(ToastContext) ?? { toast: () => '' };
  const [saving, setSaving] = React.useState(false);

  /**
   * 手动保存：所有数据本来就随每次改动自动写入本地存储，
   * 这里额外留一份带说明的快照（可在设置页回滚），并给出明确反馈。
   * 备份模块按需加载，不进首屏包。
   */
  const handleManualSave = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    try {
      const { createAutoSnapshot } = await import('../../services/backup');
      const key = await createAutoSnapshot('手动保存');
      toast({
        tone: 'success',
        title: '已保存到本地',
        description: key
          ? '数据已写入本地存储，并留了一份快照（可在「数据与设置」里回滚）。'
          : '数据已写入本地存储（快照空间已满，本次未新建快照）。',
      });
    } catch {
      toast({
        tone: 'danger',
        title: '保存失败',
        description: '快照没有创建成功，请稍后重试；数据本身不受影响。',
      });
    } finally {
      setSaving(false);
    }
  };

  const current = findNavItem(pathname);
  // 子页优先：停在 /study/books 时顶栏念「读书」，不念笼统的「书房」
  const title = findLocationLabel(pathname) ?? 'Life Manager';
  const ThemeIcon = THEME_ICON[themeMode];
  const DensityIcon = density === 'compact' ? Rows4 : Rows3;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line-subtle bg-surface px-3 sm:px-4">
      <IconButton
        label="打开导航"
        icon={<Menu size={18} />}
        onClick={onOpenNav}
        className="lg:hidden"
      />

      <div className="flex min-w-0 items-center gap-2.5">
        <div
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-contrast"
        >
          L
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-content">{title}</p>
          <p className="hidden truncate text-2xs text-content-tertiary sm:block">
            {current?.description ?? '个人生活与工作管理'}
          </p>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {/* 窄屏时展开的是纯图标按钮，可见文字被 hidden 掉，所以名称要写在 aria-label 上 */}
        <button
          type="button"
          aria-label="搜索或跳转（快捷键 ⌘K）"
          onClick={openPalette}
          className="flex h-9 items-center gap-2 rounded border border-line-subtle bg-inset px-2.5 text-xs text-content-tertiary transition-colors duration-fast ease-standard hover:border-line hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
        >
          <Search size={14} aria-hidden />
          <span className="hidden lg:inline">搜索或跳转</span>
          <Kbd className="hidden lg:inline-flex">⌘K</Kbd>
        </button>

        <IconButton
          label={saving ? '正在保存…' : '保存到本地'}
          icon={<Save size={18} />}
          onClick={handleManualSave}
        />

        <IconButton
          label={`密度：${density === 'compact' ? '紧凑' : '宽松'}（点击切换）`}
          icon={<DensityIcon size={18} />}
          onClick={toggleDensity}
        />

        <IconButton
          label={`主题：${THEME_LABEL[themeMode]}（点击切换）`}
          icon={<ThemeIcon size={18} />}
          onClick={() => setThemeMode(NEXT_THEME_MODE[themeMode])}
        />
      </div>
    </header>
  );
};

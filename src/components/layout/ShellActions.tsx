import React from 'react';
import { Monitor, Moon, Rows3, Rows4, Save, Search, Sun } from 'lucide-react';
import { IconButton, Kbd } from '../ui';
import { ToastContext } from '../ui/toastContext';
import { useTheme } from '../../hooks/useTheme';
import { useUiStore } from '../../store/uiStore';
import { useCommandPalette } from './commandPaletteContext';
import type { ThemeMode } from '../../store/themeStore';

/**
 * 应用外壳上的那几颗按钮。
 *
 * 桌面端把它们收在侧栏底部、窄屏留在顶栏 —— 同一套动作在两处出现，
 * 各写一份必然走样（快捷键提示、主题循环顺序、保存提示文案都会各说各话），
 * 所以这里只实现一次，由 Header 与 Sidebar 各自取用。
 */

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

export interface SearchButtonProps {
  /**
   * 顶栏里窄屏放不下「搜索或跳转 ⌘K」这一串，所以文字与快捷键提示从 sm 起才显示；
   * 侧栏里宽度固定够用，一直显示。
   */
  compact?: boolean;
}

/** 打开命令面板。 */
export const SearchButton: React.FC<SearchButtonProps> = ({ compact = false }) => {
  const { open } = useCommandPalette();

  return (
    <button
      type="button"
      aria-label="搜索或跳转（快捷键 ⌘K）"
      title="搜索或跳转（快捷键 ⌘K）"
      onClick={open}
      className={`flex h-8 items-center gap-2 rounded border border-line-subtle bg-inset px-2.5 text-xs text-content-tertiary transition-colors duration-fast ease-standard hover:border-line hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
        compact ? '' : 'w-full'
      }`}
    >
      <Search size={14} aria-hidden />
      <span className={`min-w-0 flex-1 truncate text-left ${compact ? 'hidden sm:inline' : ''}`}>
        搜索或跳转
      </span>
      <Kbd className={compact ? 'hidden sm:inline-flex' : ''}>⌘K</Kbd>
    </button>
  );
};

export interface ShellActionsProps {
  /** 窄栏（收起后的侧栏）里排成一列，其余排成一行 */
  orientation?: 'row' | 'column';
  className?: string;
}

/**
 * 保存 / 密度 / 主题三颗。
 *
 * 顺序固定为「先存，再调外观」：手动保存是唯一一个会动数据的动作，
 * 混在几个外观开关里更需要一个稳定的位置。
 */
export const ShellActions: React.FC<ShellActionsProps> = ({
  orientation = 'row',
  className = '',
}) => {
  const { themeMode, setThemeMode } = useTheme();
  const density = useUiStore((state) => state.density);
  const toggleDensity = useUiStore((state) => state.toggleDensity);
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

  const ThemeIcon = THEME_ICON[themeMode];
  const DensityIcon = density === 'compact' ? Rows4 : Rows3;

  return (
    <div
      className={`flex items-center gap-0.5 ${
        orientation === 'column' ? 'flex-col' : ''
      } ${className}`}
    >
      <IconButton
        label={saving ? '正在保存…' : '保存到本地'}
        icon={<Save size={17} />}
        onClick={handleManualSave}
      />
      <IconButton
        label={`密度：${density === 'compact' ? '紧凑' : '宽松'}（点击切换）`}
        icon={<DensityIcon size={17} />}
        onClick={toggleDensity}
      />
      <IconButton
        label={`主题：${THEME_LABEL[themeMode]}（点击切换）`}
        icon={<ThemeIcon size={17} />}
        onClick={() => setThemeMode(NEXT_THEME_MODE[themeMode])}
      />
    </div>
  );
};

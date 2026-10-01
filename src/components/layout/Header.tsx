import React from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { IconButton } from '../ui';
import { SearchButton, ShellActions } from './ShellActions';
import { findLocationLabel, findNavItem } from './navItems';

interface HeaderProps {
  /** 窄屏打开导航抽屉 */
  onOpenNav: () => void;
}

/**
 * 窄屏顶栏。
 *
 * 桌面端根本不渲染它 —— 品牌、搜索入口、保存 / 密度 / 主题都收进了侧栏（见 Sidebar），
 * 页面于是从视口顶上开始，标题区是第一眼看到的东西。留在这里的只有「当前站在哪一页」
 * 和打开抽屉的按钮：侧栏退成抽屉之后，这行标题是不用点开任何东西就能判断位置的唯一依据。
 */
export const Header: React.FC<HeaderProps> = ({ onOpenNav }) => {
  const { pathname } = useLocation();
  const current = findNavItem(pathname);
  // 子页优先：停在 /study/books 时顶栏念「读书」，不念笼统的「书房」
  const title = findLocationLabel(pathname) ?? 'Life Manager';

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line-subtle bg-surface px-3 sm:px-4">
      <IconButton label="打开导航" icon={<Menu size={18} />} onClick={onOpenNav} />

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
        <SearchButton compact />
        <ShellActions />
      </div>
    </header>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Drawer } from '../ui';
import { Header } from './Header';
import { Sidebar, NavList } from './Sidebar';
import { StorageAlert } from './StorageAlert';
import { CommandPaletteProvider } from './CommandPalette';
import { useCommandPalette } from './commandPaletteContext';
import { useTheme } from '../../hooks/useTheme';
import { useDensity } from '../../hooks/useDensity';
import { useGlobalShortcuts } from '../../hooks/useShortcuts';
import { findNavItem } from './navItems';

interface LayoutProps {
  children: React.ReactNode;
}

/**
 * 单页应用换路由时浏览器不会重新加载，读屏用户听不到任何变化。
 * 这里用一个隐藏的 role=status 区域播报新打开的是哪个页面；
 * 首次进入不播报，避免和页面标题重复念一遍。
 */
const RouteAnnouncer: React.FC = () => {
  const { pathname } = useLocation();
  const [message, setMessage] = useState('');
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setMessage(`${findNavItem(pathname)?.label ?? '页面'}已打开`);
  }, [pathname]);

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
};

/**
 * 全局单键快捷键（n / / / g+数字）挂在 Provider 内层，
 * 这样才能拿到命令面板的 open。
 */
const ShortcutBinder: React.FC = () => {
  const palette = useCommandPalette();
  useGlobalShortcuts(palette.open);
  return null;
};

/**
 * 应用外壳。
 *
 * 主题与密度的副作用统一在这里落地（写到 <html> 上），
 * 页面组件只负责内容，不再各管一段 DOM。
 */
export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [navOpen, setNavOpen] = useState(false);

  useTheme();
  useDensity();

  return (
    <CommandPaletteProvider>
      <div className="flex h-screen flex-col bg-canvas text-content">
        {/* 键盘用户按 Tab 第一下就能跳过顶栏与侧栏，直接进内容区 */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:inline-flex focus:h-9 focus:items-center focus:rounded focus:bg-accent focus:px-3.5 focus:text-sm focus:font-medium focus:text-accent-contrast focus:shadow-md"
        >
          跳到主内容
        </a>

        <Header onOpenNav={() => setNavOpen(true)} />

        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main
            id="main-content"
            tabIndex={-1}
            className="min-w-0 flex-1 overflow-y-auto p-page focus:outline-none"
          >
            <div className="mx-auto w-full max-w-5xl">
              {/* 只在写入失败时渲染，正常情况下不占位 */}
              <StorageAlert />
              {children}
            </div>
          </main>
        </div>

        <RouteAnnouncer />

        <ShortcutBinder />

        <Drawer isOpen={navOpen} onClose={() => setNavOpen(false)} title="导航" side="left">
          <NavList onNavigate={() => setNavOpen(false)} />
        </Drawer>
      </div>
    </CommandPaletteProvider>
  );
};

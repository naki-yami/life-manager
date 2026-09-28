import React, { useState } from 'react';
import { Drawer } from '../ui';
import { Header } from './Header';
import { Sidebar, NavList } from './Sidebar';
import { CommandPaletteProvider } from './CommandPalette';
import { useTheme } from '../../hooks/useTheme';
import { useDensity } from '../../hooks/useDensity';

interface LayoutProps {
  children: React.ReactNode;
}

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
        <Header onOpenNav={() => setNavOpen(true)} />

        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-y-auto p-page">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>

        <Drawer isOpen={navOpen} onClose={() => setNavOpen(false)} title="导航" side="left">
          <NavList onNavigate={() => setNavOpen(false)} />
        </Drawer>
      </div>
    </CommandPaletteProvider>
  );
};

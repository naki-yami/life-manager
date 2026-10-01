import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { NAV_ITEMS, isNavItemActive, type NavItem } from './navItems';

/**
 * 底部 Tab 只放每天都会点到的几项。
 * 一排塞六七个图标看着热闹，实际每个都点不准；剩下的入口交给「更多」，
 * 展开的仍是侧栏那一份 NAV_ITEMS，不存在第二套导航定义。
 *
 * 写的是导航项的落点，所以合并过的模块要写**宿主那条的 path**（默认子页），例如
 * `/insight/stats` 而不是 `/stats` —— 后者现在只是重定向，写在 Tab 上会多一跳，
 * 而且高亮范围也跟着宿主走（停在复盘子页时这一位照样是亮的）。
 */
const TAB_PATHS = ['/', '/tasks', '/growth/habits', '/insight/stats'];

export interface BottomTabBarProps {
  /** 点「更多」时打开导航抽屉 */
  onOpenMore: () => void;
  /** 抽屉当前是否打开，用来把「更多」标成展开态 */
  drawerOpen: boolean;
}

/** 窄屏专用的底部导航；宽屏有侧栏，所以 lg 以上隐藏 */
export const BottomTabBar: React.FC<BottomTabBarProps> = ({ onOpenMore, drawerOpen }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const tabs = TAB_PATHS.map((path) => NAV_ITEMS.find((item) => item.path === path)).filter(
    (item): item is NavItem => item !== undefined,
  );
  /** 当前页面不在 Tab 上，说明入口在抽屉里，把「更多」点亮 */
  const moreActive = !tabs.some((item) => isNavItemActive(pathname, item));

  const tabClass = (active: boolean): string =>
    `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-2xs font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-line-focus ${
      active ? 'text-accent' : 'text-content-tertiary'
    }`;

  return (
    <nav
      aria-label="快捷导航"
      data-testid="bottom-tab-bar"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line-subtle bg-surface lg:hidden"
    >
      {tabs.map((item) => {
        const Icon = item.icon;
        const active = isNavItemActive(pathname, item);
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            aria-current={active ? 'page' : undefined}
            className={tabClass(active)}
          >
            <Icon size={20} aria-hidden />
            <span className="max-w-full truncate">{item.label}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onOpenMore}
        aria-expanded={drawerOpen}
        aria-haspopup="dialog"
        className={tabClass(moreActive)}
      >
        <MoreHorizontal size={20} aria-hidden />
        <span>更多</span>
      </button>
    </nav>
  );
};

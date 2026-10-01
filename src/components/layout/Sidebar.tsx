import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Tooltip } from '../ui';
import { useUiStore } from '../../store/uiStore';
import { NAV_ITEMS, isNavItemActive, type NavItem } from './navItems';

interface NavListProps {
  /** 收起时只显示图标，用 Tooltip 补回文字 */
  collapsed?: boolean;
  /** 移动抽屉里点击后需要把它关掉 */
  onNavigate?: () => void;
}

const GROUPS: Array<{ id: NavItem['group']; label: string }> = [
  { id: 'main', label: '功能模块' },
  { id: 'system', label: '系统' },
];

export const NavList: React.FC<NavListProps> = ({ collapsed = false, onNavigate }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav aria-label="主导航" className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
      {GROUPS.map((group) => {
        const items = NAV_ITEMS.filter((item) => item.group === group.id);
        if (items.length === 0) return null;

        return (
          <div key={group.id} className="space-y-1">
            {!collapsed && (
              <p className="px-3 pb-1 pt-3 text-2xs font-medium uppercase tracking-wide text-content-tertiary">
                {group.label}
              </p>
            )}
            {items.map((item) => {
              const active = isNavItemActive(pathname, item);
              const Icon = item.icon;

              const button = (
                <button
                  type="button"
                  onClick={() => {
                    navigate(item.path);
                    onNavigate?.();
                  }}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  title={collapsed ? undefined : item.description}
                  className={`flex w-full items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
                    collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
                  } ${
                    active
                      ? 'bg-selected text-accent'
                      : 'text-content-secondary hover:bg-hover hover:text-content'
                  }`}
                >
                  <Icon size={18} aria-hidden className="shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              );

              return collapsed ? (
                <Tooltip key={item.path} content={item.label} side="bottom" className="w-full">
                  {button}
                </Tooltip>
              ) : (
                <React.Fragment key={item.path}>{button}</React.Fragment>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
};

/** 桌面端侧栏；窄屏隐藏，改由 Header 的抽屉呈现 */
export const Sidebar: React.FC = () => {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <aside
      data-testid="sidebar"
      data-collapsed={collapsed}
      className={`hidden shrink-0 flex-col border-r border-line-subtle bg-surface transition-[width] duration-base ease-standard lg:flex ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      <NavList collapsed={collapsed} />
      <div className="border-t border-line-subtle p-2">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-expanded={!collapsed}
          aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-content-tertiary transition-colors duration-fast ease-standard hover:bg-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
            collapsed ? 'justify-center px-2' : ''
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen size={16} aria-hidden />
          ) : (
            <>
              <PanelLeftClose size={16} aria-hidden />
              <span>收起侧栏</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};

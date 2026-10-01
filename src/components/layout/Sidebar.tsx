import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { IconButton, Tooltip } from '../ui';
import { useUiStore } from '../../store/uiStore';
import { useSaveStamp } from '../../hooks/useSaveStamp';
import { relativeTimeLabel } from '../../utils/date';
import { SearchButton, ShellActions } from './ShellActions';
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

/**
 * 侧栏顶部的品牌块。
 *
 * 收起时只剩方块标记 —— 224px 缩到 64px 之后，「Life Manager」会被压成一条竖排的
 * 碎字，比省下的那点空间糟糕得多。
 */
const Brand: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
  <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : 'px-0.5'}`}>
    <div
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-contrast"
    >
      L
    </div>
    {!collapsed && (
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight text-content">Life Manager</p>
        <p className="truncate text-2xs text-content-tertiary">本地 · 数据只在这台电脑</p>
      </div>
    )}
  </div>
);

/**
 * 「已保存 · 刚刚」。
 *
 * 读的是存储层真正写完的时刻（见 store/saveStamp），不是界面上最后一次点按 ——
 * 写失败时它原地不动，同时 StorageAlert 会亮起来，两条信号不会互相打架。
 *
 * 故意不加 `role="status"`：这行字每 30 秒会重算一次相对时间，
 * 做成 live region 等于让读屏用户每半分钟被打断一次。它是给人瞄一眼的环境信息，
 * 需要时自己导航过来读即可。
 */
const SaveStatus: React.FC<{ collapsed: boolean }> = ({ collapsed }) => {
  const savedAt = useSaveStamp();
  const [now, setNow] = React.useState(() => Date.now());

  // 相对时间得自己走：只在挂载时算一遍的话，页面开着一小时后还写着「刚刚」
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const text = savedAt === null ? '本次还没有改动' : `已保存 · ${relativeTimeLabel(savedAt, now)}`;

  return (
    <p
      title={text}
      className={`flex items-center gap-2 px-2 pt-2 text-2xs text-content-tertiary ${
        collapsed ? 'justify-center' : ''
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          savedAt === null ? 'bg-line-strong' : 'bg-success'
        }`}
      />
      <span className={collapsed ? 'sr-only' : 'truncate'}>{text}</span>
    </p>
  );
};

export const NavList: React.FC<NavListProps> = ({ collapsed = false, onNavigate }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav aria-label="主导航" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
      {GROUPS.map((group) => {
        const items = NAV_ITEMS.filter((item) => item.group === group.id);
        if (items.length === 0) return null;

        return (
          <div key={group.id} className="space-y-0.5">
            {!collapsed && (
              <p className="px-2.5 pb-1 pt-3 text-2xs font-semibold tracking-wide text-content-tertiary">
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
                  className={`flex w-full items-center gap-2.5 rounded-[8px] text-sm transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
                    collapsed ? 'justify-center px-2 py-2.5' : 'px-2.5 py-[7px]'
                  } ${
                    active
                      ? 'bg-accent-soft font-semibold text-accent'
                      : 'font-medium text-content-secondary hover:bg-hover hover:text-content'
                  }`}
                >
                  <Icon size={17} aria-hidden className="shrink-0" />
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

/**
 * 桌面端侧栏。
 *
 * 它承担的不只是导航：品牌、「搜索或跳转」入口、保存 / 密度 / 主题三颗开关
 * 和底部那行保存状态都收在这里 —— 桌面端于是不再需要一条横向顶栏，
 * 页面从视口顶上开始，标题区是第一眼看到的东西。窄屏侧栏整条隐藏，
 * 那些动作改由 Header（顶栏）与底部 Tab 条承担。
 */
export const Sidebar: React.FC = () => {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      data-testid="sidebar"
      data-collapsed={collapsed}
      className={`hidden shrink-0 flex-col border-r border-line-subtle bg-surface transition-[width] duration-base ease-standard lg:flex ${
        collapsed ? 'w-16' : 'w-[228px]'
      }`}
    >
      <div className={`shrink-0 ${collapsed ? 'px-3 pb-3 pt-4' : 'px-3 pb-2 pt-4'}`}>
        <Brand collapsed={collapsed} />
        {!collapsed && (
          <div className="mt-3">
            <SearchButton />
          </div>
        )}
      </div>

      <NavList collapsed={collapsed} />

      <div className="shrink-0 border-t border-line-subtle p-2">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <ShellActions orientation="column" />
            <IconButton
              label="展开侧栏"
              aria-expanded={false}
              icon={<CollapseIcon size={16} />}
              onClick={toggleSidebar}
            />
          </div>
        ) : (
          <div className="flex items-center gap-0.5">
            <ShellActions />
            <IconButton
              label="收起侧栏"
              aria-expanded
              size="sm"
              icon={<CollapseIcon size={16} />}
              onClick={toggleSidebar}
              className="ml-auto"
            />
          </div>
        )}
        <SaveStatus collapsed={collapsed} />
      </div>
    </aside>
  );
};

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SegmentedControl } from '../ui';
import { MODULE_TABS, findNavItem } from './navItems';

export interface ModuleTabsProps {
  /** 宿主路径，例如 `/study` */
  host: string;
}

/**
 * 宿主顶部的子页签条。
 *
 * 只做一件事：把当前 URL 映射成段控的选中项，点一下换到另一个子页（push，与侧栏、
 * 底部 Tab 的点击一致）。子页清单从 MODULE_TABS 取 —— 那是子页的唯一真相源，
 * `NAV_ITEMS` 收敛之后里面不再有子页路径。
 *
 * 复用 SegmentedControl 而不是新造 tab 组件：全仓没有 role=tablist 先例，而段控
 * 本来就是「一组互斥按钮」的语义，切子页正好；它也自带 role=group + aria-label +
 * aria-pressed，无障碍基线不用另写一套。
 */
export const ModuleTabs: React.FC<ModuleTabsProps> = ({ host }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tabs = MODULE_TABS[host] ?? [];

  if (tabs.length === 0) return null;

  const hostLabel = findNavItem(host)?.label ?? '模块';

  return (
    <SegmentedControl
      label={`${hostLabel}内的页面`}
      value={pathname}
      onChange={(next) => navigate(next)}
      options={tabs.map((tab) => {
        const Icon = tab.icon;
        return { value: tab.path, label: tab.label, icon: <Icon size={14} aria-hidden /> };
      })}
    />
  );
};

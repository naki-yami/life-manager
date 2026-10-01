import React from 'react';
import { Outlet } from 'react-router-dom';
import { ModuleTabs } from './ModuleTabs';

export interface ModuleHostProps {
  /** 宿主路径，例如 `/study`、`/health`。和 MODULE_TABS 的键、NavItem.host 是同一个前缀 */
  host: string;
}

/**
 * 模块宿主壳：子页签条 + 子路由出口。
 *
 * 四个模块（书房 / 健康 / 统计与复盘 / 成长）共用这一个组件，差别全在 `host` ——
 * 子页清单从 `MODULE_TABS[host]` 取，所以每合并一个模块不用再加一个壳文件。
 * （阶段一它叫 `StudyLayout`，阶段二合并健康时泛化成了这个。）
 *
 * 刻意**不放 h1** —— 标题由各子页自己的 PageHeader 出，保证每页只有一个 h1。
 * 子页组件不知道自己被嵌套了，它们照旧渲染自己的标题与内容。
 */
export const ModuleHost: React.FC<ModuleHostProps> = ({ host }) => (
  <div className="space-y-section">
    <ModuleTabs host={host} />
    <Outlet />
  </div>
);

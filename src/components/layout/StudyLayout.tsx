import React from 'react';
import { Outlet } from 'react-router-dom';
import { ModuleTabs } from './ModuleTabs';

/**
 * 书房的宿主壳：子页签条 + 子路由出口。
 *
 * 刻意**不放 h1** —— 标题由各子页自己的 PageHeader 出，保证每页只有一个 h1。
 * 子页组件不知道自己被嵌套了，它们照旧渲染自己的标题与内容。
 */
export const StudyLayout: React.FC = () => (
  <div className="space-y-section">
    <ModuleTabs host="/study" />
    <Outlet />
  </div>
);

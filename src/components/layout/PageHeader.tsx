import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** 右侧操作区，通常是主按钮 */
  actions?: React.ReactNode;
  /** 标题下方的补充信息，例如标签或统计 */
  meta?: React.ReactNode;
}

/** 页面统一标题区。所有页面顶部都用它，保证层级与间距一致。 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon: Icon,
  actions,
  meta,
}) => (
  <header className="flex flex-wrap items-start justify-between gap-4">
    {/* basis-56 是「标题至少占这么宽」的换行阈值：窄窗口下操作区自动换到下一行，而不是把标题挤成一条窄缝 */}
    <div className="min-w-0 flex-1 basis-56">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-content">
        {Icon && <Icon size={22} className="shrink-0 text-accent" aria-hidden />}
        <span className="truncate">{title}</span>
      </h1>
      {description && <p className="mt-1 text-sm text-content-tertiary">{description}</p>}
      {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
    </div>
    {/* 操作区允许收缩并在内部换行：宽控件（比如统计页的日期框）不该把标题挤成一列窄条 */}
    {actions && (
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{actions}</div>
    )}
  </header>
);

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
    <div className="min-w-0 flex-1">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-content">
        {Icon && <Icon size={22} className="shrink-0 text-accent" aria-hidden />}
        <span className="truncate">{title}</span>
      </h1>
      {description && <p className="mt-1 text-sm text-content-tertiary">{description}</p>}
      {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

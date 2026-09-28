import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '../ui';

export interface ToolbarProps {
  /** 左侧内容：筛选器、分段控件等 */
  children?: React.ReactNode;
  /** 右侧内容：主操作按钮 */
  actions?: React.ReactNode;
  /** 便捷搜索框；传了就渲染一个带放大镜的输入框 */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
  };
  className?: string;
}

/** 列表页顶部工具条：左侧筛选 + 右侧操作，移动端自动换行。 */
export const Toolbar: React.FC<ToolbarProps> = ({ children, actions, search, className = '' }) => (
  <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
      {search && (
        <div className="relative w-full max-w-xs">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-tertiary"
          />
          <Input
            label={search.label}
            aria-label={search.label ?? search.placeholder ?? '搜索'}
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder ?? '搜索…'}
            className="pl-8"
          />
        </div>
      )}
      {children}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

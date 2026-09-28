import React from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: 'sm' | 'md';
  /** 无障碍名称，例如「切换视图」 */
  label: string;
  className?: string;
}

/**
 * 分段控件：用于「列表 / 看板 / 分组」这类互斥视图切换。
 * 语义上是一组切换按钮（aria-pressed），不是 tab（不控制面板显隐关系）。
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  label,
  className = '',
}: SegmentedControlProps<T>): React.ReactElement {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex flex-wrap items-center gap-0.5 rounded border border-line-subtle bg-inset p-0.5 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-sm font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
              size === 'sm' ? 'h-6 px-2 text-2xs' : 'h-7 px-2.5 text-xs'
            } ${
              active
                ? 'bg-surface text-content shadow-xs'
                : 'text-content-tertiary hover:text-content-secondary'
            }`}
          >
            {option.icon}
            {option.label}
            {option.count !== undefined && (
              <span className="tabular text-content-tertiary">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

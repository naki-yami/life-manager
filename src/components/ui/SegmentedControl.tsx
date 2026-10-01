import React from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export type SegmentedVariant = 'segment' | 'underline';

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: 'sm' | 'md';
  /** 无障碍名称，例如「切换视图」 */
  label: string;
  /**
   * 皮肤。语义完全一样（role=group + aria-pressed），差的只是「这是筛选还是导航」那一眼：
   * - `segment`（默认）：页内互斥视图 —— 筛选、列表 / 看板、时间范围。胶囊底 + 实心选中块。
   * - `underline`：模块内导航 —— 宿主顶部的子页签条。文字 + 下方指示线，通栏一条细线。
   *
   * 分两套的理由是实测出来的：宿主签条和页内筛选用同一种皮时，两排一模一样的东西
   * 叠在内容区顶部，用户会把导航当成第二排筛选（见规划 §6.1）。
   */
  variant?: SegmentedVariant;
  className?: string;
}

/**
 * 两套皮肤的类名表。
 * 成片地分开写，是因为差异本来就是成片的：底、按钮尺寸、选中配色、聚焦光圈各一套。
 */
const SKIN = {
  segment: {
    container:
      'inline-flex flex-wrap items-center gap-0.5 rounded border border-line-subtle bg-inset p-0.5',
    size: { sm: 'h-6 px-2 text-2xs', md: 'h-7 px-2.5 text-xs' },
    tone: {
      on: 'rounded-sm bg-surface text-content shadow-xs',
      off: 'rounded-sm text-content-tertiary hover:text-content-secondary',
    },
    focus:
      'focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  },
  underline: {
    container: 'flex w-full items-center gap-0.5 border-b border-line-subtle',
    size: { sm: 'h-8 px-2.5 text-xs', md: 'h-9 px-3 text-sm' },
    // -mb-px 让按钮的指示线压在容器那条细线上，而不是并排成两条
    tone: {
      on: '-mb-px border-b-2 border-accent text-content',
      off: '-mb-px border-b-2 border-transparent text-content-tertiary hover:border-line hover:text-content-secondary',
    },
    focus: 'focus-visible:ring-2 focus-visible:ring-line-focus',
  },
} as const;

/**
 * 分段控件：一组互斥的选项。
 * 语义上是一组切换按钮（aria-pressed），不是 tab —— 它不控制面板的显隐关系。
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  label,
  variant = 'segment',
  className = '',
}: SegmentedControlProps<T>): React.ReactElement {
  const skin = SKIN[variant];

  return (
    <div role="group" aria-label={label} className={`${skin.container} ${className}`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 font-medium transition-colors duration-fast ease-standard focus-visible:outline-none ${skin.focus} ${skin.size[size]} ${active ? skin.tone.on : skin.tone.off}`}
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

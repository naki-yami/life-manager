import React from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export interface SelectionBarProps {
  /** 选中了多少条 */
  count: number;
  /** 批量动作按钮；由各页面按自己的语义拼 */
  children: React.ReactNode;
  /** 退出批量模式 */
  onClear: () => void;
  /** 全选当前可见的入口；不传就不显示 */
  onSelectAll?: () => void;
  className?: string;
}

/**
 * 批量模式的吸底操作条。
 *
 * 几个决定是刻意的：
 *
 * **吸底而不是吸顶。** 列表往下滑的时候用户的视线与手指都在下半屏，操作条跟着走才够得着；
 * 吸顶的话翻过一屏就够不着了。
 *
 * **浮层而不是占位。** 它不参与列表布局，出现与消失都不会让下面的内容跳一下 ——
 * 批量模式进出本来就已经在改每张卡片的排布，再叠一次跳动很难看。
 *
 * **不自己判断要不要渲染。** count 为 0 时由页面决定不渲染它，
 * 而不是组件内部 return null：真这么做的话下面的全选按钮会在退出瞬间闪一下。
 */
export const SelectionBar: React.FC<SelectionBarProps> = ({
  count,
  children,
  onClear,
  onSelectAll,
  className = '',
}) => (
  <div
    className={`sticky bottom-0 z-20 -mx-1 mt-4 px-1 pb-[env(safe-area-inset-bottom)] ${className}`}
  >
    <div
      role="toolbar"
      aria-label="批量操作"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/95 px-3 py-2.5 shadow-lg backdrop-blur"
    >
      <span className="shrink-0 text-sm font-medium text-content">
        已选 <span className="tabular text-accent">{count}</span> 项
      </span>

      {onSelectAll && (
        <Button size="sm" variant="ghost" onClick={onSelectAll}>
          全选
        </Button>
      )}

      <div className="flex flex-wrap items-center gap-2">{children}</div>

      <button
        type="button"
        aria-label="退出批量模式"
        onClick={onClear}
        className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-content-tertiary transition-colors duration-fast hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
      >
        <X size={13} aria-hidden />
        退出
      </button>
    </div>
  </div>
);

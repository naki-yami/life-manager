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
  /**
   * 标题上方那行小字，给页面一个坐标 —— 首页写「第 40 周 · 星期四」。
   * 有它和没它的区别是「一眼知道这是哪一天」和「得去读下面那行日期」。
   */
  eyebrow?: React.ReactNode;
}

/**
 * 元信息之间那根竖线。
 *
 * 用一条 1px 的线而不是「·」字符：点号在中文全角标点里会跟着字体变宽变瘦，
 * 竖线的高度由自己定，四五个信息连排时才是齐的。`aria-hidden` —— 它对读屏
 * 没有意义，信息之间的停顿由每个片段的措辞自己承担。
 */
export const MetaSeparator: React.FC = () => (
  <span aria-hidden className="h-3 w-px shrink-0 bg-line" />
);

/** 页面统一标题区。所有页面顶部都用它，保证层级与间距一致。 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  icon: Icon,
  actions,
  meta,
  eyebrow,
}) => (
  <header className="flex flex-wrap items-start justify-between gap-4">
    {/* basis-56 是「标题至少占这么宽」的换行阈值：窄窗口下操作区自动换到下一行，而不是把标题挤成一条窄缝 */}
    <div className="min-w-0 flex-1 basis-56">
      {eyebrow && (
        <p className="text-2xs font-semibold tracking-wide text-content-tertiary">{eyebrow}</p>
      )}
      {/* 有 eyebrow 时标题是「这一天的小结」，字号更大一档，和下面那行元信息拉开层级 */}
      <h1
        className={`flex items-center gap-2 font-semibold tracking-tight text-content ${
          eyebrow ? 'mt-1.5 text-[28px] leading-tight' : 'text-2xl'
        }`}
      >
        {Icon && <Icon size={22} className="shrink-0 text-accent" aria-hidden />}
        <span className="truncate">{title}</span>
      </h1>
      {description && <p className="mt-1 text-sm text-content-tertiary">{description}</p>}
      {meta && <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div>}
    </div>
    {/* 操作区允许收缩并在内部换行：宽控件（比如统计页的日期框）不该把标题挤成一列窄条 */}
    {actions && (
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{actions}</div>
    )}
  </header>
);

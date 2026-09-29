import React from 'react';
import { Skeleton } from '../ui';

export interface PageSkeletonProps {
  /** 卡片占位数量，默认 3 */
  cards?: number;
}

/** 路由懒加载时的占位，形状贴近真实页面，避免骨架屏跳动。 */
export const PageSkeleton: React.FC<PageSkeletonProps> = ({ cards = 3 }) => (
  <div
    className="mx-auto max-w-5xl space-y-section xl:max-w-6xl 2xl:max-w-7xl"
    aria-busy="true"
    aria-live="polite"
  >
    <span className="sr-only">页面加载中</span>
    <div className="space-y-3">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} className="space-y-3 rounded-lg border border-line-subtle bg-surface p-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  </div>
);

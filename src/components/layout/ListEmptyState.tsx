import React from 'react';
import { Button, Card, EmptyState } from '../ui';

export interface ListEmptyStateProps {
  icon: React.ReactNode;
  /** 一条数据都没有时 */
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** 有数据、但被当前关键词 / 筛选条件筛掉了时 */
  filteredTitle: string;
  filteredDescription?: string;
  /** 被筛掉时给一个「清除筛选」按钮；不传就不给 */
  onClearFilters?: () => void;
  /** 来自 useEntityList 的 filteredOut */
  filtered: boolean;
}

/**
 * 列表页空态：区分「本来就空」和「没筛出来」。
 *
 * 这两种情况看起来都是「什么都没有」，但用户该做的事完全相反：
 * 前者要「去添加第一条」，后者要「把筛选条件放宽」。把它们合成一句
 * 「暂无数据」，用户就只能自己猜了。
 */
export const ListEmptyState: React.FC<ListEmptyStateProps> = ({
  icon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  filteredTitle,
  filteredDescription,
  onClearFilters,
  filtered,
}) => (
  <Card>
    <EmptyState
      icon={icon}
      title={filtered ? filteredTitle : emptyTitle}
      description={filtered ? filteredDescription : emptyDescription}
      action={
        filtered
          ? onClearFilters && (
              <Button variant="secondary" onClick={onClearFilters}>
                清除筛选
              </Button>
            )
          : emptyAction
      }
    />
  </Card>
);

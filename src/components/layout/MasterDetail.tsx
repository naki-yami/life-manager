import React from 'react';
import { Card, CardBody, CardHeader, Drawer } from '../ui';
import type { DrawerWidth } from '../ui';
import { useMediaQuery } from '../../hooks/useMediaQuery';

/**
 * 双栏布局的起点：Tailwind 的 xl（1280px）。
 * 内容区从 xl 起才放宽到 max-w-6xl（见 Layout），所以两处口径保持一致。
 */
export const MASTER_DETAIL_QUERY = '(min-width: 1280px)';

export interface MasterDetailProps {
  /** 主区（列表）。窄屏时它是唯一可见的区域 */
  children: React.ReactNode;
  /** 详情内容；null 表示当前没有选中项 */
  detail: React.ReactNode | null;
  /** 详情标题：宽屏面板的标题，也是窄屏抽屉的可访问名称 */
  detailTitle: string;
  /** 详情是否展开。窄屏决定抽屉开不开；宽屏只用它判断有没有选中项 */
  detailOpen: boolean;
  onCloseDetail: () => void;
  /** 宽屏且没有选中项时的占位内容，避免右栏空掉导致布局跳动 */
  emptyDetail: React.ReactNode;
  /** 宽屏详情栏宽度，默认 24rem */
  detailWidth?: string;
  /** 窄屏抽屉宽度，默认 20rem。表单类详情塞在 20rem 里会发挤，可以调到 lg */
  drawerWidth?: DrawerWidth;
  className?: string;
}

/**
 * 「列表 + 详情」双栏。
 *
 * 窄屏（< xl）还是老样子：列表占满宽度，详情滑出成一个抽屉 —— 手机上没有并排的余地，
 * 硬塞两栏只会让两边都不可用。
 *
 * 宽屏则是**一直在**的两栏：右栏在没选中时显示占位内容，而不是消失。
 * 这是 Linear / Things 那种「点左边、右边就地编辑、保存不打断上下文」的体验，
 * 也让「选中了什么」这件事在视觉上一直有落点。宽屏下不再渲染 dialog，
 * 焦点不会被搬走，键盘用户可以用 Tab 直接进右栏。
 *
 * 适配上没有用 CSS 的 hidden / block 两套 DOM：同一个详情节点在两种模式下
 * 只会渲染一次，避免出现「读屏读两遍」和「重复 id」两类问题。
 */
export const MasterDetail: React.FC<MasterDetailProps> = ({
  children,
  detail,
  detailTitle,
  detailOpen,
  onCloseDetail,
  emptyDetail,
  detailWidth = 'w-96',
  drawerWidth = 'md',
  className = '',
}) => {
  const wide = useMediaQuery(MASTER_DETAIL_QUERY);

  if (!wide) {
    return (
      <>
        {children}
        <Drawer
          isOpen={detailOpen}
          onClose={onCloseDetail}
          title={detailTitle}
          side="right"
          width={drawerWidth}
        >
          {detail}
        </Drawer>
      </>
    );
  }

  return (
    <div className={`flex items-start gap-4 ${className}`}>
      <div className="min-w-0 flex-1">{children}</div>
      <aside aria-label={detailTitle} className={`${detailWidth} sticky top-0 shrink-0`}>
        <Card>
          <CardHeader title={detailTitle} />
          <CardBody>{detail ?? emptyDetail}</CardBody>
        </Card>
      </aside>
    </div>
  );
};

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DashboardGrid, type DashboardWidgetView } from './DashboardGrid';
import type { DashboardWidget } from '../../store/uiStore';

const widgets: DashboardWidget[] = [
  { id: 'stats', size: 'lg', hidden: false },
  { id: 'capture', size: 'md', hidden: false },
  { id: 'focus', size: 'sm', hidden: false },
  { id: 'memos', size: 'sm', hidden: true },
];

const views: DashboardWidgetView[] = [
  { id: 'stats', title: '概览统计', content: <p>统计内容</p> },
  { id: 'capture', title: '快速添加任务', content: <p>添加内容</p> },
  { id: 'focus', title: '今日聚焦', content: null },
  { id: 'memos', title: '快速备忘', content: <p>备忘内容</p> },
];

const setup = (overrides: Partial<React.ComponentProps<typeof DashboardGrid>> = {}) => {
  const props = {
    widgets,
    views,
    editing: false,
    onMove: vi.fn(),
    onResize: vi.fn(),
    onHide: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
  render(<DashboardGrid {...props} />);
  return props;
};

describe('DashboardGrid', () => {
  it('浏览态只渲染有内容的卡片，隐藏的与没数据的一律不占位', () => {
    setup();

    expect(screen.getByText('统计内容')).toBeInTheDocument();
    expect(screen.getByText('添加内容')).toBeInTheDocument();
    expect(screen.queryByText('备忘内容')).not.toBeInTheDocument();
    expect(screen.queryByText('今日聚焦暂无数据')).not.toBeInTheDocument();
    // 隐藏项的恢复按钮只在编辑态出现
    expect(screen.queryByRole('button', { name: '快速备忘' })).not.toBeInTheDocument();
    // 浏览态没有工具条
    expect(screen.queryByRole('button', { name: '恢复默认布局' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /调整顺序/ })).not.toBeInTheDocument();
  });

  it('宽度档位映射到 12 栏栅格，窄屏单列', () => {
    setup();

    const list = screen.getByRole('list');
    expect(list).toHaveClass('grid-cols-1', 'lg:grid-cols-12');

    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveClass('lg:col-span-12');
    expect(items[1]).toHaveClass('lg:col-span-8');
  });

  it('编辑态把没数据的卡片渲染成占位卡，并把隐藏项列出来', () => {
    setup({ editing: true });

    expect(screen.getByText('今日聚焦暂无数据')).toBeInTheDocument();
    expect(screen.getByText('有数据时这张卡片会自动出现。')).toBeInTheDocument();

    expect(screen.getByText('已隐藏：')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '快速备忘' })).toBeInTheDocument();
    expect(screen.queryByText('备忘内容')).not.toBeInTheDocument();
  });

  it('编辑态每张卡片都有可读的拖拽手柄与宽度控件', () => {
    setup({ editing: true });

    expect(screen.getByRole('button', { name: '拖动「概览统计」调整顺序' })).toBeInTheDocument();

    const sizeGroup = screen.getByRole('group', { name: '「快速添加任务」的宽度' });
    expect(within(sizeGroup).getByRole('button', { name: '中' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(sizeGroup).getByRole('button', { name: '宽' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('改宽度与隐藏都带上对应卡片的 id', async () => {
    const props = setup({ editing: true });

    await userEvent.click(
      within(screen.getByRole('group', { name: '「快速添加任务」的宽度' })).getByRole('button', {
        name: '宽',
      }),
    );
    expect(props.onResize).toHaveBeenCalledWith('capture', 'lg');

    await userEvent.click(screen.getByRole('button', { name: '隐藏「今日聚焦」' }));
    expect(props.onHide).toHaveBeenCalledWith('focus', true);

    await userEvent.click(screen.getByRole('button', { name: '快速备忘' }));
    expect(props.onHide).toHaveBeenCalledWith('memos', false);
  });

  it('点「恢复默认布局」交给上层处理', async () => {
    const props = setup({ editing: true });

    await userEvent.click(screen.getByRole('button', { name: '恢复默认布局' }));
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });

  it('没有隐藏项时编辑态给操作提示', () => {
    setup({ widgets: widgets.map((widget) => ({ ...widget, hidden: false })), editing: true });
    expect(
      screen.getByText('拖动左上角的手柄调整顺序，或用「小 / 中 / 宽」改宽度。'),
    ).toBeInTheDocument();
  });

  it('全部卡片被隐藏时给出恢复指引', () => {
    setup({ widgets: widgets.map((widget) => ({ ...widget, hidden: true })) });

    expect(
      screen.getByText('所有卡片都被隐藏了，点右上角「编辑布局」可以恢复。'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('views 里没有的卡片被忽略，不会渲染成空壳', () => {
    setup({ widgets: [...widgets, { id: 'activity', size: 'lg', hidden: false }] });

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
  });
});

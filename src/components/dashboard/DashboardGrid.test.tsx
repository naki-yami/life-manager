import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DashboardGrid, type DashboardWidgetView } from './DashboardGrid';
import type { DashboardWidget } from '../../store/uiStore';

const widgets: DashboardWidget[] = [
  { id: 'stats', size: 'lg', hidden: false },
  { id: 'today', size: 'md', hidden: false },
  { id: 'focus', size: 'sm', hidden: false },
  { id: 'memos', size: 'sm', hidden: true },
];

const views: DashboardWidgetView[] = [
  { id: 'stats', title: '概览统计', content: <p>统计内容</p> },
  { id: 'today', title: '今天', content: <p>添加内容</p> },
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

/**
 * 三个列表分别是：通栏段、双列段的主列、双列段的辅列。
 * 栅格刻意不再用「行优先 12 栏 + 每卡一个跨列档位」那套 —— 那套在卡片一高一矮、
 * 或者某张卡因为没数据被跳过时，会在那一行留下填不满的空白。
 */
const lists = (): HTMLElement[] => screen.getAllByRole('list');

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

  it('宽档通栏独占一行，中档与小档并排进左右两列', () => {
    setup({
      widgets: [
        { id: 'stats', size: 'lg', hidden: false },
        { id: 'today', size: 'md', hidden: false },
        { id: 'memos', size: 'sm', hidden: false },
      ],
    });

    const [fullBand, mainColumn, sideColumn] = lists();
    expect(within(fullBand!).getAllByRole('listitem')).toHaveLength(1);
    expect(within(mainColumn!).getAllByRole('listitem')).toHaveLength(1);
    expect(within(sideColumn!).getAllByRole('listitem')).toHaveLength(1);

    expect(mainColumn).toHaveClass('lg:col-span-8');
    expect(sideColumn).toHaveClass('lg:col-span-4');
  });

  it('某一列空着时，另一列自己占满，不留半边空白', () => {
    setup({
      widgets: [
        { id: 'stats', size: 'lg', hidden: false },
        { id: 'today', size: 'md', hidden: false },
      ],
    });

    const [, onlyColumn] = lists();
    expect(onlyColumn).toHaveClass('lg:col-span-12');
    expect(onlyColumn).not.toHaveClass('lg:col-span-8');
  });

  /**
   * 这条就是那个坑的回归守卫：以前「今日聚焦」没数据被跳过之后，
   * 「快速添加任务」还老老实实占 8 栏，右边 4 栏空着没人填。
   */
  it('同段的卡片没数据被跳过时，同段另一张卡照旧占满，不会空出半边', () => {
    const pair: DashboardWidget[] = [
      { id: 'today', size: 'md', hidden: false },
      { id: 'focus', size: 'sm', hidden: false },
    ];

    const browse = render(
      <DashboardGrid
        {...{
          widgets: pair,
          views,
          editing: false,
          onMove: vi.fn(),
          onResize: vi.fn(),
          onHide: vi.fn(),
          onReset: vi.fn(),
        }}
      />,
    );
    // 浏览态：今日聚焦没数据 → 只剩主列，主列占满
    const only = lists();
    expect(only).toHaveLength(1);
    expect(only[0]).toHaveClass('lg:col-span-12');
    browse.unmount();

    // 编辑态：占位卡要露出来，于是恢复成 8 / 4 两列
    render(
      <DashboardGrid
        {...{
          widgets: pair,
          views,
          editing: true,
          onMove: vi.fn(),
          onResize: vi.fn(),
          onHide: vi.fn(),
          onReset: vi.fn(),
        }}
      />,
    );
    const both = lists();
    expect(both).toHaveLength(2);
    expect(both[0]).toHaveClass('lg:col-span-8');
    expect(both[1]).toHaveClass('lg:col-span-4');
  });

  it('两列各自独立堆叠：同段的卡片按顺序分别落进各自那一列', () => {
    setup({
      widgets: [
        { id: 'stats', size: 'lg', hidden: false },
        { id: 'today', size: 'md', hidden: false },
        { id: 'memos', size: 'sm', hidden: false },
        { id: 'focus', size: 'sm', hidden: false },
      ],
      editing: true,
    });

    const [, mainColumn, sideColumn] = lists();
    expect(within(mainColumn!).getAllByRole('listitem')).toHaveLength(1);
    expect(within(sideColumn!).getAllByRole('listitem')).toHaveLength(2);
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

    const sizeGroup = screen.getByRole('group', { name: '「今天」的宽度' });
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
      within(screen.getByRole('group', { name: '「今天」的宽度' })).getByRole('button', {
        name: '宽',
      }),
    );
    expect(props.onResize).toHaveBeenCalledWith('today', 'lg');

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
      screen.getByText(
        '拖动左上角的手柄调整顺序。「宽」通栏，「中」进左列，「小」进右列；某一列空着时另一列会占满。',
      ),
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

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

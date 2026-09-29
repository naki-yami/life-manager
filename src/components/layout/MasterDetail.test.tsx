import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MasterDetail, MASTER_DETAIL_QUERY } from './MasterDetail';
import { mockMediaQueries } from '../../test/matchMedia';

const setup = (overrides: Partial<React.ComponentProps<typeof MasterDetail>> = {}) => {
  const props = {
    detailTitle: '读书笔记',
    detailOpen: false,
    onCloseDetail: vi.fn(),
    emptyDetail: <p>还没有选中书</p>,
    detail: <p>笔记内容</p>,
    children: <p>书目列表</p>,
    ...overrides,
  };
  render(<MasterDetail {...props} />);
  return props;
};

describe('MasterDetail', () => {
  it('窄屏只渲染列表，不进详情就不出现对话框', () => {
    setup();

    expect(screen.getByText('书目列表')).toBeInTheDocument();
    expect(screen.queryByText('笔记内容')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('窄屏展开详情时用抽屉承载，标题可读、Esc 能关', async () => {
    const props = setup({ detailOpen: true });

    const dialog = screen.getByRole('dialog', { name: '读书笔记' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('笔记内容')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(props.onCloseDetail).toHaveBeenCalled();
  });

  it('宽屏并排渲染，且不再用对话框把焦点搬走', () => {
    mockMediaQueries({ [MASTER_DETAIL_QUERY]: true });
    setup({ detailOpen: true });

    expect(screen.getByRole('complementary', { name: '读书笔记' })).toBeInTheDocument();
    expect(screen.getByText('书目列表')).toBeInTheDocument();
    expect(screen.getByText('笔记内容')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('宽屏没选中项时右栏显示占位内容，而不是消失', () => {
    mockMediaQueries({ [MASTER_DETAIL_QUERY]: true });
    setup({ detail: null });

    expect(screen.getByText('还没有选中书')).toBeInTheDocument();
    // 右栏始终存在，布局不会因为选中与否而跳动
    expect(screen.getByRole('complementary', { name: '读书笔记' })).toBeInTheDocument();
  });

  it('宽屏下详情栏宽可调', () => {
    mockMediaQueries({ [MASTER_DETAIL_QUERY]: true });
    setup({ detailWidth: 'w-[30rem]' });

    expect(screen.getByRole('complementary', { name: '读书笔记' })).toHaveClass('w-[30rem]');
  });
});

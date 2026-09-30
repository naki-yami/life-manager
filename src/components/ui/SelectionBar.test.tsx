import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SelectionBar } from './SelectionBar';

describe('SelectionBar', () => {
  it('显示选中数量，并把操作按钮渲染出来', () => {
    render(
      <SelectionBar count={3} onClear={() => {}}>
        <button type="button">打标签</button>
        <button type="button">删除</button>
      </SelectionBar>,
    );

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '打标签' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument();
  });

  it('是一块具名的 toolbar，读屏能报出这是批量操作区', () => {
    render(
      <SelectionBar count={1} onClear={() => {}}>
        <span>动作</span>
      </SelectionBar>,
    );

    expect(screen.getByRole('toolbar', { name: '批量操作' })).toBeInTheDocument();
  });

  it('不传 onSelectAll 时没有全选按钮', () => {
    render(
      <SelectionBar count={1} onClear={() => {}}>
        <span>动作</span>
      </SelectionBar>,
    );

    expect(screen.queryByRole('button', { name: '全选' })).not.toBeInTheDocument();
  });

  it('传了 onSelectAll 就能点，回调被调到', async () => {
    const onSelectAll = vi.fn();
    render(
      <SelectionBar count={1} onSelectAll={onSelectAll} onClear={() => {}}>
        <span>动作</span>
      </SelectionBar>,
    );

    await userEvent.click(screen.getByRole('button', { name: '全选' }));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('退出按钮回调被调到', async () => {
    const onClear = vi.fn();
    render(
      <SelectionBar count={2} onClear={onClear}>
        <span>动作</span>
      </SelectionBar>,
    );

    await userEvent.click(screen.getByRole('button', { name: '退出批量模式' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

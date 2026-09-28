import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';
import { useUndoableRemove } from './useUndoableRemove';

interface Item {
  id: string;
  title: string;
}

/** 一个最小的宿主组件：点一下就删掉第一项，并弹撤销提示 */
const Host: React.FC<{
  items: Item[];
  onRestore: (items: Item[]) => void;
  onDelete: (id: string) => void;
}> = ({ items, onRestore, onDelete }) => {
  const undoableRemove = useUndoableRemove();

  return (
    <button
      type="button"
      onClick={() => {
        const snapshot = items;
        onDelete(items[0]!.id);
        undoableRemove({
          message: `已删除「${items[0]!.title}」`,
          snapshot,
          restore: onRestore,
        });
      }}
    >
      删除第一项
    </button>
  );
};

describe('useUndoableRemove', () => {
  it('删除后弹出带「撤销」的提示，点撤销会把快照写回去', async () => {
    const items: Item[] = [
      { id: 'a', title: '写周报' },
      { id: 'b', title: '买牛奶' },
    ];
    const onRestore = vi.fn();
    const onDelete = vi.fn();

    render(
      <ToastProvider>
        <Host items={items} onRestore={onRestore} onDelete={onDelete} />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: '删除第一项' }));

    expect(onDelete).toHaveBeenCalledWith('a');
    expect(screen.getByText('已删除「写周报」')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '撤销' }));

    expect(onRestore).toHaveBeenCalledTimes(1);
    // 还原的是删除前的整份快照，而不是单个对象
    expect(onRestore.mock.calls[0]![0]).toEqual(items);
    expect(onRestore.mock.calls[0]![0]).not.toBe(items);
    expect(screen.queryByText('已删除「写周报」')).not.toBeInTheDocument();
  });

  it('没有 ToastProvider 时删除照常生效，只是不弹提示', async () => {
    const onRestore = vi.fn();
    const onDelete = vi.fn();

    render(
      <Host items={[{ id: 'a', title: '写周报' }]} onRestore={onRestore} onDelete={onDelete} />,
    );

    await userEvent.click(screen.getByRole('button', { name: '删除第一项' }));

    expect(onDelete).toHaveBeenCalledWith('a');
    expect(screen.queryByText('撤销')).not.toBeInTheDocument();
    expect(onRestore).not.toHaveBeenCalled();
  });
});

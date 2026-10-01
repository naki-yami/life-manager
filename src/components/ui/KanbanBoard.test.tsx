import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KanbanBoard, type KanbanColumnData } from './KanbanBoard';

const columns: KanbanColumnData[] = [
  {
    id: 'todo',
    title: '待办',
    items: [{ id: 't1', label: '任务一', node: <span>任务一</span> }],
  },
  {
    id: 'doing',
    title: '进行中',
    items: [
      { id: 't2', label: '任务二', node: <span>任务二</span> },
      { id: 't3', label: '任务三', node: <span>任务三</span> },
    ],
  },
  { id: 'done', title: '已完成', items: [] },
];

describe('KanbanBoard', () => {
  it('按列渲染标题、数量与条目，空列显示占位文案', () => {
    render(<KanbanBoard label="看板" columns={columns} onMove={vi.fn()} />);

    expect(screen.getByRole('group', { name: '看板' })).toBeInTheDocument();
    expect(screen.getByText('任务一')).toBeInTheDocument();
    expect(screen.getByText('任务二')).toBeInTheDocument();
    expect(screen.getByText('这一列还没有任务')).toBeInTheDocument();

    const doingColumn = screen
      .getByRole('heading', { name: '进行中' })
      .closest('div')!.parentElement!;
    expect(within(doingColumn).getByText('2')).toBeInTheDocument();
  });

  it('每个条目都有可排序手柄，且手柄名可读', () => {
    render(<KanbanBoard label="看板" columns={columns} onMove={vi.fn()} />);

    expect(screen.getByRole('button', { name: '拖动排序「任务一」' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '拖动排序「任务三」' })).toBeInTheDocument();
  });

  it('键盘也能拾起卡片换列（空格 → 方向键 → 空格）', async () => {
    const onMove = vi.fn();
    render(<KanbanBoard label="看板" columns={columns} onMove={onMove} />);

    const rect = (top: number, left: number): DOMRect =>
      ({
        top,
        left,
        right: left + 200,
        bottom: top + 40,
        width: 200,
        height: 40,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    const stub = (element: HTMLElement, top: number, left: number): void => {
      element.getBoundingClientRect = () => rect(top, left);
    };

    const board = screen.getByRole('group', { name: '看板' });
    const [todo, doing, done] = [...board.children] as HTMLElement[];
    stub(todo!, 0, 0);
    stub(doing!, 0, 220);
    stub(done!, 0, 440);
    stub(screen.getByText('任务一').closest('li') as HTMLElement, 0, 0);
    stub(screen.getByText('任务二').closest('li') as HTMLElement, 0, 220);
    stub(screen.getByText('任务三').closest('li') as HTMLElement, 40, 220);

    const handle = screen.getByRole('button', { name: '拖动排序「任务一」' });
    handle.focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard(' ');

    // 落点语义：从「待办」落到「进行中」这一列（overItemId 取决于 dnd-kit 选中的落点，这里不锁死）
    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 't1', fromColumnId: 'todo', toColumnId: 'doing' }),
    );
  });
});

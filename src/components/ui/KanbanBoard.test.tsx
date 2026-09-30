import React from 'react';
import { render, screen, within } from '@testing-library/react';
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
});

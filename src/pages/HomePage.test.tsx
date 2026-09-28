import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomePage } from './HomePage';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useGameStore } from '../store/gameStore';
import { todayKey } from '../utils/date';

const renderHome = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/books" element={<div>读书页面</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  useTaskStore.setState({ tasks: [], memos: [] });
  useBookStore.setState({ books: [] });
  useDevStore.setState({ projects: [] });
  useWritingStore.setState({ projects: [] });
  useFitnessStore.setState({ plans: [], records: [] });
  useDietStore.setState({ records: [] });
  useGameStore.setState({ games: [] });
});

describe('HomePage', () => {
  it('统计卡片反映真实数据', () => {
    const tasks = useTaskStore.getState();
    tasks.addTask('写周报', '', 'high', '');
    tasks.addTask('买牛奶', '', 'low', '');
    tasks.addTask('交房租', '', 'medium', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);

    renderHome();

    const 待办 = screen.getByText('待办任务').closest('div')!.parentElement!;
    expect(within(待办).getByText('2')).toBeInTheDocument();
    expect(screen.getByText('已完成 1 项')).toBeInTheDocument();
  });

  it('完成率按已完成比例计算', () => {
    const store = useTaskStore.getState();
    store.addTask('A', '', 'low', '');
    store.addTask('B', '', 'low', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);

    renderHome();
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('列表里的勾选会把任务标记为已完成', async () => {
    useTaskStore.getState().addTask('写周报', '', 'high', '');
    renderHome();

    await userEvent.click(screen.getByRole('checkbox', { name: '写周报' }));

    expect(useTaskStore.getState().tasks[0]!.status).toBe('completed');
  });

  it('待办为空时给出空态', () => {
    renderHome();
    expect(screen.getByText('待办清空了')).toBeInTheDocument();
  });

  it('回车可以新增备忘', async () => {
    renderHome();

    await userEvent.type(screen.getByRole('textbox', { name: '备忘内容' }), '买咖啡豆{Enter}');

    expect(useTaskStore.getState().memos).toHaveLength(1);
    expect(useTaskStore.getState().memos[0]!.content).toBe('买咖啡豆');
  });

  it('空内容时不保存并给出提示', async () => {
    renderHome();

    await userEvent.click(screen.getByRole('button', { name: '保存备忘' }));

    expect(useTaskStore.getState().memos).toHaveLength(0);
    expect(screen.getByText('先写点什么再保存')).toBeInTheDocument();
  });

  it('可以删除备忘', async () => {
    useTaskStore.getState().addMemo('临时想法');
    renderHome();

    await userEvent.click(screen.getByRole('button', { name: '删除备忘' }));
    expect(useTaskStore.getState().memos).toHaveLength(0);
  });

  it('模块概览展示各模块统计并支持跳转', async () => {
    useBookStore.getState().addBook('深入理解计算机系统', 'Randal', '技术');
    useBookStore.getState().updateBookStatus(useBookStore.getState().books[0]!.id, 'reading');
    useDietStore.getState().addRecord(todayKey(), 'lunch', [
      { name: '鸡胸肉', category: 'protein', calories: 300 },
    ]);
    useGameStore.getState().addGame('黑神话', 'PC');

    renderHome();

    expect(screen.getByText('1 本在读')).toBeInTheDocument();
    expect(screen.getByText('300 kcal')).toBeInTheDocument();
    expect(screen.getByText('1 款在玩')).toBeInTheDocument();

    await userEvent.click(screen.getByText('读书'));
    expect(screen.getByText('读书页面')).toBeInTheDocument();
  });
});

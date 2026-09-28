import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { StatsPage } from './StatsPage';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useGameStore } from '../store/gameStore';
import { addDays, todayKey } from '../utils/date';

const renderStats = () =>
  render(
    <MemoryRouter initialEntries={['/stats']}>
      <Routes>
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/tasks" element={<div>今日计划页面</div>} />
      </Routes>
    </MemoryRouter>,
  );

/** 按标签定位到统计卡片内部，避免多个卡片出现相同数字时断言串台 */
const cardFor = (label: string) => {
  const node = screen.getByText(label).closest('div.rounded-lg');
  if (!node) throw new Error(`找不到统计卡片：${label}`);
  return within(node as HTMLElement);
};

const workout = [{ name: '卧推', sets: 3, reps: 10, weight: 60 }];
const meal = [{ name: '鸡胸肉', category: 'protein', calories: 600 }];

beforeEach(() => {
  useTaskStore.setState({ tasks: [], memos: [] });
  useBookStore.setState({ books: [] });
  useDevStore.setState({ projects: [] });
  useWritingStore.setState({ projects: [] });
  useFitnessStore.setState({ plans: [], records: [] });
  useDietStore.setState({ records: [] });
  useGameStore.setState({ games: [] });
});

describe('StatsPage', () => {
  it('没有任何数据时给出空态，并能跳到今日计划', async () => {
    renderStats();

    expect(screen.getByText('还没有可统计的数据')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /活动热力图/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '去记一件事' }));
    expect(screen.getByText('今日计划页面')).toBeInTheDocument();
  });

  it('统计卡片只统计最近 30 天内的数据', () => {
    const tasks = useTaskStore.getState();
    tasks.addTask('今天完成', '', 'medium', '');
    tasks.addTask('昨天完成', '', 'medium', '');
    tasks.addTask('还没做', '', 'medium', '');
    const [first, second] = useTaskStore.getState().tasks;
    useTaskStore.getState().toggleTaskStatus(first!.id);
    useTaskStore.getState().toggleTaskStatus(second!.id);
    // 把第二条的完成时间改到 31 天前，应该被窗口排除
    useTaskStore.setState({
      tasks: useTaskStore
        .getState()
        .tasks.map((task) =>
          task.id === second!.id
            ? { ...task, completedAt: `${addDays(todayKey(), -31)}T09:00:00.000Z` }
            : task,
        ),
    });

    useFitnessStore.getState().addRecord('推日', todayKey(), workout, '');
    useFitnessStore.getState().addRecord('拉日', addDays(todayKey(), -1), workout, '');

    renderStats();

    expect(cardFor('近 30 天完成任务').getByText('1')).toBeInTheDocument();
    expect(cardFor('近 30 天训练').getByText('2')).toBeInTheDocument();
    expect(cardFor('近 30 天训练').getByText('分布在 2 天里')).toBeInTheDocument();
    // 今天有任务与训练、昨天有训练，所以连续记录是 2 天
    expect(cardFor('连续记录').getByText('2')).toBeInTheDocument();
    expect(screen.getByText('近 30 天活动 3 次')).toBeInTheDocument();
    expect(screen.getByText('连续记录 2 天')).toBeInTheDocument();
  });

  it('热力图与趋势图带可读的无障碍描述', () => {
    const tasks = useTaskStore.getState();
    tasks.addTask('写周报', '', 'high', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);

    renderStats();

    expect(
      screen.getByRole('img', { name: '最近 30 天活动热力图：30 天里有 1 天有记录，合计 1' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /最近 14 天每日完成任务数：合计 1 个/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '近 14 天每日完成任务数趋势' })).toBeInTheDocument();
  });

  it('日均热量只按有记录的天数计算', () => {
    useDietStore.getState().addRecord(todayKey(), 'lunch', meal);
    useDietStore.getState().addRecord(todayKey(), 'dinner', meal);

    renderStats();

    expect(cardFor('近 7 天日均热量').getByText('1,200')).toBeInTheDocument();
    expect(cardFor('近 7 天日均热量').getByText('按 1 天有记录的天数计算')).toBeInTheDocument();
  });

  it('没有近期记录时热量卡片给出提示而不是 0 均值', () => {
    const tasks = useTaskStore.getState();
    tasks.addTask('旧任务', '', 'low', '');

    renderStats();

    expect(cardFor('近 7 天日均热量').getByText('最近 7 天还没有饮食记录')).toBeInTheDocument();
  });

  it('进度环反映阅读、写作、开发与成就完成度', () => {
    useBookStore.getState().addBook('深入理解计算机系统', 'Randal', '技术');
    const bookId = useBookStore.getState().books[0]!.id;
    useBookStore.getState().updateBookStatus(bookId, 'reading');
    useBookStore.getState().updateProgress(bookId, 60);

    useWritingStore.getState().addProject('散文集', 'article');
    useWritingStore
      .getState()
      .updateStatus(useWritingStore.getState().projects[0]!.id, 'completed');

    const projectId = useDevStore.getState().addProject('个人 App', '');
    useDevStore.getState().addTask(projectId, '重构首页', 'high');
    useDevStore.getState().addTask(projectId, '写文档', 'low');
    useDevStore
      .getState()
      .updateTaskStatus(projectId, useDevStore.getState().projects[0]!.tasks[0]!.id, 'done');

    useGameStore.getState().addGame('黑神话', 'PC');
    const gameId = useGameStore.getState().games[0]!.id;
    useGameStore.getState().addAchievement(gameId, '全收集', '');
    useGameStore.getState().addAchievement(gameId, '速通', '');
    useGameStore
      .getState()
      .toggleAchievement(gameId, useGameStore.getState().games[0]!.achievements[0]!.id);

    renderStats();

    expect(screen.getByRole('progressbar', { name: '阅读进度' })).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
    expect(screen.getByRole('progressbar', { name: '写作完成度' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
    expect(screen.getByRole('progressbar', { name: '开发任务完成度' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    expect(screen.getByRole('progressbar', { name: '成就解锁' })).toHaveAttribute(
      'aria-valuenow',
      '50',
    );
    expect(screen.getByText('在读 1 本 · 已读 0 本')).toBeInTheDocument();
  });

  it('空模块的进度环不会显示 NaN', () => {
    const tasks = useTaskStore.getState();
    tasks.addTask('随便一条', '', 'low', '');

    renderStats();

    expect(screen.getByRole('progressbar', { name: '写作完成度' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    expect(screen.getByRole('progressbar', { name: '成就解锁' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});

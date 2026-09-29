import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { GoalsPage } from './GoalsPage';
import { ToastProvider } from '../components/ui';
import { useGoalStore } from '../store/goalStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useDietStore } from '../store/dietStore';
import { useHabitStore } from '../store/habitStore';
import { useFocusStore } from '../store/focusStore';
import { todayKey } from '../utils/date';
import type { Goal } from '../types';

const TODAY = todayKey();
const store = () => useGoalStore.getState();

const goal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  metric: 'fitness.sessions',
  period: 'week',
  target: 4,
  createdAt: '2026-09-01T12:00:00',
  ...overrides,
});

const renderGoals = (): ReturnType<typeof render> =>
  render(
    <ToastProvider>
      <GoalsPage />
    </ToastProvider>,
  );

const openCreate = async (): Promise<HTMLElement> => {
  await userEvent.click(screen.getAllByRole('button', { name: '新建目标' })[0]!);
  return screen.getByRole('dialog', { name: '新建目标' });
};

beforeEach(() => {
  localStorage.clear();
  useGoalStore.setState({ goals: [] });
  useTaskStore.setState({ tasks: [], memos: [] });
  useBookStore.setState({ books: [], sessions: [] });
  useDevStore.setState({ projects: [], sessions: [] });
  useFitnessStore.setState({ plans: [], records: [] });
  useDietStore.setState({ records: [] });
  useHabitStore.setState({ habits: [] });
  useFocusStore.setState({ sessions: [], active: null });
});

describe('GoalsPage 空态与新建', () => {
  it('没有目标时给出空态与引导', () => {
    renderGoals();

    expect(screen.getByText('还没有目标')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '新建目标' })).toHaveLength(2);
  });

  it('默认预填「每周训练 4 次」，保存后按周期分组展示', async () => {
    renderGoals();
    const dialog = await openCreate();

    // 训练次数的建议值：每周 4 次
    expect(within(dialog).getByLabelText('目标值')).toHaveValue(4);
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(store().goals).toHaveLength(1);
    expect(store().goals[0]).toMatchObject({
      metric: 'fitness.sessions',
      period: 'week',
      target: 4,
    });
    expect(screen.getByRole('heading', { name: '每周' })).toBeInTheDocument();
    expect(screen.getByText('训练次数')).toBeInTheDocument();
    // 还没记录时进度为 0 / 4
    expect(screen.getByText('0 次 / 4 次')).toBeInTheDocument();
  });

  it('换指标后按新指标重算建议值，周期也会跟着换算', async () => {
    renderGoals();
    const dialog = await openCreate();

    await userEvent.selectOptions(within(dialog).getByLabelText('指标'), 'focus.minutes');
    expect(within(dialog).getByLabelText('目标值')).toHaveValue(300);

    await userEvent.click(within(dialog).getByRole('button', { name: '每日' }));
    expect(within(dialog).getByLabelText('目标值')).toHaveValue(60);
  });

  it('目标值清空时拦下来，不写入空目标', async () => {
    renderGoals();
    const dialog = await openCreate();

    fireEvent.change(within(dialog).getByLabelText('目标值'), { target: { value: '' } });
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(screen.getByRole('alert')).toHaveTextContent('目标值要是大于 0 的数字');
    expect(store().goals).toEqual([]);
  });

  it('同一指标同一周期已经有目标时直接拦下并指向那一条', async () => {
    useGoalStore.setState({ goals: [goal()] });
    renderGoals();
    const dialog = await openCreate();

    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(screen.getByRole('alert')).toHaveTextContent('已经有一个「每周训练次数」目标了');
    expect(store().goals).toHaveLength(1);
  });

  it('换一个周期就不算重复', async () => {
    useGoalStore.setState({ goals: [goal()] });
    renderGoals();
    const dialog = await openCreate();

    await userEvent.click(within(dialog).getByRole('button', { name: '每月' }));
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(store().goals).toHaveLength(2);
  });
});

describe('GoalsPage 进度与编辑', () => {
  it('进度来自各模块流水，现算而不是存快照', () => {
    useGoalStore.setState({ goals: [goal({ target: 4 })] });
    useFitnessStore
      .getState()
      .addRecord('推日', TODAY, [{ name: '杠铃卧推', sets: 5, reps: 5, weight: 60 }], '');

    renderGoals();

    expect(screen.getByText('1 次 / 4 次')).toBeInTheDocument();
    expect(screen.getByText('还差 3 次')).toBeInTheDocument();
    expect(screen.getByText('0/1 个已达成', { exact: false })).toBeInTheDocument();
  });

  it('超额完成也算达成，进度不会超过 100%', () => {
    useGoalStore.setState({ goals: [goal({ target: 2 })] });
    for (let i = 0; i < 3; i += 1) {
      useFitnessStore
        .getState()
        .addRecord('推日', TODAY, [{ name: '杠铃卧推', sets: 5, reps: 5, weight: 60 }], '');
    }

    renderGoals();

    expect(screen.getByText('3 次 / 2 次')).toBeInTheDocument();
    expect(screen.getByText('已达成')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('编辑目标值只改这一条', async () => {
    useGoalStore.setState({ goals: [goal()] });
    renderGoals();

    await userEvent.click(screen.getByRole('button', { name: '编辑「每周训练次数」' }));
    const dialog = screen.getByRole('dialog', { name: '编辑目标' });
    fireEvent.change(within(dialog).getByLabelText('目标值'), { target: { value: '6' } });
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(store().goals[0]!.target).toBe(6);
    expect(screen.getByText('0 次 / 6 次')).toBeInTheDocument();
  });

  it('删除后弹撤销提示，点撤销把整表还原', async () => {
    useGoalStore.setState({ goals: [goal()] });
    renderGoals();

    await userEvent.click(screen.getByRole('button', { name: '删除「每周训练次数」' }));

    expect(store().goals).toEqual([]);
    expect(screen.getByText('已删除目标')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '撤销' }));

    expect(store().goals).toHaveLength(1);
    expect(store().goals[0]!.id).toBe('g1');
  });
});

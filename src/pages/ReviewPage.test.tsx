import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { ReviewPage } from './ReviewPage';
import { ToastProvider } from '../components/ui';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useHabitStore } from '../store/habitStore';
import { useFocusStore } from '../store/focusStore';
import { useReviewStore } from '../store/reviewStore';
import { addDays, daysBetween, todayKey } from '../utils/date';
import { weekStartOf } from '../utils/habits';
import { periodEndOf, periodLabel, shiftPeriod } from '../utils/review';

const TODAY = todayKey();
const WEEK_START = weekStartOf(TODAY);
const store = () => useReviewStore.getState();

const renderReview = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/insight/review']}>
      <ToastProvider>
        <ReviewPage />
      </ToastProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({ tasks: [], memos: [] });
  useBookStore.setState({ books: [], sessions: [] });
  useDevStore.setState({ projects: [], sessions: [] });
  useWritingStore.setState({ projects: [] });
  useFitnessStore.setState({ plans: [], records: [] });
  useDietStore.setState({ records: [] });
  useHabitStore.setState({ habits: [] });
  useFocusStore.setState({ sessions: [], active: null });
  useReviewStore.setState({ reviews: [] });
});

describe('ReviewPage 汇总', () => {
  it('默认每周复盘，六张汇总卡与区期标题都在', () => {
    renderReview();

    for (const label of [
      '完成任务',
      '专注时长',
      '训练次数',
      '阅读时长',
      '热量日均',
      '习惯完成率',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(periodLabel('week', WEEK_START))).toBeInTheDocument();
    expect(screen.getByText('当前周')).toBeInTheDocument();
  });

  it('汇总数字来自各模块流水', () => {
    useFocusStore.setState({
      sessions: [
        {
          id: 'f1',
          date: TODAY,
          entityId: 't1',
          title: '写方案',
          target: 'task',
          mode: 'pomodoro',
          plannedMinutes: 25,
          minutes: 25,
          startedAt: '2026-09-28T09:00:00',
          endedAt: '2026-09-28T09:25:00',
          posted: false,
          createdAt: '2026-09-28T09:25:00',
        },
      ],
      active: null,
    });

    renderReview();

    expect(screen.getByText('25 分钟')).toBeInTheDocument();
    expect(screen.getByText('共 1 次专注')).toBeInTheDocument();
  });

  it('有停滞项目时给出提醒卡', () => {
    const projectId = useDevStore.getState().addProject('Life Manager', '个人应用');
    useDevStore.getState().updateProjectStatus(projectId, 'in-progress');
    useDevStore.getState().addSession(projectId, addDays(TODAY, -30), 2, '');

    renderReview();

    const end = periodEndOf('week', WEEK_START);
    const idleDays = daysBetween(addDays(TODAY, -30), end);
    expect(screen.getByText('停滞项目')).toBeInTheDocument();
    expect(screen.getByText('Life Manager')).toBeInTheDocument();
    expect(screen.getByText(`已停 ${idleDays} 天`)).toBeInTheDocument();
  });
});

describe('ReviewPage 填写', () => {
  it('保存写进 store，并提示已保存', async () => {
    renderReview();

    await userEvent.type(screen.getByLabelText('本周最有价值的一件事'), '写完了复盘页');
    await userEvent.click(screen.getByRole('button', { name: '保存这次复盘' }));

    expect(store().reviews).toHaveLength(1);
    expect(store().reviews[0]).toMatchObject({
      period: 'week',
      date: WEEK_START,
      best: '写完了复盘页',
    });
    expect(await screen.findByText('复盘已保存')).toBeInTheDocument();
    expect(screen.getByText('已保存')).toBeInTheDocument();
  });

  it('切换周期时问题措辞跟着变', async () => {
    renderReview();
    expect(screen.getByLabelText('本周最有价值的一件事')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '每日复盘' }));

    expect(screen.getByLabelText('今天最有价值的一件事')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '回到今天' })).toBeInTheDocument();
  });

  it('换到上一个周期会把已存的内容读回表单', async () => {
    const prevStart = shiftPeriod('week', WEEK_START, -1);
    store().saveReview('week', prevStart, { best: '上周的收获', blocker: '', next: '' });

    renderReview();
    expect(screen.getByLabelText('本周最有价值的一件事')).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: '上一周' }));

    expect(screen.getByLabelText('本周最有价值的一件事')).toHaveValue('上周的收获');
    expect(screen.getByRole('button', { name: '回到本周' })).toBeEnabled();
  });

  it('上一周 / 下一周 / 回到本周可以互相配合', async () => {
    renderReview();
    const back = () => screen.getByRole('button', { name: '回到本周' });
    expect(back()).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: '上一周' }));
    expect(back()).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: '下一周' }));
    expect(back()).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: '上一周' }));
    await userEvent.click(back());
    expect(back()).toBeDisabled();
    expect(screen.getByText(periodLabel('week', WEEK_START))).toBeInTheDocument();
  });

  it('没写过内容的记录不占历史位', () => {
    store().saveReview('week', WEEK_START, { best: '   ', blocker: '', next: '' });

    renderReview();

    expect(screen.getByText('还没有写过复盘')).toBeInTheDocument();
    expect(screen.getByText('共 0 次')).toBeInTheDocument();
  });
});

describe('ReviewPage 历史与删除', () => {
  it('删除后可以撤销', async () => {
    store().saveReview('week', WEEK_START, { best: '待删除', blocker: '', next: '' });
    renderReview();

    await userEvent.click(screen.getByRole('button', { name: '删除' }));
    expect(store().reviews).toHaveLength(0);

    await userEvent.click(await screen.findByRole('button', { name: '撤销' }));
    expect(store().reviews).toHaveLength(1);
    expect(store().reviews[0]!.best).toBe('待删除');
  });

  it('往期复盘列表点一下就能跳回那个周期', async () => {
    const prevStart = shiftPeriod('week', WEEK_START, -1);
    store().saveReview('week', prevStart, { best: '上周写下的', blocker: '', next: '' });

    renderReview();

    await userEvent.click(screen.getByRole('button', { name: /上周写下的/ }));

    expect(screen.getByLabelText('本周最有价值的一件事')).toHaveValue('上周写下的');
    expect(screen.getByRole('button', { name: '回到本周' })).toBeEnabled();
  });
});

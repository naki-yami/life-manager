import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { TasksPage } from './TasksPage';
import { ToastProvider } from '../components/ui';
import { useTaskStore } from '../store/taskStore';
import { todayKey } from '../utils/date';

beforeEach(() => {
  useTaskStore.setState({ tasks: [], memos: [] });
});

const seed = () => {
  const store = useTaskStore.getState();
  store.addTask('低优先级', '', 'low', '');
  store.addTask('紧急任务', '需要马上处理', 'high', todayKey());
  store.addTask('中等任务', '', 'medium', '');
};

describe('TasksPage', () => {
  it('没有任务时给出空态与主操作', async () => {
    render(<TasksPage />);

    expect(screen.getByText('还没有任务')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: '添加任务' })[0]!);

    expect(screen.getByRole('dialog', { name: '添加任务' })).toBeInTheDocument();
  });

  it('按优先级排序，紧急在前', () => {
    seed();
    render(<TasksPage />);

    const titles = screen
      .getAllByRole('checkbox')
      .map((box) => box.closest('li')?.querySelector('p')?.textContent);

    expect(titles[0]).toBe('紧急任务');
    expect(titles[1]).toBe('中等任务');
    expect(titles[2]).toBe('低优先级');
  });

  it('筛选项显示数量并可切换', async () => {
    seed();
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);
    render(<TasksPage />);

    const all = screen.getByRole('button', { name: /全部/ });
    expect(all).toHaveTextContent('3');

    await userEvent.click(screen.getByRole('button', { name: /已完成/ }));

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByText('低优先级')).toBeInTheDocument();
  });

  it('搜索可以按描述命中', async () => {
    seed();
    render(<TasksPage />);

    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), '马上');

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByText('紧急任务')).toBeInTheDocument();
  });

  it('搜索无结果时提示可以清除筛选', async () => {
    seed();
    render(<TasksPage />);

    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), 'zzz');
    expect(screen.getByText('没有符合条件的任务')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('今天截止与逾期分别用不同角标', () => {
    useTaskStore.getState().addTask('今天做', '', 'medium', todayKey());
    useTaskStore.getState().addTask('早就该做', '', 'medium', '2020-01-01');
    render(<TasksPage />);

    expect(screen.getByText('今天截止')).toBeInTheDocument();
    expect(screen.getByText(/已逾期 2020-01-01/)).toBeInTheDocument();
  });

  it('可以新增任务，标题为空时禁用提交', async () => {
    render(<TasksPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '添加任务' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '添加任务' });

    const submit = within(dialog).getByRole('button', { name: '添加' });
    expect(submit).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/^标题/), '写周报');
    await userEvent.click(submit);

    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().tasks[0]!.title).toBe('写周报');
  });

  it('编辑会带出原值并写回', async () => {
    seed();
    render(<TasksPage />);

    await userEvent.click(screen.getByRole('button', { name: '编辑「中等任务」' }));

    const dialog = screen.getByRole('dialog', { name: '编辑任务' });
    const titleInput = within(dialog).getByLabelText(/^标题/);
    expect(titleInput).toHaveValue('中等任务');

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, '改名后的任务');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(useTaskStore.getState().tasks.some((task) => task.title === '改名后的任务')).toBe(true);
  });

  it('删除需要二次确认，取消则不动数据', async () => {
    seed();
    render(<TasksPage />);

    await userEvent.click(screen.getByRole('button', { name: '删除「中等任务」' }));
    const dialog = screen.getByRole('dialog', { name: '删除任务' });

    await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(useTaskStore.getState().tasks).toHaveLength(3);

    await userEvent.click(screen.getByRole('button', { name: '删除「中等任务」' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: '删除任务' })).getByRole('button', {
        name: '删除',
      }),
    );

    expect(useTaskStore.getState().tasks).toHaveLength(2);
  });

  it('勾选可以切换完成状态', async () => {
    seed();
    render(<TasksPage />);

    await userEvent.click(screen.getByRole('checkbox', { name: '完成「紧急任务」' }));

    const task = useTaskStore.getState().tasks.find((item) => item.title === '紧急任务')!;
    expect(task.status).toBe('completed');
    expect(task.completedAt).toBeTruthy();
  });
  it('删除后可以点「撤销」把任务放回去', async () => {
    seed();
    render(
      <ToastProvider>
        <TasksPage />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: '删除「中等任务」' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: '删除任务' })).getByRole('button', {
        name: '删除',
      }),
    );

    expect(useTaskStore.getState().tasks).toHaveLength(2);
    expect(screen.getByText('已删除任务「中等任务」')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '撤销' }));

    const titles = useTaskStore.getState().tasks.map((task) => task.title);
    expect(titles).toEqual(['低优先级', '紧急任务', '中等任务']);
    expect(screen.getByText('中等任务')).toBeInTheDocument();
  });
});

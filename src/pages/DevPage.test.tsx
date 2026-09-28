import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DevPage } from './DevPage';
import { useDevStore } from '../store/devStore';

beforeEach(() => {
  useDevStore.setState({ projects: [] });
});

const projectId = (name: string) =>
  useDevStore.getState().projects.find((project) => project.name === name)!.id;

describe('DevPage', () => {
  it('空态引导新建项目', () => {
    render(<DevPage />);
    expect(screen.getByText('还没有项目')).toBeInTheDocument();
  });

  it('新建项目后自动展开', async () => {
    render(<DevPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '新建项目' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '新建项目' });
    await userEvent.type(within(dialog).getByLabelText(/^项目名称/), '写作助手');
    await userEvent.click(within(dialog).getByRole('button', { name: '创建' }));

    expect(useDevStore.getState().projects).toHaveLength(1);
    expect(screen.getByText('这个项目还没有任务')).toBeInTheDocument();
  });

  it('展开状态可以收起和再展开', async () => {
    useDevStore.getState().addProject('写作助手', '');
    render(<DevPage />);

    await userEvent.click(screen.getByRole('button', { name: '展开「写作助手」' }));
    expect(screen.getByText('这个项目还没有任务')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '收起「写作助手」' }));
    expect(screen.queryByText('这个项目还没有任务')).not.toBeInTheDocument();
  });

  it('可以给项目添加任务', async () => {
    useDevStore.getState().addProject('写作助手', '');
    render(<DevPage />);

    await userEvent.click(screen.getByRole('button', { name: '给「写作助手」添加任务' }));
    const dialog = screen.getByRole('dialog', { name: /写作助手/ });

    await userEvent.type(within(dialog).getByLabelText(/^任务标题/), '接上导出接口');
    await userEvent.click(within(dialog).getByRole('button', { name: '添加' }));

    expect(useDevStore.getState().projects[0]!.tasks).toHaveLength(1);
    expect(useDevStore.getState().projects[0]!.tasks[0]!.title).toBe('接上导出接口');
  });

  it('改任务状态会写回 store，并刷新完成率', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addTask(projectId('写作助手'), '接上导出接口', 'high');

    render(<DevPage />);
    await userEvent.click(screen.getByRole('button', { name: '展开「写作助手」' }));
    expect(screen.getByText('完成率 0%')).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '调整任务「接上导出接口」的状态' }),
      'done',
    );

    expect(useDevStore.getState().projects[0]!.tasks[0]!.status).toBe('done');
    expect(screen.getByText('完成率 100%')).toBeInTheDocument();
  });

  it('搜索可以命中任务标题', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addProject('记账工具', '');
    store.addTask(projectId('写作助手'), '接上导出接口', 'high');

    render(<DevPage />);
    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), '导出');

    expect(screen.getByText('写作助手')).toBeInTheDocument();
    expect(screen.queryByText('记账工具')).not.toBeInTheDocument();
  });

  it('删除任务直接生效，删除项目需要确认', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addTask(projectId('写作助手'), '接上导出接口', 'high');

    render(<DevPage />);
    await userEvent.click(screen.getByRole('button', { name: '展开「写作助手」' }));

    await userEvent.click(screen.getByRole('button', { name: '删除任务「接上导出接口」' }));
    expect(useDevStore.getState().projects[0]!.tasks).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: '删除项目「写作助手」' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: '删除项目' })).getByRole('button', {
        name: '删除',
      }),
    );
    expect(useDevStore.getState().projects).toHaveLength(0);
  });

  it('统计卡片汇总项目与任务数', () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addProject('记账工具', '');
    store.updateProjectStatus(projectId('写作助手'), 'in-progress');
    store.addTask(projectId('写作助手'), 'T1', 'low');
    store.addTask(projectId('写作助手'), 'T2', 'low');

    render(<DevPage />);

    // StatCard 的结构是 <div class="p-4"><div>label + icon</div><div>value</div></div>
    const statCard = (label: string) => screen.getByText(label).closest('div')!.parentElement!;

    expect(statCard('项目总数')).toHaveTextContent('2');
    expect(statCard('进行中项目')).toHaveTextContent('1');
    expect(statCard('任务总数')).toHaveTextContent('2');
  });
});

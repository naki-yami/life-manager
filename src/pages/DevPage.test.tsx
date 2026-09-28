import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DevPage } from './DevPage';
import { ToastProvider } from '../components/ui';
import { useDevStore } from '../store/devStore';
import { todayKey } from '../utils/date';

beforeEach(() => {
  useDevStore.setState({ projects: [], sessions: [] });
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

  it('记录工时会写入流水，并把工时累加到项目上', async () => {
    useDevStore.getState().addProject('写作助手', '');
    render(<DevPage />);

    await userEvent.click(screen.getByRole('button', { name: '记录工时' }));
    const dialog = screen.getByRole('dialog', { name: '记录工时' });

    fireEvent.change(within(dialog).getByRole('spinbutton', { name: '工时' }), {
      target: { value: '2.5' },
    });
    await userEvent.type(within(dialog).getByLabelText('备注'), '写完导出模块');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    const { sessions, projects } = useDevStore.getState();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.projectId).toBe(projectId('写作助手'));
    expect(sessions[0]!.date).toBe(todayKey());
    expect(sessions[0]!.hours).toBe(2.5);
    expect(sessions[0]!.note).toBe('写完导出模块');
    expect(projects[0]!.hoursSpent).toBe(2.5);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('近期投入卡片汇总每周工时与最近流水', () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addSession(projectId('写作助手'), todayKey(), 3, '第一章');
    store.addSession(projectId('写作助手'), todayKey(), 1.5, '');

    render(<DevPage />);

    expect(screen.getByText('近期投入')).toBeInTheDocument();
    expect(screen.getByText(/累计 4\.5 小时 · 2 条记录/)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /近 8 周每周投入工时：合计 4\.5 小时/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('第一章')).toBeInTheDocument();
  });

  it('没有工时流水时不渲染近期投入卡片', () => {
    useDevStore.getState().addProject('写作助手', '');
    render(<DevPage />);
    expect(screen.queryByText('近期投入')).not.toBeInTheDocument();
  });

  it('删除工时流水会把累计工时减回去，撤销后两边都恢复', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addSession(projectId('写作助手'), todayKey(), 2, '');

    render(
      <ToastProvider>
        <DevPage />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /在「写作助手」的工时记录/ }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: '删除工时记录' })).getByRole('button', {
        name: '删除',
      }),
    );

    expect(useDevStore.getState().sessions).toHaveLength(0);
    expect(useDevStore.getState().projects[0]!.hoursSpent).toBe(0);
    expect(screen.getByText(/已删除 .* 的工时记录/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '撤销' }));

    expect(useDevStore.getState().sessions).toHaveLength(1);
    expect(useDevStore.getState().projects[0]!.hoursSpent).toBe(2);
    expect(screen.getByText(/累计 2 小时 · 1 条记录/)).toBeInTheDocument();
  });

  it('编辑项目可以保存技术栈与仓库地址', async () => {
    useDevStore.getState().addProject('写作助手', '');
    render(<DevPage />);

    await userEvent.click(screen.getByRole('button', { name: '编辑「写作助手」' }));
    const dialog = screen.getByRole('dialog', { name: '编辑「写作助手」' });

    await userEvent.type(within(dialog).getByLabelText('技术栈'), 'React, TypeScript');
    await userEvent.type(
      within(dialog).getByLabelText('仓库地址'),
      'https://github.com/example/writing',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    const project = useDevStore.getState().projects[0]!;
    expect(project.techStack).toEqual(['React', 'TypeScript']);
    expect(project.repoUrl).toBe('https://github.com/example/writing');
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '打开「写作助手」的仓库地址' })).toBeInTheDocument();
  });

  it('归档的项目从默认列表隐藏，可以在「已归档」里找回', async () => {
    useDevStore.getState().addProject('写作助手', '');
    render(<DevPage />);

    await userEvent.click(screen.getByRole('button', { name: '归档「写作助手」' }));
    expect(useDevStore.getState().projects[0]!.archived).toBe(true);
    expect(screen.queryByText('写作助手')).not.toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole('group', { name: '按项目状态筛选' })).getByRole('button', {
        name: /已归档/,
      }),
    );
    expect(screen.getByText('写作助手')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '取消归档「写作助手」' }));
    expect(useDevStore.getState().projects[0]!.archived).toBe(false);
  });

  it('超过 14 天没有动静的未完成项目显示停滞提醒', () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addProject('记账工具', '');
    // 把「记账工具」的创建时间回拨 20 天，模拟一直没人动它
    store.updateProject(projectId('记账工具'), {
      createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
    });

    render(<DevPage />);

    expect(screen.getByText(/停滞 20 天/)).toBeInTheDocument();
    expect(screen.getAllByText(/停滞 \d+ 天/)).toHaveLength(1);
  });
});

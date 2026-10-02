import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { DevPage } from './DevPage';
import { ToastProvider } from '../components/ui';
import { useDevStore } from '../store/devStore';
import { useTaskStore } from '../store/taskStore';
import { todayKey } from '../utils/date';

beforeEach(() => {
  useDevStore.setState({ projects: [], sessions: [] });
  useTaskStore.setState({ tasks: [], memos: [] });
});

/** 项目栏要路由上下文（选中态写进 ?project=），工作项推送要 Toast */
const renderDev = (ui: React.ReactElement = <DevPage />) =>
  render(
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>,
  );

const projectId = (name: string) =>
  useDevStore.getState().projects.find((project) => project.name === name)!.id;

/** 新建项目弹窗走一遍：点按钮 → 填名称 → 创建 */
async function createProjectViaModal(name: string): Promise<void> {
  await userEvent.click(screen.getAllByRole('button', { name: '新建项目' })[0]!);
  const dialog = screen.getByRole('dialog', { name: '新建项目' });
  await userEvent.type(within(dialog).getByLabelText(/^项目名称/), name);
  await userEvent.click(within(dialog).getByRole('button', { name: '创建' }));
}

describe('DevPage 布局与项目', () => {
  it('空态引导新建项目', () => {
    renderDev();
    expect(screen.getByText('还没有项目')).toBeInTheDocument();
  });

  it('新建项目后自动选中，详情里能看到项目头', async () => {
    renderDev();
    await createProjectViaModal('写作助手');

    expect(useDevStore.getState().projects).toHaveLength(1);
    expect(screen.getByRole('heading', { name: '写作助手' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /写作助手/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('新建项目弹窗里在名称框按回车直接提交（U7）', async () => {
    renderDev();

    await userEvent.click(screen.getAllByRole('button', { name: '新建项目' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '新建项目' });
    await userEvent.type(within(dialog).getByLabelText(/^项目名称/), '回车建的项目{Enter}');

    expect(useDevStore.getState().projects[0]!.name).toBe('回车建的项目');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('左栏点另一个项目，详情跟着切换', async () => {
    useDevStore.getState().addProject('写作助手', '');
    useDevStore.getState().addProject('记账工具', '');
    renderDev();

    // 默认选中第一个
    expect(screen.getByRole('heading', { name: '写作助手' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /记账工具/ }));
    expect(screen.getByRole('heading', { name: '记账工具' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '写作助手' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /记账工具/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('页头汇总行：项目数、进行中、任务与累计工时', () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addProject('记账工具', '');
    store.updateProjectStatus(projectId('写作助手'), 'in-progress');
    store.addTask(projectId('写作助手'), 'T1', 'low');
    store.addSession(projectId('写作助手'), todayKey(), 2.5, '');

    renderDev();

    const header = screen.getByRole('banner');
    expect(within(header).getByText('2 个项目')).toBeInTheDocument();
    expect(within(header).getByText('1 进行中')).toBeInTheDocument();
    expect(within(header).getByText('任务 0/1')).toBeInTheDocument();
    expect(within(header).getByText('累计 2.5 小时')).toBeInTheDocument();
  });

  it('搜索可以命中任务标题', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addProject('记账工具', '');
    store.addTask(projectId('写作助手'), '接上导出接口', 'high');

    renderDev();
    await userEvent.type(screen.getByRole('textbox', { name: '搜索项目、任务或标签' }), '导出');

    expect(screen.getByRole('button', { name: /写作助手/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /记账工具/ })).not.toBeInTheDocument();
  });

  it('归档的项目从默认列表隐藏，可以在「已归档」里找回', async () => {
    useDevStore.getState().addProject('写作助手', '');
    renderDev();

    await userEvent.click(screen.getByRole('button', { name: '归档' }));
    expect(useDevStore.getState().projects[0]!.archived).toBe(true);
    expect(screen.queryByRole('button', { name: /写作助手/ })).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '按项目状态筛选' }),
      'archived',
    );
    expect(screen.getByRole('button', { name: /写作助手/ })).toBeInTheDocument();
    expect(screen.getAllByText('已归档').length).toBeGreaterThan(0); // 左栏徽章 + 详情徽章

    await userEvent.click(screen.getByRole('button', { name: '取消归档' }));
    expect(useDevStore.getState().projects[0]!.archived).toBe(false);
  });

  it('筛选把当前选中项滤掉后，详情落到第一个可见项目', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addProject('记账工具', '');
    store.updateProjectStatus(projectId('记账工具'), 'in-progress');
    renderDev();

    // 先选中「记账工具」，再用状态筛选把它单独留下
    await userEvent.click(screen.getByRole('button', { name: /记账工具/ }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '按项目状态筛选' }),
      'in-progress',
    );

    expect(screen.getByRole('heading', { name: '记账工具' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '写作助手' })).not.toBeInTheDocument();
  });

  it('超过 14 天没有动静的未完成项目显示停滞提醒', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addProject('记账工具', '');
    // 把「记账工具」的创建时间回拨 20 天，模拟一直没人动它
    store.updateProject(projectId('记账工具'), {
      createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
    });

    renderDev();

    // 左栏里「记账工具」带停滞标记，且只有它有
    expect(screen.getAllByText('停滞')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /记账工具/ }));
    expect(screen.getByText(/停滞 20 天/)).toBeInTheDocument();
  });
});

describe('DevPage 编辑与标签', () => {
  it('编辑在详情里就地展开，可以保存技术栈与仓库地址', async () => {
    useDevStore.getState().addProject('写作助手', '');
    renderDev();

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const form = document.getElementById('dev-project-edit-form')!.closest('div')!;

    await userEvent.type(within(form).getByLabelText('技术栈'), 'React, TypeScript');
    await userEvent.type(
      within(form).getByLabelText('仓库地址'),
      'https://github.com/example/writing',
    );
    await userEvent.click(within(form).getByRole('button', { name: '保存' }));

    const project = useDevStore.getState().projects[0]!;
    expect(project.techStack).toEqual(['React', 'TypeScript']);
    expect(project.repoUrl).toBe('https://github.com/example/writing');
    expect(screen.getByRole('link', { name: '打开「写作助手」的仓库地址' })).toBeInTheDocument();
  });

  it('「取消」只收起编辑表单，不写回 store', async () => {
    useDevStore.getState().addProject('写作助手', '');
    renderDev();

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const form = document.getElementById('dev-project-edit-form')!.closest('div')!;
    await userEvent.type(within(form).getByLabelText('技术栈'), 'Rust');
    await userEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(useDevStore.getState().projects[0]!.techStack).toEqual([]);
    expect(screen.queryByLabelText('技术栈')).not.toBeInTheDocument();
  });

  it('编辑项目时能打标签，保存后详情里显示', async () => {
    useDevStore.getState().addProject('记账工具', '');
    renderDev();

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const form = document.getElementById('dev-project-edit-form')!.closest('div')!;
    await userEvent.type(within(form).getByLabelText('标签'), '副业{Enter}');
    await userEvent.click(within(form).getByRole('button', { name: '保存' }));

    expect(useDevStore.getState().projects[0]!.tags).toEqual(['副业']);
    expect(screen.getByText('#副业')).toBeInTheDocument();
  });

  it('详情里可以就地补标签，标签会写回 store', async () => {
    useDevStore.getState().addProject('记账工具', '');
    renderDev();

    await userEvent.click(screen.getByRole('button', { name: '添加标签' }));
    await userEvent.type(screen.getByLabelText('编辑标签'), '副业{Enter}');
    await userEvent.click(screen.getByRole('button', { name: '完成' }));

    expect(useDevStore.getState().projects[0]!.tags).toEqual(['副业']);
  });
});

describe('DevPage 工作项', () => {
  it('行内表单添加工作项，可以带上里程碑与截止日期', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addMilestone(projectId('写作助手'), 'v1.0 发布');
    renderDev();

    await userEvent.type(screen.getByLabelText('新工作项标题'), '接上导出接口');
    await userEvent.selectOptions(screen.getAllByRole('combobox', { name: '优先级' })[0]!, 'high');
    await userEvent.selectOptions(
      screen.getAllByRole('combobox', { name: '里程碑' })[0]!,
      useDevStore.getState().projects[0]!.milestones[0]!.id,
    );
    fireEventDate(screen.getByLabelText('截止日期'), '2026-10-31');
    const workForm = screen.getByLabelText('新工作项标题').closest('form')!;
    await userEvent.click(within(workForm).getByRole('button', { name: '添加' }));

    const task = useDevStore.getState().projects[0]!.tasks[0]!;
    expect(task.title).toBe('接上导出接口');
    expect(task.priority).toBe('high');
    expect(task.milestoneId).toBe(useDevStore.getState().projects[0]!.milestones[0]!.id);
    expect(task.dueDate).toBe('2026-10-31');
    // 副行里能看到里程碑与截止（里程碑标题在磁贴 / 副行 / 下拉选项里都有，按数量断言）
    expect(screen.getAllByText('v1.0 发布').length).toBeGreaterThan(0);
    expect(screen.getByText(/截止 2026-10-31/)).toBeInTheDocument();
  });

  it('改任务状态会写回 store，并刷新详情进度', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addTask(projectId('写作助手'), '接上导出接口', 'high');

    renderDev();
    expect(screen.getByText('任务完成 0/1')).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '调整任务「接上导出接口」的状态' }),
      'done',
    );

    expect(useDevStore.getState().projects[0]!.tasks[0]!.status).toBe('done');
    expect(screen.getByText('任务完成 1/1')).toBeInTheDocument();
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0); // 详情头 + 左栏进度
  });

  it('行内筛选：未完成 / Bug / 全部', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addTask(projectId('写作助手'), '修导出崩溃', 'high', 'bug');
    store.addTask(projectId('写作助手'), '加暗色模式', 'low', 'feature');
    store.updateTaskStatus(
      projectId('写作助手'),
      useDevStore.getState().projects[0]!.tasks[1]!.id,
      'done',
    );
    renderDev();

    // 默认「未完成」：只见 BUG 那条
    expect(screen.getByText('修导出崩溃')).toBeInTheDocument();
    expect(screen.queryByText('加暗色模式')).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '筛选工作项' }), 'bug');
    expect(screen.getByText('修导出崩溃')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '筛选工作项' }), 'all');
    expect(screen.getByText('加暗色模式')).toBeInTheDocument();
  });

  it('列表 / 看板切换：看板按状态分三列，拖不动时下拉也能改状态', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addTask(projectId('写作助手'), '修导出崩溃', 'high', 'bug');
    renderDev();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '切换工作项视图' }),
      'board',
    );

    const board = screen.getByRole('group', { name: '「写作助手」的工作项看板' });
    expect(within(board).getAllByText('待办')).toHaveLength(2); // 列头 + 卡片上的状态下拉值
    expect(within(board).getByText('修导出崩溃')).toBeInTheDocument();

    await userEvent.selectOptions(
      within(board).getByRole('combobox', { name: '调整任务「修导出崩溃」的状态' }),
      'done',
    );
    expect(useDevStore.getState().projects[0]!.tasks[0]!.status).toBe('done');
  });

  it('删除任务直接生效，删除项目需要确认', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addTask(projectId('写作助手'), '接上导出接口', 'high');

    renderDev();

    await userEvent.click(screen.getByRole('button', { name: '删除任务「接上导出接口」' }));
    expect(useDevStore.getState().projects[0]!.tasks).toHaveLength(0);

    await userEvent.click(screen.getAllByRole('button', { name: '删除' })[0]!);
    await userEvent.click(
      within(screen.getByRole('dialog', { name: '删除项目' })).getByRole('button', {
        name: '删除',
      }),
    );
    expect(useDevStore.getState().projects).toHaveLength(0);
  });

  it('工作项可以推送到今日计划，带 ref 回链；重复推送给提醒', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addTask(projectId('写作助手'), '修导出崩溃', 'high');
    renderDev();

    await userEvent.click(screen.getByRole('button', { name: '把「修导出崩溃」加入今日计划' }));

    const pushed = useTaskStore.getState().tasks[0]!;
    expect(pushed.title).toBe('[写作助手] 修导出崩溃');
    expect(pushed.ref?.devTaskId).toBe(useDevStore.getState().projects[0]!.tasks[0]!.id);
    expect(screen.getByText('已加入今日计划')).toBeInTheDocument();

    // 再推一次：不重复建，只给警告
    await userEvent.click(screen.getByRole('button', { name: '把「修导出崩溃」加入今日计划' }));
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(screen.getByText('已经在今日计划里')).toBeInTheDocument();
  });
});

describe('DevPage 里程碑 / 日志 / 工时', () => {
  it('里程碑可以添加、勾选与显示逾期', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    renderDev();

    await userEvent.type(screen.getByLabelText('新里程碑'), 'v1.0 发布');
    fireEventDate(screen.getByLabelText('目标日期'), '2020-01-01');
    const milestoneForm = screen.getByLabelText('新里程碑').closest('form')!;
    await userEvent.click(within(milestoneForm).getByRole('button', { name: '添加' }));

    const milestone = useDevStore.getState().projects[0]!.milestones[0]!;
    expect(milestone.title).toBe('v1.0 发布');
    expect(screen.getByText(/已逾期/)).toBeInTheDocument();
    expect(screen.getByText(/0\/1 个/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: '完成里程碑「v1.0 发布」' }));
    expect(useDevStore.getState().projects[0]!.milestones[0]!.done).toBe(true);
    expect(screen.getByText(/1\/1 个/)).toBeInTheDocument();
  });

  it('开发日志可以记一笔', async () => {
    useDevStore.getState().addProject('写作助手', '');
    renderDev();

    await userEvent.type(screen.getByLabelText('今天做了什么'), '完成导入预览');
    await userEvent.click(screen.getByRole('button', { name: '记一笔' }));

    const project = useDevStore.getState().projects[0]!;
    expect(project.logs).toHaveLength(1);
    expect(project.logs[0]!.content).toBe('完成导入预览');
    expect(screen.getByText('完成导入预览')).toBeInTheDocument();
  });

  it('记录工时会写入流水，并把工时累加到项目上', async () => {
    useDevStore.getState().addProject('写作助手', '');
    renderDev();

    await userEvent.click(screen.getAllByRole('button', { name: '记录工时' })[0]!);
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

  it('近期投入按项目统计：柱图与最近流水都在详情里，没流水时给空态', () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addSession(projectId('写作助手'), todayKey(), 3, '第一章');
    store.addSession(projectId('写作助手'), todayKey(), 1.5, '');

    renderDev();

    expect(screen.getByText('近期投入')).toBeInTheDocument();
    expect(screen.getByText(/累计 4\.5 小时 · 2 条记录/)).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: /「写作助手」近 8 周每周投入工时：合计 4\.5 小时/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('第一章')).toBeInTheDocument();
  });

  it('删除工时流水会把累计工时减回去，撤销后两边都恢复', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addSession(projectId('写作助手'), todayKey(), 2, '');

    renderDev();

    await userEvent.click(screen.getByRole('button', { name: /删除 .* 的工时记录/ }));
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
});

/** jsdom 对 input[type=date] 的赋值走 fireEvent.change 才稳 */
function fireEventDate(element: Element, value: string): void {
  fireEvent.change(element, { target: { value } });
}

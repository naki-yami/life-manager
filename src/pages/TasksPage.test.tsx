import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TasksPage } from './TasksPage';
import { ToastProvider } from '../components/ui';
import { useTaskStore } from '../store/taskStore';
import { addDays, todayKey } from '../utils/date';
import { requestPaletteFocus, resetPaletteFocus } from '../hooks/usePaletteFocus';
import { MASTER_DETAIL_QUERY } from '../components/layout';
import { mockMediaQueries } from '../test/matchMedia';

beforeEach(() => {
  useTaskStore.setState({ tasks: [], memos: [] });
});

describe('TasksPage 从命令面板打开', () => {
  afterEach(() => {
    resetPaletteFocus();
  });

  it('聚焦某条任务时打开它的编辑弹窗', () => {
    seed();
    render(<TasksPage />);
    const task = useTaskStore.getState().tasks.find((item) => item.title === '紧急任务')!;

    act(() => {
      requestPaletteFocus('/tasks', task.id);
    });

    const dialog = screen.getByRole('dialog', { name: '编辑任务' });
    expect(within(dialog).getByLabelText(/^标题/)).toHaveValue('紧急任务');
  });

  it('聚焦一条不存在的任务时安静跳过', () => {
    render(<TasksPage />);

    act(() => {
      requestPaletteFocus('/tasks', 'missing');
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
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

  it('今天截止与逾期分别用不同角标，逾期显示天数', () => {
    useTaskStore.getState().addTask('今天做', '', 'medium', todayKey());
    useTaskStore.getState().addTask('早就该做', '', 'medium', '2020-01-01');
    render(<TasksPage />);

    expect(screen.getByText('今天截止')).toBeInTheDocument();
    expect(screen.getByText(/已逾期 \d+ 天/)).toBeInTheDocument();
    expect(screen.queryByText(/已逾期 2020-01-01/)).not.toBeInTheDocument();
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

  it('勾选完成后出现撤销提示，撤销会恢复待办', async () => {
    seed();
    render(
      <ToastProvider>
        <TasksPage />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: '完成「紧急任务」' }));
    expect(useTaskStore.getState().tasks[1]!.status).toBe('completed');
    expect(screen.getByText('已完成「紧急任务」')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(useTaskStore.getState().tasks[1]!.status).toBe('pending');
  });

  it('优先级筛选只保留对应任务', async () => {
    seed();
    render(<TasksPage />);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '按优先级筛选' }), 'low');

    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByText('低优先级')).toBeInTheDocument();
    expect(screen.queryByText('紧急任务')).not.toBeInTheDocument();
  });

  it('看板视图把任务分到待办与已完成两列', async () => {
    seed();
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);
    render(<TasksPage />);

    await userEvent.click(screen.getByRole('button', { name: '看板' }));

    const board = screen.getByRole('group', { name: '任务看板' });
    expect(board).toBeInTheDocument();
    const todoColumn = within(board)
      .getByRole('heading', { name: '待办' })
      .closest('div')!.parentElement!;
    expect(within(todoColumn).getByText('紧急任务')).toBeInTheDocument();

    const doneColumn = within(board)
      .getByRole('heading', { name: '已完成' })
      .closest('div')!.parentElement!;
    expect(within(doneColumn).getByText('低优先级')).toBeInTheDocument();
  });

  it('四象限视图把任务分进对应格子', async () => {
    seed();
    render(<TasksPage />);

    await userEvent.click(screen.getByRole('button', { name: '四象限' }));

    // Card 根节点 = h2 的两层外层（标题容器 → 卡片头 → 卡片根）
    const cardOf = (heading: string) =>
      screen.getByRole('heading', { name: heading }).closest('div')!.parentElement!.parentElement!;

    const doCell = cardOf('重要且紧急');
    expect(within(doCell).getByText('紧急任务')).toBeInTheDocument();

    const dropCell = cardOf('不重要不紧急');
    expect(within(dropCell).getByText('低优先级')).toBeInTheDocument();
    expect(within(dropCell).getByText('中等任务')).toBeInTheDocument();
  });

  it('今日进度卡展示到期完成度与每周完成柱状图', () => {
    seed();
    render(<TasksPage />);

    expect(screen.getByText('今日到期 1 件，已完成 0 件')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '今日到期任务完成 0/1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /近 8 周每周完成任务数/ })).toBeInTheDocument();
  });

  it('展开后可以添加并勾选子任务，进度实时同步', async () => {
    seed();
    render(<TasksPage />);

    // 列表按优先级排序，第一张卡是「紧急任务」
    await userEvent.click(screen.getAllByRole('button', { name: '添加子任务' })[0]!);
    const input = screen.getByLabelText('为「紧急任务」添加子任务');
    await userEvent.type(input, '准备材料{Enter}');

    expect(useTaskStore.getState().tasks[1]!.subtasks).toHaveLength(1);
    expect(screen.getByText('子任务 0/1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: '完成子任务「准备材料」' }));
    expect(useTaskStore.getState().tasks[1]!.subtasks[0]!.done).toBe(true);
    expect(screen.getByText('子任务 1/1')).toBeInTheDocument();
  });

  it('创建每天重复的任务，完成后自动生成下一次', async () => {
    render(<TasksPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '添加任务' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '添加任务' });

    await userEvent.type(within(dialog).getByLabelText(/^标题/), '站会');
    fireEvent.change(within(dialog).getByLabelText('截止日期'), {
      target: { value: todayKey() },
    });
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: '重复' }), 'daily');
    await userEvent.click(within(dialog).getByRole('button', { name: '添加' }));

    expect(useTaskStore.getState().tasks[0]!.repeat).toEqual({ kind: 'daily' });

    await userEvent.click(screen.getByRole('checkbox', { name: '完成「站会」' }));

    const tasks = useTaskStore.getState().tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.status).toBe('completed');
    expect(tasks[1]!.status).toBe('pending');
    expect(tasks[1]!.dueDate).toBe(addDays(todayKey(), 1));
    expect(screen.getAllByText('站会')).toHaveLength(2);
  });

  it('选择每周重复时可以挑选星期', async () => {
    render(<TasksPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '添加任务' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '添加任务' });

    await userEvent.type(within(dialog).getByLabelText(/^标题/), '健身打卡');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: '重复' }), 'weekly');

    const weekdays = within(dialog).getByRole('group', { name: '选择每周重复的星期' });
    await userEvent.click(within(weekdays).getByRole('button', { name: '周一' }));
    await userEvent.click(within(weekdays).getByRole('button', { name: '周三' }));
    await userEvent.click(within(weekdays).getByRole('button', { name: '周五' }));

    await userEvent.click(within(dialog).getByRole('button', { name: '添加' }));

    expect(useTaskStore.getState().tasks[0]!.repeat).toEqual({
      kind: 'weekly',
      weekdays: [0, 2, 4],
    });
  });
});

describe('TasksPage 标签', () => {
  it('添加任务时能打标签，卡片上会显示', async () => {
    render(<TasksPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '添加任务' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '添加任务' });
    await userEvent.type(within(dialog).getByLabelText(/^标题/), '整理发票');
    await userEvent.type(within(dialog).getByLabelText('标签'), '财务{Enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: '添加' }));

    expect(useTaskStore.getState().tasks[0]!.tags).toEqual(['财务']);
    expect(screen.getByText('#财务')).toBeInTheDocument();
  });

  it('卡片上可以就地补标签，标签会写回 store', async () => {
    useTaskStore.getState().addTask('整理发票', '', 'medium', '');
    render(<TasksPage />);

    await userEvent.click(screen.getByRole('button', { name: '添加标签' }));
    await userEvent.type(screen.getByLabelText('编辑标签'), '财务{Enter}');
    await userEvent.click(screen.getByRole('button', { name: '完成' }));

    expect(useTaskStore.getState().tasks[0]!.tags).toEqual(['财务']);
    expect(screen.getByText('#财务')).toBeInTheDocument();
  });

  it('搜索框里输入 #标签 能筛出对应的任务', async () => {
    const store = useTaskStore.getState();
    store.addTask('整理发票', '', 'medium', '', null, ['财务']);
    store.addTask('写周报', '', 'medium', '', null, ['工作']);
    render(<TasksPage />);

    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), '#财务');

    expect(screen.getByText('整理发票')).toBeInTheDocument();
    expect(screen.queryByText('写周报')).not.toBeInTheDocument();
  });
});
describe('TasksPage 宽屏双栏', () => {
  afterEach(() => {
    resetPaletteFocus();
  });

  const expectWideLayout = (): void => mockMediaQueries({ [MASTER_DETAIL_QUERY]: true });
  const panel = (): HTMLElement => screen.getByRole('complementary', { name: '编辑任务' });

  it('宽屏右栏常驻，没选中任务时是占位内容', () => {
    seed();
    expectWideLayout();

    render(<TasksPage />);

    expect(within(panel()).getByText('还没有选中任务')).toBeInTheDocument();
    expect(screen.getByText('中等任务')).toBeInTheDocument();
  });

  it('点「编辑」在右栏就地改，不再弹对话框，列表也还在', async () => {
    seed();
    expectWideLayout();

    render(<TasksPage />);
    await userEvent.click(screen.getByRole('button', { name: '编辑「中等任务」' }));

    // 焦点没被搬进对话框，列表也没被遮住
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('紧急任务')).toBeInTheDocument();

    const titleInput = within(panel()).getByLabelText(/^标题/);
    expect(titleInput).toHaveValue('中等任务');

    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, '改名后的任务');
    await userEvent.click(within(panel()).getByRole('button', { name: '保存' }));

    expect(useTaskStore.getState().tasks.some((task) => task.title === '改名后的任务')).toBe(true);
    // 存完右栏回到占位，不留上一条的残影
    expect(within(panel()).getByText('还没有选中任务')).toBeInTheDocument();
  });

  it('编辑右栏里在标题框按回车也直接保存（U7 尾巴）', async () => {
    seed();
    expectWideLayout();

    render(<TasksPage />);
    await userEvent.click(screen.getByRole('button', { name: '编辑「中等任务」' }));

    const titleInput = within(panel()).getByLabelText(/^标题/);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, '回车改名的任务{Enter}');

    expect(useTaskStore.getState().tasks.some((task) => task.title === '回车改名的任务')).toBe(
      true,
    );
    expect(within(panel()).getByText('还没有选中任务')).toBeInTheDocument();
  });

  it('宽屏下命令面板聚焦某条任务，也直接进右栏', () => {
    seed();
    expectWideLayout();

    render(<TasksPage />);
    const task = useTaskStore.getState().tasks.find((item) => item.title === '紧急任务')!;

    act(() => {
      requestPaletteFocus('/tasks', task.id);
    });

    expect(within(panel()).getByLabelText(/^标题/)).toHaveValue('紧急任务');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('「取消」只关右栏，不写回 store', async () => {
    seed();
    expectWideLayout();

    render(<TasksPage />);
    await userEvent.click(screen.getByRole('button', { name: '编辑「中等任务」' }));

    const titleInput = within(panel()).getByLabelText(/^标题/);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, '不该被保存');
    await userEvent.click(within(panel()).getByRole('button', { name: '取消' }));

    expect(within(panel()).getByText('还没有选中任务')).toBeInTheDocument();
    expect(useTaskStore.getState().tasks).toHaveLength(3);
    expect(useTaskStore.getState().tasks.some((task) => task.title === '不该被保存')).toBe(false);
  });

  it('再点另一条任务的「编辑」，右栏换成那一条', async () => {
    seed();
    expectWideLayout();

    render(<TasksPage />);
    await userEvent.click(screen.getByRole('button', { name: '编辑「中等任务」' }));
    expect(within(panel()).getByLabelText(/^标题/)).toHaveValue('中等任务');

    await userEvent.click(screen.getByRole('button', { name: '编辑「紧急任务」' }));
    expect(within(panel()).getByLabelText(/^标题/)).toHaveValue('紧急任务');
  });
});

describe('TasksPage 批量操作', () => {
  it('点「批量」进入批量模式：操作条出现，单条操作图标藏起来', async () => {
    seed();
    render(<TasksPage />);

    expect(screen.queryByRole('toolbar', { name: '批量操作' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '批量' }));

    expect(screen.getByRole('toolbar', { name: '批量操作' })).toBeInTheDocument();
    // 进入时就替用户勾上一条，操作条不该写着「已选 0 项」
    expect(
      within(screen.getByRole('toolbar', { name: '批量操作' })).getByText('1'),
    ).toBeInTheDocument();
    // 单条的编辑/删除图标藏起来，免得误点
    expect(screen.queryByRole('button', { name: '编辑「中等任务」' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除「中等任务」' })).not.toBeInTheDocument();
  });

  it('勾选框换成「选中」，完成勾选框让位', async () => {
    seed();
    render(<TasksPage />);

    expect(screen.getByLabelText('完成「中等任务」')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '批量' }));

    expect(screen.queryByLabelText('完成「中等任务」')).not.toBeInTheDocument();
    expect(screen.getByLabelText('选中「中等任务」')).toBeInTheDocument();
  });

  it('点卡片上的勾选框能加减选中，计数跟着变', async () => {
    seed();
    render(<TasksPage />);
    await userEvent.click(screen.getByRole('button', { name: '批量' }));

    const bar = () => within(screen.getByRole('toolbar', { name: '批量操作' }));
    expect(bar().getByText('1')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('选中「低优先级」'));
    expect(bar().getByText('2')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('选中「低优先级」'));
    expect(bar().getByText('1')).toBeInTheDocument();
  });

  it('全选选的是当前筛出来的那批，不是全部', async () => {
    seed();
    render(<TasksPage />);

    // 先筛出「待办」：三条都是待办，再按优先级筛成一条
    await userEvent.click(screen.getByRole('button', { name: /已完成/ }));
    await userEvent.click(screen.getByRole('button', { name: /全部/ }));

    await userEvent.click(screen.getByRole('button', { name: '批量' }));
    await userEvent.click(screen.getByRole('button', { name: '全选' }));

    // 「3」在统计卡里也有，从操作条里读才不歧义
    expect(
      within(screen.getByRole('toolbar', { name: '批量操作' })).getByText('3'),
    ).toBeInTheDocument();
  });

  it('批量改优先级对选中的每一条都生效', async () => {
    seed();
    render(<TasksPage />);
    await userEvent.click(screen.getByRole('button', { name: '批量' }));
    await userEvent.click(screen.getByRole('button', { name: '全选' }));

    await userEvent.selectOptions(screen.getByLabelText('批量修改优先级'), 'high');

    const priorities = useTaskStore.getState().tasks.map((task) => task.priority);
    expect(priorities.every((priority) => priority === 'high')).toBe(true);
  });

  it('批量打标签是并集，不改动别的标签', async () => {
    seed();
    const store = useTaskStore.getState();
    store.updateTask(store.tasks[0]!.id, { tags: ['已有'] });

    render(<TasksPage />);
    await userEvent.click(screen.getByRole('button', { name: '批量' }));
    await userEvent.click(screen.getByRole('button', { name: '全选' }));
    await userEvent.click(screen.getByRole('button', { name: '打标签' }));

    const dialog = screen.getByRole('dialog', { name: '批量打标签' });
    expect(within(dialog).getByText(/将对选中的 3 条任务生效/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('textbox', { name: '标签' }), '批量加的{enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: '应用' }));

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.every((task) => task.tags.includes('批量加的'))).toBe(true);
    expect(tasks.find((task) => task.tags.includes('已有'))).toBeTruthy();
  });

  it('批量移除标签只摘掉指定的那个', async () => {
    seed();
    const store = useTaskStore.getState();
    for (const task of store.tasks) store.updateTask(task.id, { tags: ['保留', '要去掉'] });

    render(<TasksPage />);
    await userEvent.click(screen.getByRole('button', { name: '批量' }));
    await userEvent.click(screen.getByRole('button', { name: '全选' }));
    await userEvent.click(screen.getByRole('button', { name: '打标签' }));

    const dialog = screen.getByRole('dialog', { name: '批量打标签' });
    await userEvent.click(within(dialog).getByRole('button', { name: '移除' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: '标签' }), '要去掉{enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: '应用' }));

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.every((task) => task.tags.includes('保留'))).toBe(true);
    expect(tasks.some((task) => task.tags.includes('要去掉'))).toBe(false);
  });

  it('批量删除要二次确认，删完能整体撤销', async () => {
    seed();
    render(
      <ToastProvider>
        <TasksPage />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: '批量' }));
    await userEvent.click(screen.getByRole('button', { name: '全选' }));
    await userEvent.click(screen.getByRole('button', { name: '删除' }));

    const dialog = screen.getByRole('dialog', { name: '批量删除任务' });
    expect(within(dialog).getByText(/选中的 3 条任务/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '删除' }));

    expect(useTaskStore.getState().tasks).toHaveLength(0);
    // 删完退出批量模式，免得操作条还挂着「已选 3 项」
    expect(screen.queryByRole('toolbar', { name: '批量操作' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(useTaskStore.getState().tasks).toHaveLength(3);
  });

  it('批量改截止日能设为今天，也能清空', async () => {
    seed();
    render(<TasksPage />);
    await userEvent.click(screen.getByRole('button', { name: '批量' }));
    await userEvent.click(screen.getByRole('button', { name: '全选' }));

    await userEvent.selectOptions(screen.getByLabelText('批量修改截止日'), 'today');
    expect(useTaskStore.getState().tasks.every((task) => task.dueDate === todayKey())).toBe(true);

    await userEvent.selectOptions(screen.getByLabelText('批量修改截止日'), 'clear');
    expect(useTaskStore.getState().tasks.every((task) => task.dueDate === '')).toBe(true);
  });

  it('筛掉已选中的条目后，它自动退出选中集', async () => {
    seed();
    render(<TasksPage />);
    await userEvent.click(screen.getByRole('button', { name: '批量' }));
    await userEvent.click(screen.getByRole('button', { name: '全选' }));
    expect(
      within(screen.getByRole('toolbar', { name: '批量操作' })).getByText('3'),
    ).toBeInTheDocument();

    // 切到「已完成」筛选：三条都是待办，列表被筛空
    await userEvent.click(screen.getByRole('button', { name: /已完成/ }));

    // 选中的条目已经不在列表里了，不该还留在选中集里
    expect(screen.queryByRole('toolbar', { name: '批量操作' })).not.toBeInTheDocument();
  });

  it('新建弹窗里在标题框按回车直接提交（U7）', async () => {
    render(<TasksPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '添加任务' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '添加任务' });

    await userEvent.type(within(dialog).getByLabelText(/^标题/), '回车提交的任务{Enter}');

    expect(useTaskStore.getState().tasks[0]!.title).toBe('回车提交的任务');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('TasksPage 行间键盘导航（U8）', () => {
  it('j / k 在任务之间走，x 就地进批量模式；勾选框换角色也不掉焦点', async () => {
    const user = userEvent.setup();
    const store = useTaskStore.getState();
    store.addTask('写周报', '', 'high', '');
    store.addTask('回邮件', '', 'low', '');
    render(<TasksPage />);

    const boxes = screen.getAllByRole('checkbox', { name: /完成|标记/ });
    expect(boxes).toHaveLength(2);

    // 只聚焦不点击：点勾选框会把任务标记完成，那是另一回事
    boxes[0]!.focus();
    await user.keyboard('j');
    expect(boxes[1]).toHaveFocus();

    // x 之后这一行的勾选框从「完成」换成「选中」，但焦点还在这颗上：
    // 选中/取消能连着按，不用重新找位置
    await user.keyboard('x');
    const selected = screen.getAllByRole('checkbox').find((box) => box === boxes[1]);
    expect(selected).toBeChecked();
    expect(boxes[1]).toHaveFocus();
  });
});

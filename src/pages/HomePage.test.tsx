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
import { DASHBOARD_WIDGET_IDS, DEFAULT_DASHBOARD, useUiStore } from '../store/uiStore';
import { STORAGE_KEYS } from '../utils/storageKeys';
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
  useUiStore.setState({ dashboard: DEFAULT_DASHBOARD.map((widget) => ({ ...widget })) });
});

/** 仪表盘栅格；页面里可能还有卡片内部的列表，取文档顺序里的第一个 */
const dashboardList = (): HTMLElement => screen.getAllByRole('list')[0]!;
const dashboardItems = (): HTMLElement[] => within(dashboardList()).getAllByRole('listitem');

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
    store.addTask('A', '', 'low', todayKey());
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);

    renderHome();
    // 今日到期 1 件已完成 1 件 → 100%
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('今日到期 1/1')).toBeInTheDocument();
  });

  it('没有到期任务时，今日完成率显示今天完成的数量', () => {
    const store = useTaskStore.getState();
    store.addTask('A', '', 'low', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);

    renderHome();
    expect(screen.getByText('今日完成率').closest('div')!.parentElement!).toHaveTextContent('1');
    expect(screen.getByText('今天没有到期任务')).toBeInTheDocument();
  });

  it('问候语按时段变化，摘要里带待办数与紧急数', () => {
    useTaskStore.getState().addTask('写周报', '', 'high', '');
    useTaskStore.getState().addTask('买牛奶', '', 'low', '');

    renderHome();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /(早上好|中午好|下午好|晚上好|夜深了)/,
    );
    expect(screen.getByText(/今天有 2 件事待办，其中 1 件紧急/)).toBeInTheDocument();
  });

  it('今日聚焦自动挑出最该先做的一件，并可一键完成', async () => {
    const store = useTaskStore.getState();
    store.addTask('今天的事', '', 'low', todayKey());
    store.addTask('逾期的高优', '', 'high', '2026-09-01');
    renderHome();

    const focusCard = screen.getByText('今日聚焦').closest('div')!.parentElement!.parentElement!;
    expect(within(focusCard).getByText('逾期的高优')).toBeInTheDocument();

    await userEvent.click(within(focusCard).getByRole('button', { name: '一键完成' }));
    expect(
      useTaskStore
        .getState()
        .tasks.find((task) => task.title === '逾期的高优')!.status,
    ).toBe('completed');
  });

  it('快速添加任务支持 !优先级 与 @日期 语法', async () => {
    renderHome();

    await userEvent.type(
      screen.getByRole('textbox', { name: '快速添加任务' }),
      '写周报 !高 @今天{Enter}',
    );

    const task = useTaskStore.getState().tasks[0]!;
    expect(task.title).toBe('写周报');
    expect(task.priority).toBe('high');
    expect(task.dueDate).toBe(todayKey());
  });

  it('连续打卡按当天有活动统计', () => {
    const store = useTaskStore.getState();
    store.addTask('写周报', '', 'high', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);

    renderHome();

    const streakCard = screen.getByText('连续打卡').closest('div')!.parentElement!;
    expect(within(streakCard).getByText('1')).toBeInTheDocument();
  });

  it('备忘可以一键转为任务', async () => {
    useTaskStore.getState().addMemo('临时想法');
    renderHome();

    await userEvent.click(screen.getByRole('button', { name: '把备忘「临时想法」转为任务' }));

    expect(useTaskStore.getState().tasks[0]!.title).toBe('临时想法');
    expect(useTaskStore.getState().memos).toHaveLength(1);
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
    useDietStore
      .getState()
      .addRecord(todayKey(), 'lunch', [{ name: '鸡胸肉', category: 'protein', calories: 300 }]);
    useGameStore.getState().addGame('黑神话', 'PC');

    renderHome();

    expect(screen.getByText('1 本在读')).toBeInTheDocument();
    expect(screen.getByText('300 kcal')).toBeInTheDocument();
    expect(screen.getByText('1 款在玩')).toBeInTheDocument();

    await userEvent.click(screen.getByText('读书'));
    expect(screen.getByText('读书页面')).toBeInTheDocument();
  });
  it('没有活动数据时不渲染热力图卡片', () => {
    renderHome();

    expect(screen.queryByRole('img', { name: /活动热力图/ })).not.toBeInTheDocument();
    expect(screen.queryByText('近 30 天活动')).not.toBeInTheDocument();
  });

  it('有活动时展示近 30 天热力图与环比', () => {
    useTaskStore.getState().addTask('写周报', '', 'high', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);
    useDietStore
      .getState()
      .addRecord(todayKey(), 'lunch', [{ name: '鸡胸肉', category: 'protein', calories: 300 }]);

    renderHome();

    expect(
      screen.getByRole('img', { name: '近 30 天活动热力图：30 天里有 1 天有记录，合计 2' }),
    ).toBeInTheDocument();
    expect(screen.getByText('近 7 天 2 次，上一周 0 次')).toBeInTheDocument();
    expect(screen.getByText(/环比/, { selector: 'span' }).textContent).toContain('+100%');
  });

  it('近 7 天完成卡片带环比与迷你趋势，备忘数量挪到列表标题', () => {
    useTaskStore.getState().addTask('写周报', '', 'high', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);

    renderHome();

    const card = screen.getByText('近 7 天完成').closest('div.rounded-lg') as HTMLElement;
    expect(within(card).getByText('1')).toBeInTheDocument();
    expect(within(card).getByText('+100')).toBeInTheDocument();
    expect(within(card).getByText('较上一周')).toBeInTheDocument();
    expect(
      within(card).getByRole('img', { name: '近 14 天每日完成任务数趋势' }),
    ).toBeInTheDocument();

    expect(screen.queryByText('备忘条')).not.toBeInTheDocument();
    expect(screen.getByText('0 条 · 回车即可保存')).toBeInTheDocument();
  });
});

describe('HomePage 仪表盘', () => {
  it('按 lm:ui 里保存的顺序与条目渲染卡片', () => {
    useUiStore.setState({
      dashboard: [
        { id: 'modules', size: 'lg', hidden: false },
        { id: 'capture', size: 'md', hidden: false },
      ],
    });

    renderHome();

    const items = dashboardItems();
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('模块概览');
    expect(items[1]).toHaveTextContent('快速添加任务');
  });

  it('宽度档位映射到 12 栏栅格，窄屏单列', () => {
    useUiStore.setState({
      dashboard: [
        { id: 'todos', size: 'sm', hidden: false },
        { id: 'capture', size: 'md', hidden: false },
        { id: 'stats', size: 'lg', hidden: false },
      ],
    });

    renderHome();

    expect(dashboardList()).toHaveClass('grid-cols-1', 'lg:grid-cols-12');

    const items = dashboardItems();
    expect(items[0]).toHaveClass('lg:col-span-4');
    expect(items[1]).toHaveClass('lg:col-span-8');
    expect(items[2]).toHaveClass('lg:col-span-12');
  });

  it('「编辑布局」进入编辑态：出现拖拽手柄与宽度控件，没数据的卡片也显示出来', async () => {
    renderHome();

    const enter = screen.getByRole('button', { name: '编辑布局' });
    expect(enter).toHaveAttribute('aria-pressed', 'false');
    // 浏览态：没有活动数据就不显示热力图卡片
    expect(screen.queryByText('近 30 天活动暂无数据')).not.toBeInTheDocument();

    await userEvent.click(enter);

    const exit = screen.getByRole('button', { name: '完成编辑' });
    expect(exit).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: '拖动「快速添加任务」调整顺序' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '「今日待办」的宽度' })).toBeInTheDocument();
    // 编辑态渲染占位卡，否则用户没法把一张暂时没数据的卡片拖走或隐藏
    expect(screen.getByText('近 30 天活动暂无数据')).toBeInTheDocument();

    await userEvent.click(exit);
    expect(
      screen.queryByRole('button', { name: '拖动「快速添加任务」调整顺序' }),
    ).not.toBeInTheDocument();
  });

  it('隐藏卡片后内容消失、写进 lm:ui，还能从「已隐藏」里点回来', async () => {
    renderHome();
    expect(screen.getByRole('textbox', { name: '备忘内容' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '编辑布局' }));
    await userEvent.click(screen.getByRole('button', { name: '隐藏「快速备忘」' }));

    expect(screen.queryByRole('textbox', { name: '备忘内容' })).not.toBeInTheDocument();
    expect(useUiStore.getState().dashboard.find((widget) => widget.id === 'memos')?.hidden).toBe(
      true,
    );

    const raw = localStorage.getItem(STORAGE_KEYS.ui);
    const persisted = JSON.parse(raw ?? '{}') as {
      state?: { dashboard?: Array<{ id: string; hidden: boolean }> };
    };
    expect(persisted.state?.dashboard?.find((widget) => widget.id === 'memos')?.hidden).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: '快速备忘' }));
    expect(screen.getByRole('textbox', { name: '备忘内容' })).toBeInTheDocument();
  });

  it('改宽度会写进 lm:ui 并作用到栅格', async () => {
    renderHome();
    await userEvent.click(screen.getByRole('button', { name: '编辑布局' }));

    await userEvent.click(
      within(screen.getByRole('group', { name: '「快速添加任务」的宽度' })).getByRole('button', {
        name: '宽',
      }),
    );

    expect(useUiStore.getState().dashboard.find((widget) => widget.id === 'capture')?.size).toBe(
      'lg',
    );

    const captureItem = dashboardItems().find((item) =>
      (item.textContent ?? '').includes('快速添加任务'),
    )!;
    expect(captureItem).toHaveClass('lg:col-span-12');
  });

  it('「恢复默认布局」把顺序、宽度、隐藏一起还原', async () => {
    useUiStore.setState({
      dashboard: [
        { id: 'todos', size: 'sm', hidden: true },
        { id: 'capture', size: 'sm', hidden: false },
      ],
    });

    renderHome();
    await userEvent.click(screen.getByRole('button', { name: '编辑布局' }));
    await userEvent.click(screen.getByRole('button', { name: '恢复默认布局' }));

    expect(useUiStore.getState().dashboard).toHaveLength(DASHBOARD_WIDGET_IDS.length);

    const titles = dashboardItems().map((item) => item.textContent ?? '');
    expect(titles).toHaveLength(DASHBOARD_WIDGET_IDS.length);
    expect(titles[0]).toContain('概览统计');
    expect(titles.filter((text) => text.includes('快速备忘'))).toHaveLength(1);
  });

  it('凌晨完成的任务也算在「今天」（本地日期口径）', () => {
    const store = useTaskStore.getState();
    store.addTask('午夜提交', '', 'medium', '');
    const taskId = useTaskStore.getState().tasks[0]!.id;
    useTaskStore.getState().toggleTaskStatus(taskId);

    // 造一条「本地时间今天 00:30 完成」的记录：它的 UTC 日期在东八区是昨天
    const earlyToday = new Date();
    earlyToday.setHours(0, 30, 0, 0);
    useTaskStore.setState({
      tasks: useTaskStore
        .getState()
        .tasks.map((task) =>
          task.id === taskId ? { ...task, completedAt: earlyToday.toISOString() } : task,
        ),
    });

    renderHome();

    // 旧实现按 UTC 切日期，在东八区会把这条算成昨天：完成率 0、连续打卡 0
    expect(screen.getByText('今日完成率').closest('div')!.parentElement!).toHaveTextContent('1');
    const streakCard = screen.getByText('连续打卡').closest('div')!.parentElement!;
    expect(within(streakCard).getByText('1')).toBeInTheDocument();
  });

  it('所有卡片都被隐藏时给出恢复指引', () => {
    useUiStore.setState({
      dashboard: DEFAULT_DASHBOARD.map((widget) => ({ ...widget, hidden: true })),
    });

    renderHome();

    expect(
      screen.getByText('所有卡片都被隐藏了，点右上角「编辑布局」可以恢复。'),
    ).toBeInTheDocument();
  });
});

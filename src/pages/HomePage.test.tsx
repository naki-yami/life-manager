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
import { useHabitStore } from '../store/habitStore';
import { useBodyStore } from '../store/bodyStore';
import { useFocusStore } from '../store/focusStore';
import { useGoalStore } from '../store/goalStore';
import { useJournalStore } from '../store/journalStore';
import { ToastProvider } from '../components/ui';
import { DASHBOARD_WIDGET_IDS, DEFAULT_DASHBOARD, useUiStore } from '../store/uiStore';

import { STORAGE_KEYS } from '../utils/storageKeys';
import { formatShortDate, todayKey } from '../utils/date';

const renderHome = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/study/books" element={<div>读书页面</div>} />
          <Route path="/growth/journal" element={<div>日记页面</div>} />
        </Routes>
      </ToastProvider>
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
  useHabitStore.setState({ habits: [] });
  useBodyStore.setState({ records: [] });
  useFocusStore.setState({ sessions: [], active: null });
  useGoalStore.setState({ goals: [] });
  useJournalStore.setState({ entries: [] });
  useUiStore.setState({ dashboard: DEFAULT_DASHBOARD.map((widget) => ({ ...widget })) });
});

/**
 * 仪表盘里的卡片，按文档顺序。
 *
 * 栅格会按档位把卡片分到通栏段与左右两列，DOM 也随之分段，所以不能再靠「第一个 ul 的子节点」
 * 取卡 —— 改成按卡片身上的钩子取，文档顺序仍然等于用户排的顺序。
 */
const dashboardItems = (): HTMLElement[] => screen.getAllByTestId('dashboard-widget');

const widgetEl = (id: string): HTMLElement =>
  dashboardItems().find((item) => item.dataset.widget === id)!;

/** 卡片所在的那一列（通栏卡片所在的是它自己独占一行的段） */
const columnEl = (id: string): HTMLElement => widgetEl(id).closest('ul')!;

/**
 * 概览统计条里某一格的整格元素与数字。
 * 统计条没有标题，只能靠格内的小标签定位到格子，再取格里的数字。
 */
const statCell = (label: string): HTMLElement => {
  const cell = screen.getByText(label).closest('div');
  if (!cell) throw new Error(`没找到统计格：${label}`);
  return cell;
};

const statValue = (label: string): string =>
  statCell(label).querySelector('span.tabular')?.textContent ?? '';

describe('HomePage', () => {
  it('统计卡片反映真实数据', () => {
    const tasks = useTaskStore.getState();
    tasks.addTask('写周报', '', 'high', '');
    tasks.addTask('买牛奶', '', 'low', '');
    tasks.addTask('交房租', '', 'medium', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);

    renderHome();

    expect(statValue('待办任务')).toBe('2');
    expect(screen.getByText('已完成 1 项')).toBeInTheDocument();
  });

  it('完成率按已完成比例计算', () => {
    const store = useTaskStore.getState();
    store.addTask('A', '', 'low', todayKey());
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);

    renderHome();
    // 今日到期 1 件已完成 1 件 → 100%
    expect(statValue('今日完成率')).toBe('100');
    expect(screen.getByText('今日到期 1/1')).toBeInTheDocument();
  });

  it('没有到期任务时，今日完成率显示今天完成的数量', () => {
    const store = useTaskStore.getState();
    store.addTask('A', '', 'low', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);

    renderHome();
    expect(statValue('今日完成率')).toBe('1');
    expect(screen.getByText('今天没有到期任务')).toBeInTheDocument();
  });

  it('概览统计收成一条：四格共用一条外壳，不再各占一张带边卡的卡', () => {
    renderHome();

    const strip = screen.getByRole('group', { name: '概览统计' });
    expect(strip.children).toHaveLength(4);

    for (const label of ['待办任务', '今日完成率', '连续打卡', '近 7 天完成']) {
      expect(strip).toContainElement(statCell(label));
    }
  });

  it('页头标题直接给结论：问候语 + 还剩几件事', () => {
    useTaskStore.getState().addTask('写周报', '', 'high', '');
    useTaskStore.getState().addTask('买牛奶', '', 'low', '');

    renderHome();

    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveTextContent(/(早上好|中午好|下午好|晚上好|夜深了)，今天还剩 2 件事/);
  });

  it('一件待办都没有时标题改口，不说「还剩 0 件事」', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/今天没有要赶的事了/);
  });

  it('页头有一行 eyebrow 交代这是哪一周，星期只出现一次', () => {
    renderHome();

    expect(screen.getByText(/^第 \d+ 周 · 星期[一二三四五六日]$/)).toBeInTheDocument();
    // 星期只在 eyebrow 里出现这一次；下面那行元信息的日期不带星期，不再重复
    expect(screen.getAllByText(/星期[一二三四五六日]/)).toHaveLength(1);
    expect(screen.getByText(/^\d{4} 年 \d{1,2} 月 \d{1,2} 日$/)).toBeInTheDocument();
  });

  it('元信息一行四段：日期 / 今日完成 / 已专注 / 连续记录', () => {
    useTaskStore.getState().addTask('今天的事', '', 'low', todayKey());

    renderHome();

    expect(screen.getByText('今日完成 0/1')).toBeInTheDocument();
    expect(screen.getByText(/^已专注 \d+ 次$/)).toBeInTheDocument();
    expect(screen.getByText(/^连续记录 \d+ 天$/)).toBeInTheDocument();
  });

  it('今天没有到期任务时改说完成了多少件，不摆一个「0/0」', () => {
    renderHome();
    expect(screen.getByText(/^今日完成 \d+ 项$/)).toBeInTheDocument();
  });

  it('今天卡片自动挑出最该先做的一件，并可一键完成', async () => {
    const store = useTaskStore.getState();
    store.addTask('今天的事', '', 'low', todayKey());
    store.addTask('逾期的高优', '', 'high', '2026-09-01');
    renderHome();

    // 「先做这件」单独摆一行在最上面，下面的列表里就不该再出现一次
    const focusRow = screen.getByText('先做这件').closest('div')!;
    expect(within(focusRow).getByText('逾期的高优')).toBeInTheDocument();
    expect(screen.getAllByText('逾期的高优')).toHaveLength(1);
    expect(screen.getByText(/已逾期 \d+ 天/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '一键完成' }));
    expect(useTaskStore.getState().tasks.find((task) => task.title === '逾期的高优')!.status).toBe(
      'completed',
    );
  });

  it('今天卡每行右侧各自交代时间：今天到期 / 已逾期 / 无截止', () => {
    const store = useTaskStore.getState();
    store.addTask('今天到期的事', '', 'low', todayKey());
    store.addTask('拖了很久的事', '', 'medium', '2026-09-01');
    store.addTask('没截止的事', '', 'low', '');

    renderHome();

    // 逾期那件被挑成「先做这件」，其余两件排在下面的列表里
    expect(screen.getByText(/已逾期 \d+ 天/)).toBeInTheDocument();
    expect(screen.getByText('今天到期')).toBeInTheDocument();
    expect(screen.getByText('无截止')).toBeInTheDocument();
  });

  it('排了时间盒的那一行摆出「今天 HH:mm · 已排」，优先于截止日期', () => {
    useTaskStore.getState().addTask('整理复盘', '', 'low', '');
    const id = useTaskStore.getState().tasks[0]!.id;
    useTaskStore.getState().setTimebox(id, { date: todayKey(), start: '09:00', minutes: 30 });

    renderHome();

    expect(screen.getByText('今天 09:00 · 已排')).toBeInTheDocument();
  });

  it('快速加任务那一行挂着一个 Enter 提示', () => {
    renderHome();

    const card = widgetEl('today');
    expect(within(card).getByText('Enter')).toBeInTheDocument();
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

    expect(statValue('连续打卡')).toBe('1');
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
    useTaskStore.getState().addTask('买牛奶', '', 'low', '');
    renderHome();

    // 最该先做的那件单独摆在「先做这件」那一行，列表里只剩另一件
    await userEvent.click(screen.getByRole('checkbox', { name: '买牛奶' }));

    const tasks = useTaskStore.getState().tasks;
    expect(tasks.find((task) => task.title === '买牛奶')!.status).toBe('completed');
  });

  it('待办为空时给出空态', () => {
    renderHome();
    expect(screen.getByText(/待办清空了/)).toBeInTheDocument();
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

  it('备忘卡是列表在前、输入框在后，输入框尾巴上挂一个 Enter 提示', () => {
    useTaskStore.getState().addMemo('明天问一下体检要不要空腹');

    renderHome();

    const card = widgetEl('memos');
    const list = within(card).getByRole('list');
    const input = within(card).getByRole('textbox', { name: '备忘内容' });

    // 样稿里输入框在列表下面，不在上面
    expect(list.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(card).getByText('Enter')).toBeInTheDocument();
  });

  it('空内容提示出现时把 Enter 胶囊收起来，免得它压在红字上', async () => {
    renderHome();

    const card = widgetEl('memos');
    expect(within(card).getByText('Enter')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '保存备忘' }));

    expect(screen.getByText('先写点什么再保存')).toBeInTheDocument();
    expect(within(card).queryByText('Enter')).not.toBeInTheDocument();
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

  it('模块概览标题下面写清楚点一下能跳', () => {
    renderHome();

    expect(screen.getByText('点一下进对应模块')).toBeInTheDocument();
  });
  it('没有活动数据时卡片照样在，热力图位置写「这 30 天还没有记录」', () => {
    renderHome();

    // 样稿里这张卡是常驻的；以前没数据就整张消失，首页看着像少了一块
    expect(screen.getByRole('heading', { name: '近 30 天活动' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '近 30 天活动热力图（这 30 天还没有记录）' }),
    ).toBeInTheDocument();
    // 四个 KPI 照常摆出来，都是 0
    expect(screen.getByText('30 天合计')).toBeInTheDocument();
    expect(screen.getByText('最长连续')).toBeInTheDocument();
    expect(screen.getByText('有记录的天数')).toBeInTheDocument();
  });

  it('有活动时展示近 30 天热力图与连续天数', () => {
    useTaskStore.getState().addTask('写周报', '', 'high', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);
    useDietStore
      .getState()
      .addRecord(todayKey(), 'lunch', [{ name: '鸡胸肉', category: 'protein', calories: 300 }]);

    renderHome();

    expect(
      screen.getByRole('img', {
        name: `近 30 天活动热力图：30 天里有 1 天有记录，合计 2，最多的一天 2（${formatShortDate(todayKey())}）`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('完成任务 / 训练 / 饮食 / 写日记都算一次')).toBeInTheDocument();
    // 今天有活动、昨天没有 → 连续 1 天
    expect(screen.getByText('连续 1 天')).toBeInTheDocument();
  });

  it('热力图卡右侧补上合计 / 近 7 天 / 最长连续 / 有记录的天数', () => {
    useTaskStore.getState().addTask('写周报', '', 'high', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);
    useDietStore
      .getState()
      .addRecord(todayKey(), 'lunch', [{ name: '鸡胸肉', category: 'protein', calories: 300 }]);

    renderHome();

    const metric = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

    expect(metric('30 天合计')).toBe('2 次');
    expect(metric('近 7 天')).toBe('2 次');
    expect(metric('最长连续')).toBe('1 天');
    expect(metric('有记录的天数')).toBe('1 / 30');
  });

  it('写一篇日记也算一天的活动，热力图跟着亮起来', () => {
    useJournalStore.getState().saveEntry(todayKey(), { mood: 4, tags: [], text: '今天过得不错' });

    renderHome();

    expect(
      screen.getByRole('img', {
        name: `近 30 天活动热力图：30 天里有 1 天有记录，合计 1，最多的一天 1（${formatShortDate(todayKey())}）`,
      }),
    ).toBeInTheDocument();
  });

  it('今日心情卡读今天那一条，把对应那一档点亮，并带上连续记录天数', () => {
    useJournalStore.getState().saveEntry(todayKey(), { mood: 4, tags: [], text: '今天过得不错' });

    renderHome();

    expect(screen.getByText('今天已记')).toBeInTheDocument();
    // 4 档是「不错」，只有它被点亮
    expect(screen.getByRole('button', { name: '记今天的心情：不错' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: '记今天的心情：很好' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByText('今天过得不错')).toBeInTheDocument();
    expect(screen.getByText(/已连续记录 1 天/)).toBeInTheDocument();
  });

  it('今日心情卡摆出五个情绪档，点表情直接记下今天的心情并可撤销', async () => {
    renderHome();

    for (const label of ['很糟', '不佳', '一般', '不错', '很好']) {
      expect(screen.getByRole('button', { name: `记今天的心情：${label}` })).toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole('button', { name: '记今天的心情：很好' }));

    // 不跳页：直接写库，今天的日记有了 mood=5
    const saved = useJournalStore.getState().entries.find((entry) => entry.date === todayKey());
    expect(saved?.mood).toBe(5);
    expect(screen.getByText('今天已记')).toBeInTheDocument();
    expect(screen.getByText(/已记下今天的心情：很好/)).toBeInTheDocument();

    // 撤销：当天记录被移除，回到「今天还没写」
    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(
      useJournalStore.getState().entries.find((entry) => entry.date === todayKey()),
    ).toBeUndefined();
    expect(screen.getByText('今天还没写')).toBeInTheDocument();
  });

  it('已有心情时点另一档是修改并保留原文，撤销回到旧值', async () => {
    useJournalStore.getState().saveEntry(todayKey(), { mood: 3, tags: [], text: '平平无奇' });
    renderHome();

    await userEvent.click(screen.getByRole('button', { name: '记今天的心情：很好' }));

    const saved = useJournalStore.getState().entries.find((entry) => entry.date === todayKey());
    expect(saved?.mood).toBe(5);
    expect(saved?.text).toBe('平平无奇');

    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    const restored = useJournalStore.getState().entries.find((entry) => entry.date === todayKey());
    expect(restored?.mood).toBe(3);
    expect(restored?.text).toBe('平平无奇');
  });

  it('今天还没写时，今日心情卡给一句引导而不是空白', () => {
    renderHome();

    expect(screen.getByText('今天还没写')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '写今天的日记' })).toBeInTheDocument();
    expect(screen.getByText(/已连续记录 0 天/)).toBeInTheDocument();
  });

  it('近 7 天完成卡片带环比，备忘数量挪到列表标题', () => {
    useTaskStore.getState().addTask('写周报', '', 'high', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);

    renderHome();

    const card = statCell('近 7 天完成');
    expect(statValue('近 7 天完成')).toBe('1');
    expect(within(card).getByText('+100%')).toBeInTheDocument();
    expect(within(card).getByText('较上一周')).toBeInTheDocument();
    // 概览统计条里的迷你折线已经撤掉 —— 那是当初自己加的，样稿第 4 格没有
    expect(within(card).queryByRole('img')).not.toBeInTheDocument();

    expect(screen.queryByText('备忘条')).not.toBeInTheDocument();
    expect(screen.getByText('0 条 · 回车即可保存')).toBeInTheDocument();
  });
});

describe('HomePage 仪表盘', () => {
  it('按 lm:ui 里保存的顺序与条目渲染卡片', () => {
    useUiStore.setState({
      dashboard: [
        { id: 'modules', size: 'lg', hidden: false },
        { id: 'memos', size: 'sm', hidden: false },
      ],
    });

    renderHome();

    const items = dashboardItems();
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('模块概览');
    expect(items[1]).toHaveTextContent('快速备忘');
  });

  it('档位决定卡片进哪一列：小档进辅列、中档进主列、宽档通栏', () => {
    useUiStore.setState({
      dashboard: [
        { id: 'memos', size: 'sm', hidden: false },
        { id: 'today', size: 'md', hidden: false },
        { id: 'stats', size: 'lg', hidden: false },
      ],
    });

    renderHome();

    // 分栏容器：窄屏一列，宽屏按样稿的 1.62fr : 1fr 分宽
    expect(columnEl('today').parentElement).toHaveClass(
      'grid-cols-1',
      'lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]',
    );
    expect(columnEl('today').parentElement).toBe(columnEl('memos').parentElement);

    // 列自己只负责纵向堆叠，宽度交给父节点的模板
    expect(columnEl('memos')).toHaveClass('flex', 'flex-col');
    expect(columnEl('today')).toHaveClass('flex', 'flex-col');
    // 宽档不参与分栏，自己独占一段
    expect(columnEl('stats')).toHaveClass('grid-cols-1');
    expect(columnEl('stats')).not.toHaveClass('flex-col');
  });

  it('同一列里卡片的顺序就是用户排的顺序', () => {
    useUiStore.setState({
      dashboard: [
        { id: 'today', size: 'md', hidden: false },
        { id: 'memos', size: 'md', hidden: false },
      ],
    });

    renderHome();

    expect(
      within(columnEl('today'))
        .getAllByTestId('dashboard-widget')
        .map((item) => item.dataset.widget),
    ).toEqual(['today', 'memos']);
  });

  it('「编辑布局」进入编辑态：出现拖拽手柄与宽度控件，没数据的卡片也显示出来', async () => {
    renderHome();

    const enter = screen.getByRole('button', { name: '编辑布局' });
    expect(enter).toHaveAttribute('aria-pressed', 'false');
    // 浏览态：一个习惯都没有，这张卡不占位
    // （「近 30 天活动」「目标达成」现在是常驻卡，不能再拿它们当「没数据」的例子）
    expect(screen.queryByText('今日习惯暂无数据')).not.toBeInTheDocument();

    await userEvent.click(enter);

    const exit = screen.getByRole('button', { name: '完成编辑' });
    expect(exit).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '拖动「今天」调整顺序' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '「今天」的宽度' })).toBeInTheDocument();
    // 编辑态渲染占位卡，否则用户没法把一张暂时没数据的卡片拖走或隐藏
    expect(screen.getByText('今日习惯暂无数据')).toBeInTheDocument();

    await userEvent.click(exit);
    expect(screen.queryByRole('button', { name: '拖动「今天」调整顺序' })).not.toBeInTheDocument();
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
      within(screen.getByRole('group', { name: '「今天」的宽度' })).getByRole('button', {
        name: '宽',
      }),
    );

    expect(useUiStore.getState().dashboard.find((widget) => widget.id === 'today')?.size).toBe(
      'lg',
    );

    // 改成宽档之后它不再跟别人并排，而是自己独占一行
    expect(columnEl('today')).toHaveClass('grid-cols-1');
    expect(columnEl('today')).not.toHaveClass('flex-col');
  });

  it('「恢复默认布局」把顺序、宽度、隐藏一起还原', async () => {
    useUiStore.setState({
      dashboard: [
        { id: 'today', size: 'sm', hidden: true },
        { id: 'goals', size: 'sm', hidden: false },
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
    expect(statValue('今日完成率')).toBe('1');
    expect(statValue('连续打卡')).toBe('1');
  });

  it('今日习惯卡片列出没打卡的习惯，点一下即可完成', async () => {
    useHabitStore.getState().addHabit({ name: '晨跑' });
    useHabitStore.getState().addHabit({ name: '读书' });
    useHabitStore.getState().toggleHabitLog(useHabitStore.getState().habits[0]!.id, todayKey());

    renderHome();

    expect(screen.getByText('今日习惯')).toBeInTheDocument();
    expect(screen.getByText('还有 1 个没打卡 · 点一下即可')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: '读书' }));

    expect(useHabitStore.getState().habits[1]!.logs[todayKey()]).toBe(1);
    expect(screen.getByText('今天该打卡的都完成了')).toBeInTheDocument();
  });

  it('没有习惯时首页不渲染这张卡片', () => {
    renderHome();

    expect(screen.queryByText('今日习惯')).not.toBeInTheDocument();
    expect(screen.queryByText('今日习惯暂无数据')).not.toBeInTheDocument();
  });

  it('身体指标卡片显示最近体重、较上次与趋势', () => {
    useBodyStore.getState().saveRecord({ date: '2026-09-20', weight: 71, bodyFat: 18.5 });
    useBodyStore.getState().saveRecord({ date: '2026-09-27', weight: 70.4 });

    renderHome();

    expect(screen.getByText('身体指标')).toBeInTheDocument();
    expect(screen.getByText('较上次 -0.6 kg · 上次 71 kg')).toBeInTheDocument();
    expect(screen.getByText('70.4')).toBeInTheDocument();
    expect(screen.getByText('体脂 18.5% · 2026-09-27')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '最近体重趋势' })).toBeInTheDocument();
  });

  it('没有体重记录时首页不渲染身体指标卡片', () => {
    useBodyStore.getState().saveRecord({ date: '2026-09-27', measurements: { waist: 80 } });

    renderHome();

    expect(screen.queryByText('身体指标')).not.toBeInTheDocument();
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

describe('HomePage 目标达成卡片', () => {
  it('没有目标时卡片照样在，给一句引导而不是消失', () => {
    renderHome();

    expect(screen.getByRole('heading', { name: '目标达成' })).toBeInTheDocument();
    expect(screen.getByText('还没有目标')).toBeInTheDocument();
    expect(screen.getByText(/给「读书」「训练」这类指标定个数/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '管理目标' })).toBeInTheDocument();
  });

  it('有目标时显示进度，数字来自各模块记录', () => {
    useGoalStore.setState({
      goals: [
        {
          id: 'g1',
          metric: 'fitness.sessions',
          period: 'week',
          target: 4,
          createdAt: '2026-09-01T12:00:00',
        },
      ],
    });
    useFitnessStore
      .getState()
      .addRecord('推日', todayKey(), [{ name: '杠铃卧推', sets: 5, reps: 5, weight: 60 }], '');

    renderHome();

    expect(screen.getByRole('heading', { name: '目标达成' })).toBeInTheDocument();
    expect(screen.getByText('训练次数')).toBeInTheDocument();
    // 首页卡片带周期前缀（「每周 · 1 次 / 4 次」），用正则匹配数值部分
    expect(screen.getByText(/1 次 \/ 4 次/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '管理目标' })).toBeInTheDocument();
  });

  /**
   * 样稿的两列构成，逐张卡钉死：
   *
   * 左：今天 / 近 30 天活动 / 模块概览 —— 三张卡同宽，边界对齐；
   * 右：专注 / 快速备忘 / 今日心情 / 目标达成。
   *
   * 「目标达成」是最容易被放错的一张：它进主列的话，右边那列排到「今日心情」
   * 就断了，左下空出一大块 —— 那正是上一版的观感。
   */
  it('默认排布按样稿分两列：活动与模块跟「今天」同列，目标跟「备忘 / 心情」同列', () => {
    useGoalStore.setState({
      goals: [
        {
          id: 'g1',
          metric: 'fitness.sessions',
          period: 'week',
          target: 4,
          createdAt: '2026-09-01T12:00:00',
        },
      ],
    });
    useFitnessStore
      .getState()
      .addRecord('推日', todayKey(), [{ name: '杠铃卧推', sets: 5, reps: 5, weight: 60 }], '');
    useTaskStore.getState().addTask('写周报', '', 'high', todayKey());
    useTaskStore.getState().addMemo('临时想法');

    renderHome();

    // 左列：活动与模块跟「今天」同宽同列
    expect(columnEl('activity')).toBe(columnEl('today'));
    expect(columnEl('modules')).toBe(columnEl('today'));
    // 右列：目标排在「快速备忘 / 今日心情」下面
    expect(columnEl('goals')).toBe(columnEl('memos'));
    expect(columnEl('goals')).toBe(columnEl('journal'));
    expect(columnEl('goals')).not.toBe(columnEl('today'));
  });
});

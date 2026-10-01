import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
import { useGoalStore } from '../store/goalStore';
import { useJournalStore } from '../store/journalStore';
import { addDays, todayKey } from '../utils/date';

const renderStats = () =>
  render(
    <MemoryRouter initialEntries={['/insight/stats']}>
      <Routes>
        <Route path="/insight/stats" element={<StatsPage />} />
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
  useBookStore.setState({ books: [], sessions: [] });
  useDevStore.setState({ projects: [], sessions: [] });
  useWritingStore.setState({ projects: [] });
  useFitnessStore.setState({ plans: [], records: [] });
  useDietStore.setState({ records: [] });
  useGameStore.setState({ games: [], sessions: [] });
  useGoalStore.setState({ goals: [] });
  useJournalStore.setState({ entries: [] });
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

    expect(cardFor('最近 30 天完成任务').getByText('1')).toBeInTheDocument();
    expect(cardFor('最近 30 天训练').getByText('2')).toBeInTheDocument();
    expect(cardFor('最近 30 天训练').getByText('分布在 2 天里')).toBeInTheDocument();
    // 今天有任务与训练、昨天有训练，所以连续记录是 2 天
    expect(cardFor('连续记录').getByText('2')).toBeInTheDocument();
    expect(screen.getByText('最近 30 天活动 3 次')).toBeInTheDocument();
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
      screen.getByRole('img', { name: /最近 30 天任务完成数（按天）：合计 1 个/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '最近 30 天每日完成任务数趋势' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /最近 30 天活动构成：合计 1 次/ })).toBeInTheDocument();
  });

  it('写日记也算一天的活动：热力图与活动构成都跟着涨，与首页同口径', () => {
    useJournalStore.getState().saveEntry(todayKey(), { mood: 3, tags: [], text: '写了几笔' });

    renderStats();

    expect(
      screen.getByRole('img', { name: '最近 30 天活动热力图：30 天里有 1 天有记录，合计 1' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /最近 30 天活动构成：合计 1 次/ })).toBeInTheDocument();
    expect(screen.getByText('连续记录 1 天')).toBeInTheDocument();
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

  it('各模块数据分布与流水趋势图表', async () => {
    useTaskStore.getState().addTask('写周报', '', 'high', '');
    useDevStore.getState().addProject('写作助手', '');
    useDevStore.getState().addSession(useDevStore.getState().projects[0]!.id, todayKey(), 2, '');

    renderStats();

    expect(screen.getByText('各模块数据分布')).toBeInTheDocument();
    // 今日计划 1 条、开发项目 1 条，都在分布里
    expect(screen.getByText('今日计划')).toBeInTheDocument();
    expect(screen.getByText('开发项目')).toBeInTheDocument();

    // 每模块分析里出现开发那一格，指标是投入工时
    expect(cardFor('开发 · 投入工时').getByText('2')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /最近 30 天开发 · 投入工时/ })).toBeInTheDocument();
  });

  it('有目标时单列一张达成卡片，进度与首页同源', () => {
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
    useFitnessStore.getState().addRecord('推日', todayKey(), workout, '');

    renderStats();

    expect(screen.getByText('目标达成')).toBeInTheDocument();
    expect(screen.getByText('训练次数')).toBeInTheDocument();
    // 统计页同样带周期前缀（「每周 · 1 次 / 4 次」）
    expect(screen.getByText(/1 次 \/ 4 次/)).toBeInTheDocument();
    expect(screen.getByText('0/1 个已达成', { exact: false })).toBeInTheDocument();
  });

  it('切换时间范围后标题、徽标与柱子数量同步变化', async () => {
    const tasks = useTaskStore.getState();
    tasks.addTask('写周报', '', 'high', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);

    renderStats();

    // 默认 30 天：一天一根柱子
    expect(screen.getByRole('img', { name: /任务完成数（按天）/ }).children).toHaveLength(30);

    await userEvent.click(screen.getByRole('button', { name: '7 天' }));

    expect(screen.getByText('最近 7 天的活动趋势与各模块进度')).toBeInTheDocument();
    expect(screen.getByText('最近 7 天活动 1 次')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /任务完成数（按天）/ }).children).toHaveLength(7);
    expect(
      screen.getByRole('img', { name: /最近 7 天活动热力图：7 天里有 1 天有记录/ }),
    ).toBeInTheDocument();

    // 90 天太长，改成一周一根柱子
    await userEvent.click(screen.getByRole('button', { name: '90 天' }));

    expect(screen.getByText('最近 90 天的活动趋势与各模块进度')).toBeInTheDocument();
    const weekly = screen.getByRole('img', { name: /任务完成数（按周）/ });
    expect(weekly.children.length).toBeGreaterThan(5);
    expect(weekly.children.length).toBeLessThan(20);
  });

  it('「全部」从最早一条记录算起，并封顶 365 天、按月聚合', async () => {
    const projectId = useDevStore.getState().addProject('老项目', '');
    useDevStore.getState().addSession(projectId, addDays(todayKey(), -400), 1, '');

    renderStats();

    await userEvent.click(screen.getByRole('button', { name: '全部' }));

    // 最早记录在 400 天前，但区间上限是 365 天
    expect(screen.getByText('全部 365 天的活动趋势与各模块进度')).toBeInTheDocument();
    const monthly = screen.getByRole('img', { name: /任务完成数（按月）/ });
    expect(monthly.children.length).toBeGreaterThanOrEqual(12);
    expect(monthly.children.length).toBeLessThanOrEqual(13);
  });

  it('活动构成把任务、训练与饮食分色堆叠', () => {
    const tasks = useTaskStore.getState();
    tasks.addTask('写周报', '', 'high', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);
    useFitnessStore.getState().addRecord('推日', todayKey(), workout, '');
    useDietStore.getState().addRecord(todayKey(), 'lunch', meal);

    renderStats();

    const card = screen.getByText('活动构成').closest('div.rounded-lg');
    if (!card) throw new Error('找不到活动构成卡片');
    for (const name of ['任务', '训练', '饮食']) {
      expect(within(card as HTMLElement).getByText(name)).toBeInTheDocument();
    }
    expect(
      screen.getByRole('img', { name: '最近 30 天活动构成：合计 3 次，最高一天 3 次' }),
    ).toBeInTheDocument();
  });

  it('自定义区间：能挪到历史某一段，标签与统计都跟着区间走', async () => {
    const tasks = useTaskStore.getState();
    tasks.addTask('今天完成', '', 'medium', '');
    tasks.addTask('四十天前完成', '', 'medium', '');
    tasks.addTask('五十天前完成', '', 'medium', '');
    const [fresh, forty, fifty] = useTaskStore.getState().tasks;
    for (const task of [fresh, forty, fifty]) {
      useTaskStore.getState().toggleTaskStatus(task!.id);
    }
    useTaskStore.setState({
      tasks: useTaskStore
        .getState()
        .tasks.map((task) =>
          task.id === forty!.id
            ? { ...task, completedAt: `${addDays(todayKey(), -40)}T09:00:00.000Z` }
            : task.id === fifty!.id
              ? { ...task, completedAt: `${addDays(todayKey(), -50)}T09:00:00.000Z` }
              : task,
        ),
    });

    renderStats();
    // 默认 30 天窗口只盖住今天那条
    expect(cardFor('最近 30 天完成任务').getByText('1')).toBeInTheDocument();

    // 切「自定义」：默认仍是最近 30 天，结论不变，两个日期框出现
    await userEvent.click(screen.getByRole('button', { name: '自定义' }));
    expect(screen.getByLabelText('自定义起始日期')).toBeInTheDocument();
    expect(screen.getByLabelText('自定义结束日期')).toBeInTheDocument();
    expect(cardFor('所选 30 天完成任务').getByText('1')).toBeInTheDocument();

    // 把窗口挪到 60 天前 ~ 30 天前：盖住那两条 40 / 50 天前的任务，共 31 天
    fireEvent.change(screen.getByLabelText('自定义起始日期'), {
      target: { value: addDays(todayKey(), -60) },
    });
    fireEvent.change(screen.getByLabelText('自定义结束日期'), {
      target: { value: addDays(todayKey(), -30) },
    });

    expect(cardFor('所选 31 天完成任务').getByText('2')).toBeInTheDocument();
    expect(screen.getByText('所选 31 天活动 2 次')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /所选 31 天活动热力图：31 天里有 2 天有记录/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /任务完成数（按天）/ }).children).toHaveLength(31);
  });

  it('自定义区间起止填反了，按更早的那端当起点，不出负数天数', async () => {
    const tasks = useTaskStore.getState();
    tasks.addTask('四十天前完成', '', 'medium', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);
    useTaskStore.setState({
      tasks: useTaskStore.getState().tasks.map((task) => ({
        ...task,
        completedAt: `${addDays(todayKey(), -40)}T09:00:00.000Z`,
      })),
    });

    renderStats();
    await userEvent.click(screen.getByRole('button', { name: '自定义' }));

    // 起点填 30 天前、终点填 60 天前（反了）
    fireEvent.change(screen.getByLabelText('自定义起始日期'), {
      target: { value: addDays(todayKey(), -30) },
    });
    fireEvent.change(screen.getByLabelText('自定义结束日期'), {
      target: { value: addDays(todayKey(), -60) },
    });

    // 取数时统一成「谁早谁当起点」：还是 31 天，并盖住那条 40 天前的任务
    expect(screen.getByText('所选 31 天活动 1 次')).toBeInTheDocument();
    expect(cardFor('所选 31 天完成任务').getByText('1')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('「近 7 天日均热量」始终按真实的最近 7 天算，不跟着自定义区间漂', async () => {
    useDietStore.getState().addRecord(todayKey(), 'lunch', meal);
    useDietStore
      .getState()
      .addRecord(addDays(todayKey(), -40), 'lunch', [
        { name: '鸡胸肉', category: 'protein', calories: 300 },
      ]);

    renderStats();
    expect(cardFor('近 7 天日均热量').getByText('600')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '自定义' }));
    fireEvent.change(screen.getByLabelText('自定义起始日期'), {
      target: { value: addDays(todayKey(), -60) },
    });
    fireEvent.change(screen.getByLabelText('自定义结束日期'), {
      target: { value: addDays(todayKey(), -30) },
    });

    // 区间挪到 40 天前那一带，这一格仍是「今天的最近 7 天」：600 而不是 300
    expect(cardFor('近 7 天日均热量').getByText('600')).toBeInTheDocument();
    expect(cardFor('近 7 天日均热量').getByText('按 1 天有记录的天数计算')).toBeInTheDocument();
  });

  it('每模块分析：各模块看自己的那个指标，并跟着区间一起变', async () => {
    useBookStore.getState().addReadingSession('b1', todayKey(), 45, '');
    useBookStore.getState().addReadingSession('b1', addDays(todayKey(), -20), 30, '');
    useDevStore.getState().addProject('写作助手', '');
    useDevStore.getState().addSession(useDevStore.getState().projects[0]!.id, todayKey(), 2, '');
    useFitnessStore.getState().addRecord('推日', todayKey(), workout, '');
    useDietStore
      .getState()
      .addRecord(todayKey(), 'lunch', [
        { name: '鸡胸肉', category: 'protein', calories: 600, protein: 30 },
      ]);

    renderStats();

    expect(cardFor('读书 · 阅读时长').getByText('75')).toBeInTheDocument();
    expect(cardFor('读书 · 阅读时长').getByText('有记录 2 天 · 单日最高 45')).toBeInTheDocument();
    // 健身看的是容量（组数 × 次数 × 重量），不是「练了几次」：3 × 10 × 60
    expect(cardFor('健身 · 训练容量').getByText('1,800')).toBeInTheDocument();
    // 饮食这一格看蛋白质，和上面的热量趋势是两回事
    expect(cardFor('饮食 · 蛋白质').getByText('30')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /最近 30 天读书 · 阅读时长/ })).toBeInTheDocument();

    // 切到 7 天，20 天前那 30 分钟被挡在区间外
    await userEvent.click(screen.getByRole('button', { name: '7 天' }));
    expect(cardFor('读书 · 阅读时长').getByText('45')).toBeInTheDocument();
    expect(cardFor('读书 · 阅读时长').getByText('有记录 1 天 · 单日最高 45')).toBeInTheDocument();
  });

  it('每模块分析：写作那一格按保存快照推算当天写下的字数', () => {
    useWritingStore.getState().addProject('长文', 'article');
    const projectId = useWritingStore.getState().projects[0]!.id;
    useWritingStore.getState().updateContent(projectId, 'x'.repeat(100));
    useWritingStore.getState().updateContent(projectId, 'x'.repeat(300));

    renderStats();

    expect(cardFor('写作 · 写下字数').getByText('300')).toBeInTheDocument();
    expect(screen.getByText(/按保存快照推算/)).toBeInTheDocument();
  });

  it('长区间下图与描述一起切到按周聚合，读屏说的是「单周最高」', async () => {
    useBookStore.getState().addBook('置身事内', '兰小欢', '经济');
    const bookId = useBookStore.getState().books[0]!.id;
    useBookStore.getState().addReadingSession(bookId, todayKey(), 45, '');
    useBookStore.getState().addReadingSession(bookId, addDays(todayKey(), -40), 30, '');

    renderStats();
    await userEvent.click(screen.getByRole('button', { name: '90 天' }));

    expect(
      screen.getByRole('img', {
        name: '最近 90 天读书 · 阅读时长：合计 75 分钟，单周最高 45 分钟',
      }),
    ).toBeInTheDocument();
    // 每个模块卡的副标题都会写明聚合粒度，所以是多处命中
    expect(screen.getAllByText(/最近 90 天，按周汇总/).length).toBeGreaterThan(0);
  });

  it('每模块分析：没有流水的模块不出现，只有任务时整块都不出现', () => {
    useTaskStore.getState().addTask('写周报', '', 'high', '');

    renderStats();

    expect(screen.queryByText('读书 · 阅读时长')).not.toBeInTheDocument();
    expect(screen.queryByText('健身 · 训练容量')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /写下字数/ })).not.toBeInTheDocument();
  });

  it('每张图表卡都有导出 PNG 的按钮，按钮自己会被排除在图外', () => {
    useBookStore.getState().addBook('置身事内', '兰小欢', '经济');
    useBookStore
      .getState()
      .addReadingSession(useBookStore.getState().books[0]!.id, todayKey(), 45, '');
    useFitnessStore.getState().addRecord('推日', todayKey(), workout, '');
    useDietStore
      .getState()
      .addRecord(todayKey(), 'lunch', [
        { name: '鸡胸肉', category: 'protein', calories: 600, protein: 30 },
      ]);
    useTaskStore.getState().addTask('写周报', '', 'high', '');

    renderStats();

    // 四张整页图卡 + 每模块分析各一张，至少六个别漏
    const buttons = screen.getAllByRole('button', { name: /^导出「.+」为 PNG$/ });
    expect(buttons.length).toBeGreaterThanOrEqual(6);
    expect(buttons.every((button) => button.hasAttribute('data-export-skip'))).toBe(true);
    expect(screen.getByRole('button', { name: '导出「活动热力图」为 PNG' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '导出「读书 · 阅读时长」为 PNG' }),
    ).toBeInTheDocument();
  });
});

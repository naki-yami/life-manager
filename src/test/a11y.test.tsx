import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeAccessibleName } from 'dom-accessibility-api';
import { MODULE_TABS, NAV_ITEMS, ModuleHost } from '../components/layout';
import { ToastProvider } from '../components/ui';
import { BooksPage } from '../pages/BooksPage';
import { DevPage } from '../pages/DevPage';
import { DietPage } from '../pages/DietPage';
import { FitnessPage } from '../pages/FitnessPage';
import { GamesPage } from '../pages/GamesPage';
import { GoalsPage } from '../pages/GoalsPage';
import { HabitsPage } from '../pages/HabitsPage';
import { JournalPage } from '../pages/JournalPage';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ReviewPage } from '../pages/ReviewPage';
import { SettingsPage } from '../pages/SettingsPage';
import { StatsPage } from '../pages/StatsPage';
import { TasksPage } from '../pages/TasksPage';
import { UiPage } from '../pages/UiPage';
import { WritingPage } from '../pages/WritingPage';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useDietStore } from '../store/dietStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useGameStore } from '../store/gameStore';
import { useGoalStore } from '../store/goalStore';
import { useTaskStore } from '../store/taskStore';
import { useWritingStore } from '../store/writingStore';
import { todayKey } from '../utils/date';

/**
 * 无障碍基线检查。
 *
 * 逐页渲染后统一断言：可交互元素都有可访问名称、标题层级唯一、
 * 没有重复 id、没有正的 tabindex。这类问题肉眼很难发现，
 * 所以用一条遍历式用例兜住，后面加页面时也会自动被检查到。
 */

const NAME_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="img"]',
  '[role="progressbar"]',
  '[role="switch"]',
].join(',');

function describeElement(element: Element): string {
  const className = typeof element.className === 'string' ? element.className.split(' ')[0] : '';
  const text = (element.textContent ?? '').trim().slice(0, 24);
  return `<${element.tagName.toLowerCase()}${className ? ` class="${className}"` : ''}>${text}`;
}

/** 需要可访问名称却拿不到的那批元素 */
function elementsWithoutName(): string[] {
  return Array.from(document.querySelectorAll(NAME_SELECTOR))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true')
    .filter((element) => element.getAttribute('type') !== 'hidden')
    .filter((element) => computeAccessibleName(element).trim() === '')
    .map(describeElement);
}

function duplicatedIds(): string[] {
  const counts = new Map<string, number>();
  document.querySelectorAll('[id]').forEach((element) => {
    counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
  });
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => `${id} ×${count}`);
}

function positiveTabIndexes(): string[] {
  return Array.from(document.querySelectorAll('[tabindex]'))
    .filter((element) => Number(element.getAttribute('tabindex')) > 0)
    .map(describeElement);
}

/** 每页都放一点数据，避免只检查到空态 */
beforeEach(() => {
  const today = todayKey();

  useTaskStore.setState({ tasks: [], memos: [] });
  useTaskStore.getState().addTask('写周报', '整理本周进展', 'high', today);
  useTaskStore.getState().addMemo('买咖啡豆');

  useBookStore.setState({ books: [] });
  useBookStore.getState().addBook('人类简史', '尤瓦尔·赫拉利', '历史');

  useDevStore.setState({ projects: [], sessions: [] });
  useDevStore.getState().addProject('Life Manager', '个人应用');
  useDevStore.getState().addSession(useDevStore.getState().projects[0]!.id, today, 2, '重构存储层');

  useWritingStore.setState({ projects: [] });
  useWritingStore.getState().addProject('随笔集', 'article');

  useFitnessStore.setState({ plans: [], records: [] });
  useFitnessStore.getState().addPlan('推日', '胸肩三头');
  useFitnessStore
    .getState()
    .addRecord('推日', today, [{ name: '杠铃卧推', sets: 5, reps: 5, weight: 60 }], '状态不错');

  useDietStore.setState({ records: [] });
  useDietStore
    .getState()
    .addRecord(today, 'lunch', [{ name: '牛肉面', category: '主食', calories: 620 }]);

  useGameStore.setState({ games: [], sessions: [] });
  useGameStore.getState().addGame('哈迪斯', 'PC');
  const gameId = useGameStore.getState().games[0]!.id;
  useGameStore.getState().addSession(gameId, today, 2, '');
  useGameStore.getState().addAchievement(gameId, '逃出冥界', '击败冥王');

  useGoalStore.setState({ goals: [] });
  useGoalStore.getState().addGoal({ metric: 'fitness.sessions', period: 'week', target: 4 });
  useGoalStore.getState().addGoal({ metric: 'reading.minutes', period: 'month', target: 600 });
});

const PAGES: Array<{ label: string; element: React.ReactElement }> = [
  { label: '首页', element: <HomePage /> },
  { label: '今日计划', element: <TasksPage /> },
  { label: '读书', element: <BooksPage /> },
  { label: '开发工作', element: <DevPage /> },
  { label: '写作', element: <WritingPage /> },
  { label: '健身', element: <FitnessPage /> },
  { label: '饮食', element: <DietPage /> },
  { label: '游戏', element: <GamesPage /> },
  { label: '统计', element: <StatsPage /> },
  { label: '复盘', element: <ReviewPage /> },
  { label: '目标', element: <GoalsPage /> },
  { label: '数据与设置', element: <SettingsPage /> },
  { label: '组件预览', element: <UiPage /> },
  { label: '404', element: <NotFoundPage /> },
];

/** 设置页与组件预览页会直接用到 useToast，外壳统一包一层 Provider */
const renderPage = (element: React.ReactElement): void => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <ToastProvider>{element}</ToastProvider>
    </MemoryRouter>,
  );
};

describe('无障碍基线', () => {
  it.each(PAGES)('$label：可交互元素都有可访问名称', ({ element }) => {
    renderPage(element);
    expect(elementsWithoutName()).toEqual([]);
  });

  it.each(PAGES)('$label：只有一个 h1，且没有重复 id 或正的 tabindex', ({ element }) => {
    renderPage(element);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(duplicatedIds()).toEqual([]);
    expect(positiveTabIndexes()).toEqual([]);
  });
});

/**
 * 宿主壳（合并出来的那些模块）单独扫一遍。
 *
 * 它**不能塞进 PAGES**：宿主自己不渲染 h1（标题由子页出），进 PAGES 那条「只有一个 h1」
 * 会被误判成 0 个。而正因为不在 PAGES 里，上面那两条 it.each 覆盖不到它 —— 不补这几条，
 * 「每阶段跑无障碍基线」对宿主就是一句空话。
 *
 * 用例按 MODULE_TABS 逐模块生成：以后每合并一个模块，宿主的无障碍基线自动就位。
 * 子页页面漏登记的话 `tabsOf` 会当场炸，不会静默少测一个模块。
 */
const HOST_PAGES: Record<string, React.ReactElement> = {
  '/study/books': <BooksPage />,
  '/study/writing': <WritingPage />,
  '/health/fitness': <FitnessPage />,
  '/health/diet': <DietPage />,
  '/insight/stats': <StatsPage />,
  '/insight/review': <ReviewPage />,
  '/growth/habits': <HabitsPage />,
  '/growth/goals': <GoalsPage />,
  '/growth/journal': <JournalPage />,
};

const MODULE_HOSTS = Object.keys(MODULE_TABS);

describe('模块宿主壳', () => {
  const renderHost = (
    host: string,
    initial: string,
    paths: Array<{ path: string; element: React.ReactElement }>,
  ): void => {
    render(
      <MemoryRouter initialEntries={[initial]}>
        <ToastProvider>
          <Routes>
            <Route path={host} element={<ModuleHost host={host} />}>
              {paths.map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}
            </Route>
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );
  };

  /** 宿主的子页，转成路由要的相对路径；页面没登记就当场炸，免得静默漏测 */
  const tabsOf = (host: string): Array<{ path: string; element: React.ReactElement }> =>
    (MODULE_TABS[host] ?? []).map((tab) => {
      const element = HOST_PAGES[tab.path];
      if (!element) throw new Error(`宿主 ${host} 的子页 ${tab.path} 没有登记被测页面`);
      return { path: tab.path.slice(host.length + 1), element };
    });

  it.each(MODULE_HOSTS)('%s：壳自己不出 h1 —— 标题留给子页，一页只有一个', (host) => {
    const tabs = MODULE_TABS[host] ?? [];
    // 从默认子页进：一进模块就该看到内容，而不是先被重定向
    renderHost(host, tabs[0]!.path, []);

    expect(document.querySelectorAll('h1')).toHaveLength(0);
  });

  it.each(MODULE_HOSTS)('%s：带上全部子页时仍然唯一 h1，基线三连都过', (host) => {
    const tabs = MODULE_TABS[host] ?? [];
    renderHost(host, tabs[0]!.path, tabsOf(host));

    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(elementsWithoutName()).toEqual([]);
    expect(duplicatedIds()).toEqual([]);
    expect(positiveTabIndexes()).toEqual([]);
  });

  it.each(MODULE_HOSTS)('%s：子页签条是一组有名字的按钮，当前子页按下', (host) => {
    const tabs = MODULE_TABS[host] ?? [];
    const hostLabel = NAV_ITEMS.find((item) => item.host === host)?.label;
    renderHost(host, tabs[0]!.path, tabsOf(host));

    // 组名取宿主在 NAV_ITEMS 里的名字，子页签条本身不带标题
    const strip = screen.getByRole('group', { name: `${hostLabel}内的页面` });
    // 签条在内容之前：子页标题上方，和实现里的位置一致
    expect(strip.compareDocumentPosition(screen.getByRole('heading', { level: 1 }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    for (const tab of tabs) {
      expect(within(strip).getByRole('button', { name: tab.label })).toHaveAttribute(
        'aria-pressed',
        String(tab.path === tabs[0]!.path),
      );
    }
  });
});

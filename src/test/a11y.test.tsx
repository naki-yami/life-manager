import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeAccessibleName } from 'dom-accessibility-api';
import { ToastProvider } from '../components/ui';
import { BooksPage } from '../pages/BooksPage';
import { DevPage } from '../pages/DevPage';
import { DietPage } from '../pages/DietPage';
import { FitnessPage } from '../pages/FitnessPage';
import { GamesPage } from '../pages/GamesPage';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
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

  useDevStore.setState({ projects: [] });
  useDevStore.getState().addProject('Life Manager', '个人应用');

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

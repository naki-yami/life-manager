import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';
import { NavList, Sidebar } from './Sidebar';
import { PageHeader } from './PageHeader';
import { Toolbar } from './Toolbar';
import { ListEmptyState } from './ListEmptyState';
import {
  MODULE_TABS,
  NAV_ITEMS,
  findLocationLabel,
  findNavItem,
  isNavItemActive,
  type NavItem,
} from './navItems';
import { useUiStore } from '../../store/uiStore';
import { Header } from './Header';
import { CommandPaletteProvider } from './CommandPalette';
import { ToastProvider } from '../ui';
import { useTaskStore } from '../../store/taskStore';
import { useBookStore } from '../../store/bookStore';
import { useDevStore } from '../../store/devStore';
import { useDietStore } from '../../store/dietStore';
import { useFitnessStore } from '../../store/fitnessStore';
import { resetPaletteFocus } from '../../hooks/usePaletteFocus';

beforeEach(() => {
  useUiStore.setState({ sidebarCollapsed: false, density: 'comfortable' });
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-density');
});

/** 按落点取导航项；取不到就当场炸，省掉一串非空断言 */
const itemAt = (path: string): NavItem => {
  const item = NAV_ITEMS.find((candidate) => candidate.path === path);
  if (!item) throw new Error(`没有这个导航项：${path}`);
  return item;
};

describe('navItems', () => {
  it('每个导航项都有唯一的路径', () => {
    const paths = NAV_ITEMS.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('目标页挂在主导航上，命令面板也能按「目标 / 达成率」搜到', () => {
    const goals = findNavItem('/goals');

    expect(goals).toMatchObject({ label: '目标', group: 'main' });
    expect(goals?.keywords).toContain('目标');
    expect(goals?.keywords).toContain('达成率');
  });

  it('复盘页挂在主导航上，命令面板也能按「复盘 / 周报」搜到', () => {
    const review = findNavItem('/review');

    expect(review).toMatchObject({ label: '复盘', group: 'main' });
    expect(review?.keywords).toContain('复盘');
    expect(review?.keywords).toContain('周报');
  });

  it('日记页挂在主导航上，命令面板也能按「日记 / 心情」搜到', () => {
    const journal = findNavItem('/journal');

    expect(journal).toMatchObject({ label: '日记与心情', group: 'main' });
    expect(journal?.keywords).toContain('日记');
    expect(journal?.keywords).toContain('心情');
  });

  it('根路径只在自己身上激活', () => {
    expect(isNavItemActive('/', itemAt('/'))).toBe(true);
    expect(isNavItemActive('/tasks', itemAt('/'))).toBe(false);
  });

  it('子路径也算激活，但不会误伤前缀相同的其他路径', () => {
    expect(isNavItemActive('/tasks/123', itemAt('/tasks'))).toBe(true);
    expect(isNavItemActive('/taskshelf', itemAt('/tasks'))).toBe(false);
  });

  it('findNavItem 能找到对应项', () => {
    expect(findNavItem('/games')?.label).toBe('游戏娱乐');
    expect(findNavItem('/nope')).toBeUndefined();
  });

  it('收敛节奏：主导航 13 → 12 → 11，阶段二把健身与饮食并成「健康」', () => {
    expect(NAV_ITEMS.filter((item) => item.group === 'main')).toHaveLength(11);
  });

  it('读书与写作合成「书房」一条，两个子页都点亮它', () => {
    const study = itemAt('/study/books');

    expect(study).toMatchObject({ label: '书房', host: '/study', group: 'main' });

    expect(isNavItemActive('/study/books', study)).toBe(true);
    expect(isNavItemActive('/study/writing', study)).toBe(true);
    // 范围靠 host 圈，前缀相同的别的路径不会被误点亮
    expect(isNavItemActive('/bookshelf', study)).toBe(false);
  });

  it('合并前的两组搜索词一个都没丢：默认子页的归宿主，其余子页自己带', () => {
    const study = itemAt('/study/books');
    const tabs = MODULE_TABS['/study'] ?? [];
    const words = [...study.keywords, ...tabs.flatMap((tab) => tab.keywords ?? [])];

    for (const word of ['读书', '写作', 'reading', 'writing', 'dushu', 'xiezuo']) {
      expect(words).toContain(word);
    }
    // 「写作」不能挂在宿主上：挂了的话搜「写作」会命中书房，回车落在读书页
    expect(study.keywords).not.toContain('写作');
  });

  it('读书 / 写作不再各自占一条导航项，旧路径也归约不到它们', () => {
    const paths = NAV_ITEMS.map((item) => item.path);

    expect(paths).not.toContain('/books');
    expect(paths).not.toContain('/writing');
    expect(findNavItem('/books')).toBeUndefined();
    expect(findNavItem('/writing')).toBeUndefined();
  });

  it('嵌套路由归约到宿主：子页也能查到导航项，不再静默降级', () => {
    expect(findNavItem('/study/books')?.label).toBe('书房');
    expect(findNavItem('/study/writing')?.label).toBe('书房');
    // 宿主自己也要能查到，ModuleTabs 靠它取组名
    expect(findNavItem('/study')?.label).toBe('书房');
  });

  it('顶栏标题取最深的子页名，别笼统地念「书房」', () => {
    expect(findLocationLabel('/study/books')).toBe('读书');
    expect(findLocationLabel('/study/writing')).toBe('写作');
    expect(findLocationLabel('/study')).toBe('书房');
    expect(findLocationLabel('/tasks')).toBe('今日计划');
    expect(findLocationLabel('/nope')).toBeUndefined();
  });

  it('健身与饮食合成「健康」一条，两个子页都点亮它', () => {
    const health = itemAt('/health/fitness');

    expect(health).toMatchObject({ label: '健康', host: '/health', group: 'main' });

    expect(isNavItemActive('/health/fitness', health)).toBe(true);
    expect(isNavItemActive('/health/diet', health)).toBe(true);
    // 范围靠 host 圈，前缀相同的别的路径不会被误点亮
    expect(isNavItemActive('/healthcare', health)).toBe(false);
  });

  it('健康的两组搜索词一个都没丢：默认子页的归宿主，其余子页自己带', () => {
    const health = itemAt('/health/fitness');
    const tabs = MODULE_TABS['/health'] ?? [];
    const words = [...health.keywords, ...tabs.flatMap((tab) => tab.keywords ?? [])];

    for (const word of ['health', '健身', '训练', '体重', '体脂', 'diet', '饮食', '热量']) {
      expect(words).toContain(word);
    }
    // 「饮食」不能挂在宿主上：挂了的话搜「饮食」会命中健康，回车落在健身页
    expect(health.keywords).not.toContain('饮食');
  });

  it('健身 / 饮食不再各自占一条导航项，旧路径也归约不到它们', () => {
    const paths = NAV_ITEMS.map((item) => item.path);

    expect(paths).not.toContain('/fitness');
    expect(paths).not.toContain('/diet');
    expect(findNavItem('/fitness')).toBeUndefined();
    expect(findNavItem('/diet')).toBeUndefined();
  });

  it('健康宿主也吃嵌套归约与最深子页名', () => {
    expect(findNavItem('/health/diet')?.label).toBe('健康');
    // 宿主自己也要能查到，ModuleTabs 靠它取组名
    expect(findNavItem('/health')?.label).toBe('健康');
    expect(findLocationLabel('/health/fitness')).toBe('健身');
    expect(findLocationLabel('/health/diet')).toBe('饮食');
    expect(findLocationLabel('/health')).toBe('健康');
  });
});

describe('NavList', () => {
  const renderList = (path = '/', collapsed = false) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <NavList collapsed={collapsed} />
      </MemoryRouter>,
    );

  it('渲染全部导航项', () => {
    renderList();
    for (const item of NAV_ITEMS) {
      expect(screen.getByRole('button', { name: item.label })).toBeInTheDocument();
    }
  });

  it('给当前页面打上 aria-current', () => {
    renderList('/tasks');
    expect(screen.getByRole('button', { name: '今日计划' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: '书房' })).not.toHaveAttribute('aria-current');
  });

  it('停在子页时仍点亮「书房」，且侧栏里没有独立的读书 / 写作', () => {
    renderList('/study/writing');

    expect(screen.getByRole('button', { name: '书房' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: '读书' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '写作' })).not.toBeInTheDocument();
  });

  it('点击后跳转到目标路由', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<NavList />} />
          <Route path="/study/books" element={<div>读书页面</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: '书房' }));
    expect(screen.getByText('读书页面')).toBeInTheDocument();
  });

  it('收起时隐藏文字，改用 aria-label 保留可访问名称', () => {
    renderList('/', true);
    const button = screen.getByRole('button', { name: '书房' });
    expect(button).toHaveAttribute('aria-label', '书房');
    expect(button).not.toHaveTextContent('书房');
  });

  it('点击后回调 onNavigate，供抽屉关闭自己', async () => {
    const onNavigate = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavList onNavigate={onNavigate} />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: '书房' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

describe('Sidebar 折叠', () => {
  it('切换按钮会改写 store 并反映到 data-collapsed', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'false');

    await userEvent.click(screen.getByRole('button', { name: '收起侧栏' }));

    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'true');
  });
});

const renderLayout = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Layout>
        <Routes>
          <Route path="/" element={<div>首页内容</div>} />
          <Route path="/tasks" element={<div>任务内容</div>} />
          <Route path="/study/books" element={<div>读书内容</div>} />
          <Route path="/study/writing" element={<div>写作内容</div>} />
          <Route path="/health/fitness" element={<div>健身内容</div>} />
          <Route path="/health/diet" element={<div>饮食内容</div>} />
        </Routes>
      </Layout>
    </MemoryRouter>,
  );

describe('Layout', () => {
  it('顶栏显示当前页面的名称', () => {
    renderLayout('/tasks');
    // 侧栏里也有同名导航项，所以限定在顶栏里找
    expect(within(screen.getByRole('banner')).getByText('今日计划')).toBeInTheDocument();
  });

  it('停在子页时顶栏念子页名，描述仍跟着宿主走', () => {
    renderLayout('/study/books');

    const banner = within(screen.getByRole('banner'));
    expect(banner.getByText('读书')).toBeInTheDocument();
    expect(banner.getByText('读书与写作：在读进度、书摘笔记与稿件字数')).toBeInTheDocument();
    // 念的是「读书」，不是笼统的宿主名
    expect(banner.queryByText('书房')).not.toBeInTheDocument();
  });

  it('窄屏汉堡按钮能打开导航抽屉，选中后自动关闭', async () => {
    renderLayout('/');

    await userEvent.click(screen.getByRole('button', { name: '打开导航' }));
    const drawer = screen.getByRole('dialog', { name: '导航' });
    expect(drawer).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole('button', { name: '书房' }));

    expect(screen.queryByRole('dialog', { name: '导航' })).not.toBeInTheDocument();
    expect(screen.getByText('读书内容')).toBeInTheDocument();
  });

  it('⌘K 打开命令面板，回车执行选中的跳转', async () => {
    renderLayout('/');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: '命令面板' });
    expect(palette).toBeInTheDocument();

    const input = within(palette).getByRole('combobox');
    await userEvent.type(input, '任务');

    // 过滤后第一项就是「今日计划」
    await userEvent.keyboard('{Enter}');

    expect(screen.queryByRole('dialog', { name: '命令面板' })).not.toBeInTheDocument();
    expect(screen.getByText('任务内容')).toBeInTheDocument();
  });

  it('命令面板搜子页名直达那一页，不用先进默认子页再点签条', async () => {
    renderLayout('/');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: '命令面板' });

    await userEvent.type(within(palette).getByRole('combobox'), '写作');

    // 第一项就是「写作」，归属写在副标题上 —— 合并前它是导航项，回车直接进写作页
    expect(within(palette).getAllByRole('option')[0]).toHaveTextContent('书房 · 写作');

    await userEvent.keyboard('{Enter}');

    expect(screen.getByText('写作内容')).toBeInTheDocument();
  });

  it('命令面板搜「饮食」落饮食页，不落同一个宿主的默认子页健身', async () => {
    renderLayout('/');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: '命令面板' });

    await userEvent.type(within(palette).getByRole('combobox'), '饮食');

    expect(within(palette).getAllByRole('option')[0]).toHaveTextContent('健康 · 饮食');

    await userEvent.keyboard('{Enter}');

    expect(screen.getByText('饮食内容')).toBeInTheDocument();
  });

  it('命令面板里可以切换密度', async () => {
    renderLayout('/');

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const palette = await screen.findByRole('dialog', { name: '命令面板' });

    const input = within(palette).getByRole('combobox');
    await userEvent.type(input, '密度');
    await userEvent.keyboard('{Enter}');

    expect(useUiStore.getState().density).toBe('compact');
  });

  it('Esc 关闭命令面板', async () => {
    renderLayout('/');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: '命令面板' });

    fireEvent.keyDown(palette, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '命令面板' })).not.toBeInTheDocument();
  });
});

describe('BottomTabBar', () => {
  const bar = () => screen.getByTestId('bottom-tab-bar');

  it('只放四个高频入口，其余走「更多」抽屉', async () => {
    renderLayout('/');

    for (const label of ['首页总览', '今日计划', '习惯养成', '统计']) {
      expect(within(bar()).getByRole('button', { name: label })).toBeInTheDocument();
    }
    // 书房不在 Tab 上，只能从抽屉进
    expect(within(bar()).queryByRole('button', { name: '书房' })).not.toBeInTheDocument();

    const more = within(bar()).getByRole('button', { name: '更多' });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(more);

    expect(screen.getByRole('dialog', { name: '导航' })).toBeInTheDocument();
    expect(within(bar()).getByRole('button', { name: '更多' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('当前页面的 Tab 带 aria-current，点击即可跳转', async () => {
    renderLayout('/');

    expect(within(bar()).getByRole('button', { name: '首页总览' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await userEvent.click(within(bar()).getByRole('button', { name: '今日计划' }));

    expect(screen.getByText('任务内容')).toBeInTheDocument();
    expect(within(bar()).getByRole('button', { name: '今日计划' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(bar()).getByRole('button', { name: '首页总览' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('当前页面不在 Tab 上时点亮「更多」，它本身不是页面所以不带 aria-current', () => {
    renderLayout('/study/books');

    const more = within(bar()).getByRole('button', { name: '更多' });
    expect(more).toHaveClass('text-accent');
    expect(more).not.toHaveAttribute('aria-current');
    for (const label of ['首页总览', '今日计划', '习惯养成', '统计']) {
      expect(within(bar()).getByRole('button', { name: label })).toHaveClass(
        'text-content-tertiary',
      );
    }
  });
});

const renderLayoutWithToasts = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<div>首页内容</div>} />
            <Route path="/tasks" element={<div>任务内容</div>} />
            <Route path="/study/books" element={<div>读书内容</div>} />
          </Routes>
        </Layout>
      </ToastProvider>
    </MemoryRouter>,
  );

describe('命令面板快速捕获', () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [], memos: [] });
    resetPaletteFocus();
  });

  afterEach(() => {
    resetPaletteFocus();
  });

  it('输入一句话回车即建任务，并给出可撤销的提示', async () => {
    renderLayoutWithToasts('/');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: '命令面板' });
    await userEvent.type(within(palette).getByRole('combobox'), '交周报 !高');

    expect(within(palette).getByRole('option', { name: /新建任务「交周报」/ })).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');

    const tasks = useTaskStore.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: '交周报', priority: 'high' });
    expect(screen.queryByRole('dialog', { name: '命令面板' })).not.toBeInTheDocument();

    expect(await screen.findByText('已新建任务「交周报」')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(useTaskStore.getState().tasks).toHaveLength(0);
  });

  it('解析结果不对时可以往下选兜底，内容原样进备忘', async () => {
    renderLayoutWithToasts('/');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: '命令面板' });
    await userEvent.type(within(palette).getByRole('combobox'), '买牛奶');
    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(useTaskStore.getState().tasks).toHaveLength(0);
    expect(useTaskStore.getState().memos[0]!.content).toBe('买牛奶');
  });

  it('完全没匹配上的输入也有兜底，不会白打一遍', async () => {
    renderLayoutWithToasts('/');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: '命令面板' });
    await userEvent.type(within(palette).getByRole('combobox'), 'zzzz');

    expect(within(palette).getByText('存为备忘「zzzz」')).toBeInTheDocument();
  });

  it('输入正好是某条记录时，回车跳过去而不是再建一条同名任务', async () => {
    useTaskStore.getState().addTask('给张总交周报', '', 'high', '');
    renderLayoutWithToasts('/');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: '命令面板' });
    await userEvent.type(within(palette).getByRole('combobox'), '给张总交周报');

    expect(within(palette).getByText('实体')).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');

    expect(screen.getByText('任务内容')).toBeInTheDocument();
    expect(useTaskStore.getState().tasks).toHaveLength(1);
  });
});

describe('命令面板标签', () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [], memos: [] });
    useBookStore.setState({ books: [], sessions: [] });
    useDevStore.setState({ projects: [], sessions: [] });
    useFitnessStore.setState({ plans: [], records: [] });
    useDietStore.setState({ records: [] });
    resetPaletteFocus();
  });

  const openPalette = async (): Promise<HTMLElement> => {
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    return screen.findByRole('dialog', { name: '命令面板' });
  };

  it('输入 #标签 列出跨模块的记录', async () => {
    useTaskStore.getState().addTask('交周报', '', 'high', '', null, ['工作']);
    useBookStore.getState().addBook('置身事内', '兰小欢', '经济', ['工作']);
    renderLayoutWithToasts('/');

    const palette = await openPalette();
    await userEvent.type(within(palette).getByRole('combobox'), '#工作');

    expect(within(palette).getByRole('option', { name: /交周报/ })).toBeInTheDocument();
    expect(within(palette).getByRole('option', { name: /置身事内/ })).toBeInTheDocument();
  });

  it('按标签找到的记录回车可以直接跳过去', async () => {
    useTaskStore.getState().addTask('交周报', '', 'high', '', null, ['工作']);
    renderLayoutWithToasts('/');

    const palette = await openPalette();
    await userEvent.type(within(palette).getByRole('combobox'), '#工作');
    await userEvent.keyboard('{Enter}');

    expect(screen.getByText('任务内容')).toBeInTheDocument();
  });

  it('普通输入也能靠标签命中多个模块', async () => {
    useTaskStore.getState().addTask('拉伸 10 分钟', '', 'medium', '', null, ['健身']);
    useBookStore.getState().addBook('运动解剖学', '', '', ['健身']);
    useDevStore.getState().addProject('健身 App', '', ['健身']);
    renderLayoutWithToasts('/');

    const palette = await openPalette();
    await userEvent.type(within(palette).getByRole('combobox'), '健身');

    expect(within(palette).getByRole('option', { name: /拉伸 10 分钟/ })).toBeInTheDocument();
    expect(within(palette).getByRole('option', { name: /运动解剖学/ })).toBeInTheDocument();
    expect(within(palette).getByRole('option', { name: /健身 App/ })).toBeInTheDocument();
  });

  it('训练与饮食记录也能按标签搜到', async () => {
    useFitnessStore
      .getState()
      .addRecord('胸肌日', '2026-09-28', [{ name: '卧推', sets: 4, reps: 8, weight: 60 }], '', [
        '胸',
      ]);
    useDietStore
      .getState()
      .addRecord(
        '2026-09-28',
        'lunch',
        [{ name: '鸡胸肉', category: '蛋白质', calories: 220 }],
        ['减脂'],
      );
    renderLayoutWithToasts('/');

    const palette = await openPalette();
    const input = within(palette).getByRole('combobox');

    await userEvent.type(input, '#胸');
    expect(within(palette).getByRole('option', { name: /胸肌日/ })).toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, '#减脂');
    expect(within(palette).getByRole('option', { name: /鸡胸肉/ })).toBeInTheDocument();
  });

  it('实体行会带上 #标签，方便确认命中的是哪一条', async () => {
    useTaskStore.getState().addTask('交周报', '', 'high', '', null, ['工作', '重要']);
    renderLayoutWithToasts('/');

    const palette = await openPalette();
    await userEvent.type(within(palette).getByRole('combobox'), '交周报');

    expect(within(palette).getByRole('option', { name: /#工作 #重要/ })).toBeInTheDocument();
  });
});

describe('Layout 无障碍', () => {
  it('提供跳过导航的链接，落点是可聚焦的主区域', () => {
    renderLayout('/');

    const skipLink = screen.getByRole('link', { name: '跳到主内容' });
    expect(skipLink).toHaveAttribute('href', '#main-content');

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');
    // 主区域要能被程序化聚焦，跳转链接才有落点，但不应进入 Tab 序列
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('换路由后播报新页面名称，首次进入保持安静', async () => {
    renderLayout('/');

    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();

    await userEvent.click(screen.getAllByRole('button', { name: '书房' })[0]!);

    await waitFor(() => expect(status).toHaveTextContent('读书已打开'));
  });

  it('地址没有对应导航项时播报通用文案', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Layout>
          <Routes>
            <Route path="/" element={<Link to="/nowhere">去未知页面</Link>} />
            <Route path="/nowhere" element={<div>未知内容</div>} />
          </Routes>
        </Layout>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('link', { name: '去未知页面' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('页面已打开'));
  });
});

describe('PageHeader', () => {
  it('渲染标题、描述与操作区', () => {
    render(
      <PageHeader
        title="今日计划"
        description="共 3 项待办"
        actions={<button type="button">新建</button>}
        meta={<span>高优先级 1</span>}
      />,
    );

    expect(screen.getByRole('heading', { name: '今日计划' })).toBeInTheDocument();
    expect(screen.getByText('共 3 项待办')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建' })).toBeInTheDocument();
    expect(screen.getByText('高优先级 1')).toBeInTheDocument();
  });

  it('宽操作区不挤标题：标题留换行阈值，操作区可收缩并在内部换行', () => {
    // 回归：统计页把两个日期框塞进 actions 后，标题被挤成一列窄条、描述折成四行。
    // 根因是 actions 用了 shrink-0 —— 宽度不够时它一步不让，只能由标题让路。
    // jsdom 没有排版引擎，这里断言不了「真的换行了」，所以锁让它换行的那组类：
    // 标题块带 basis 阈值（窄容器下把操作区顶到下一行），操作区允许收缩。
    const { container } = render(
      <PageHeader
        title="统计"
        description="所选 21 天的活动趋势与各模块进度"
        actions={
          <>
            <button type="button">7 天</button>
            <input type="date" aria-label="自定义起始日期" />
          </>
        }
      />,
    );

    expect(container.querySelector('header')).toHaveClass('flex-wrap');

    const titleBlock = screen.getByRole('heading', { name: '统计' }).parentElement as HTMLElement;
    expect(titleBlock.className).toContain('min-w-0');
    expect(titleBlock.className).toMatch(/\bbasis-\S+/);

    const actionsBlock = screen.getByRole('button', { name: '7 天' }).parentElement as HTMLElement;
    expect(actionsBlock.className).toContain('min-w-0');
    expect(actionsBlock.className).toContain('flex-wrap');
    expect(actionsBlock.className).not.toContain('shrink-0');
  });
});

describe('Toolbar', () => {
  it('搜索框的值变化会回调出去', async () => {
    const onChange = vi.fn();
    render(
      <Toolbar search={{ value: '', onChange }} actions={<button type="button">新建</button>} />,
    );

    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), '书');
    expect(onChange).toHaveBeenCalledWith('书');
    expect(screen.getByRole('button', { name: '新建' })).toBeInTheDocument();
  });
});

describe('Header 手动保存', () => {
  it('点保存按钮会留快照并弹确认提示', async () => {
    localStorage.clear();
    localStorage.setItem('lm:tasks', '{"state":{"tasks":[]},"version":11}');

    render(
      <MemoryRouter initialEntries={['/']}>
        <CommandPaletteProvider>
          <ToastProvider>
            <Header onOpenNav={() => {}} />
          </ToastProvider>
        </CommandPaletteProvider>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: '保存到本地' }));

    // 保存是异步的（按需加载备份模块），等 Toast 出现
    expect(await screen.findByText('已保存到本地')).toBeInTheDocument();
    const reasons = Object.keys(localStorage)
      .filter((key) => key.startsWith('lm:backup:auto:'))
      .map((key) => (JSON.parse(localStorage.getItem(key) ?? '{}') as { reason?: string }).reason);
    expect(reasons).toContain('手动保存');
  });
});

describe('ListEmptyState', () => {
  it('一条数据都没有时讲「去添加第一条」，并给出主操作', () => {
    render(
      <ListEmptyState
        icon={<span />}
        filtered={false}
        emptyTitle="书单还是空的"
        emptyDescription="把想读的书加进来。"
        emptyAction={<button type="button">添加书籍</button>}
        filteredTitle="没有符合条件的书"
        filteredDescription="换个关键词。"
      />,
    );

    expect(screen.getByText('书单还是空的')).toBeInTheDocument();
    expect(screen.getByText('把想读的书加进来。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加书籍' })).toBeInTheDocument();
    // 空库时不该出现「清除筛选」——没有筛选可清
    expect(screen.queryByRole('button', { name: '清除筛选' })).not.toBeInTheDocument();
  });

  it('有数据但被筛掉时换成筛选文案，并给一个「清除筛选」', async () => {
    const onClearFilters = vi.fn();
    render(
      <ListEmptyState
        icon={<span />}
        filtered
        emptyTitle="书单还是空的"
        emptyDescription="把想读的书加进来。"
        emptyAction={<button type="button">添加书籍</button>}
        filteredTitle="没有符合条件的书"
        filteredDescription="换个关键词。"
        onClearFilters={onClearFilters}
      />,
    );

    expect(screen.getByText('没有符合条件的书')).toBeInTheDocument();
    expect(screen.queryByText('书单还是空的')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '添加书籍' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('没给 onClearFilters 时被筛空也不渲染按钮', () => {
    render(
      <ListEmptyState
        icon={<span />}
        filtered
        emptyTitle="书单还是空的"
        filteredTitle="没有符合条件的书"
      />,
    );

    expect(screen.getByText('没有符合条件的书')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

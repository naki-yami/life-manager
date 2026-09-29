import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';
import { NavList, Sidebar } from './Sidebar';
import { PageHeader } from './PageHeader';
import { Toolbar } from './Toolbar';
import { NAV_ITEMS, findNavItem, isNavItemActive } from './navItems';
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

  it('根路径只在自己身上激活', () => {
    expect(isNavItemActive('/', '/')).toBe(true);
    expect(isNavItemActive('/tasks', '/')).toBe(false);
  });

  it('子路径也算激活，但不会误伤前缀相同的其他路径', () => {
    expect(isNavItemActive('/books/123', '/books')).toBe(true);
    expect(isNavItemActive('/bookshelf', '/books')).toBe(false);
  });

  it('findNavItem 能找到对应项', () => {
    expect(findNavItem('/games')?.label).toBe('游戏娱乐');
    expect(findNavItem('/nope')).toBeUndefined();
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
    expect(screen.getByRole('button', { name: '读书' })).not.toHaveAttribute('aria-current');
  });

  it('点击后跳转到目标路由', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<NavList />} />
          <Route path="/books" element={<div>读书页面</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: '读书' }));
    expect(screen.getByText('读书页面')).toBeInTheDocument();
  });

  it('收起时隐藏文字，改用 aria-label 保留可访问名称', () => {
    renderList('/', true);
    const button = screen.getByRole('button', { name: '读书' });
    expect(button).toHaveAttribute('aria-label', '读书');
    expect(button).not.toHaveTextContent('读书');
  });

  it('点击后回调 onNavigate，供抽屉关闭自己', async () => {
    const onNavigate = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavList onNavigate={onNavigate} />
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: '读书' }));
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
          <Route path="/books" element={<div>读书内容</div>} />
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

  it('窄屏汉堡按钮能打开导航抽屉，选中后自动关闭', async () => {
    renderLayout('/');

    await userEvent.click(screen.getByRole('button', { name: '打开导航' }));
    const drawer = screen.getByRole('dialog', { name: '导航' });
    expect(drawer).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole('button', { name: '读书' }));

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
    // 读书不在 Tab 上，只能从抽屉进
    expect(within(bar()).queryByRole('button', { name: '读书' })).not.toBeInTheDocument();

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
    renderLayout('/books');

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
            <Route path="/books" element={<div>读书内容</div>} />
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

    await userEvent.click(screen.getAllByRole('button', { name: '读书' })[0]!);

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

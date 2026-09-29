import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from './Layout';
import { NavList, Sidebar } from './Sidebar';
import { PageHeader } from './PageHeader';
import { Toolbar } from './Toolbar';
import { NAV_ITEMS, findNavItem, isNavItemActive } from './navItems';
import { useUiStore } from '../../store/uiStore';
import { Header } from './Header';
import { CommandPaletteProvider } from './CommandPalette';
import { ToastProvider } from '../ui';

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

  it('没有搜索结果时给出空态提示', async () => {
    renderLayout('/');

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: '命令面板' });
    await userEvent.type(within(palette).getByRole('combobox'), 'zzzz');

    expect(within(palette).getByText('没有匹配的结果')).toBeInTheDocument();
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

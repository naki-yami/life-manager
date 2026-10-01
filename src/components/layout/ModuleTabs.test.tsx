import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ModuleTabs } from './ModuleTabs';
import { MODULE_TABS, NAV_ITEMS, findModuleTab } from './navItems';

/** 导航有没有真的发生，看地址栏 */
const LocationProbe: React.FC = () => {
  const { pathname } = useLocation();
  return <span data-testid="pathname">{pathname}</span>;
};

const renderTabs = (initial: string): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={[initial]}>
      <ModuleTabs host="/study" />
      <LocationProbe />
    </MemoryRouter>,
  );

describe('MODULE_TABS', () => {
  it('书房的子页是读书与写作，且都在宿主之下', () => {
    expect(MODULE_TABS['/study']?.map((tab) => tab.path)).toEqual([
      '/study/books',
      '/study/writing',
    ]);
  });

  it('子页不占导航项 —— 一个模块只留一条，落点是它的默认子页', () => {
    const hosts = Object.keys(MODULE_TABS);
    const navPaths = NAV_ITEMS.map((item) => item.path);

    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      const tabs = MODULE_TABS[host] ?? [];
      const owned = NAV_ITEMS.filter((item) => item.host === host);

      // 合并后一个模块只留一条，子页不会各自冒出来
      expect(owned).toHaveLength(1);
      // 落点就是默认子页（第一个）：侧栏点一下直接进页面，不用先到宿主再被重定向
      expect(owned[0]?.path).toBe(tabs[0]?.path);
      // 其余子页只在宿主内可见 —— 侧栏 / 底部 Tab / g+数字 都不列它们
      for (const tab of tabs.slice(1)) {
        expect(navPaths).not.toContain(tab.path);
      }
    }
  });

  it('findModuleTab 只认子页路径，不认宿主也不认旧路径', () => {
    expect(findModuleTab('/study/books')?.label).toBe('读书');
    expect(findModuleTab('/study/writing')?.label).toBe('写作');
    expect(findModuleTab('/study')).toBeUndefined();
    expect(findModuleTab('/books')).toBeUndefined();
  });
});

describe('ModuleTabs', () => {
  it('把子页渲成一组按钮，当前子页是按下态', () => {
    renderTabs('/study/books');

    // 组名取宿主在 NAV_ITEMS 里的名字（/study 那条），子页签条本身不带标题
    expect(screen.getByRole('group')).toHaveAttribute('aria-label', '书房内的页面');
    expect(screen.getByRole('button', { name: '读书' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '写作' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('签条用导航皮肤（下划线），不是页内筛选那种胶囊', () => {
    renderTabs('/study/books');

    const strip = screen.getByRole('group', { name: '书房内的页面' });
    expect(strip.className).toContain('border-b');
    expect(strip.className).not.toContain('bg-inset');
  });

  it('点另一个子页就换过去，按下态跟着走', async () => {
    renderTabs('/study/books');

    await userEvent.click(screen.getByRole('button', { name: '写作' }));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/study/writing');
    expect(screen.getByRole('button', { name: '写作' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '读书' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('没有登记子页的宿主什么都不渲染', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/dev']}>
        <ModuleTabs host="/dev" />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

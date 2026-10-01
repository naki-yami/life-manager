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

  it('健康的子页是健身与饮食，且都在宿主之下', () => {
    expect(MODULE_TABS['/health']?.map((tab) => tab.path)).toEqual([
      '/health/fitness',
      '/health/diet',
    ]);
  });

  it('统计与复盘的子页是统计与复盘两条，且都在宿主之下', () => {
    expect(MODULE_TABS['/insight']?.map((tab) => tab.path)).toEqual([
      '/insight/stats',
      '/insight/review',
    ]);
  });

  it('成长是唯一的三子页宿主，顺序是习惯 / 目标 / 日记', () => {
    expect(MODULE_TABS['/growth']?.map((tab) => tab.path)).toEqual([
      '/growth/habits',
      '/growth/goals',
      '/growth/journal',
    ]);
    // 签条上的名字照抄页内 h1（不是「习惯」这种缩写）
    expect(MODULE_TABS['/growth']?.map((tab) => tab.label)).toEqual([
      '习惯养成',
      '目标',
      '日记与心情',
    ]);
  });

  it('默认子页不重复带搜索词，其余子页自己带 —— 免得搜「写作」落在读书页', () => {
    const tabs = MODULE_TABS['/study'] ?? [];
    const host = NAV_ITEMS.find((item) => item.host === '/study');

    expect(tabs[0]?.path).toBe('/study/books');
    // 默认子页的落点和宿主一致，词挂在宿主上就够了
    expect(tabs[0]?.keywords).toBeUndefined();
    expect(tabs[1]?.keywords).toContain('写作');
    expect(host?.keywords).not.toContain('写作');
  });

  it('健康同理：搜「饮食」不能落在默认子页健身', () => {
    const tabs = MODULE_TABS['/health'] ?? [];
    const host = NAV_ITEMS.find((item) => item.host === '/health');

    expect(tabs[0]?.path).toBe('/health/fitness');
    expect(tabs[0]?.keywords).toBeUndefined();
    expect(tabs[1]?.keywords).toContain('饮食');
    expect(host?.keywords).not.toContain('饮食');
  });

  it('成长：三个子页各自的词都挂在子页上，宿主只管默认子页那一组', () => {
    const tabs = MODULE_TABS['/growth'] ?? [];
    const host = NAV_ITEMS.find((item) => item.host === '/growth');

    expect(tabs[0]?.path).toBe('/growth/habits');
    expect(tabs[0]?.keywords).toBeUndefined();
    expect(tabs[1]?.keywords).toContain('达成率');
    expect(tabs[2]?.keywords).toContain('心情');
    expect(host?.keywords).not.toContain('达成率');
    expect(host?.keywords).not.toContain('心情');
  });

  it('统计与复盘：复盘那组词在子页上 —— 宿主名里就带「复盘」二字，词不能再上移', () => {
    const tabs = MODULE_TABS['/insight'] ?? [];
    const host = NAV_ITEMS.find((item) => item.host === '/insight');

    expect(tabs[0]?.path).toBe('/insight/stats');
    expect(tabs[0]?.keywords).toBeUndefined();
    expect(tabs[1]?.keywords).toContain('复盘');
    expect(tabs[1]?.keywords).toContain('周报');
    expect(host?.keywords).not.toContain('复盘');
    expect(host?.keywords).not.toContain('周报');
  });

  it('findModuleTab 只认子页路径，不认宿主也不认旧路径', () => {
    expect(findModuleTab('/study/books')?.label).toBe('读书');
    expect(findModuleTab('/study/writing')?.label).toBe('写作');
    expect(findModuleTab('/study')).toBeUndefined();
    expect(findModuleTab('/books')).toBeUndefined();
    expect(findModuleTab('/health/fitness')?.label).toBe('健身');
    expect(findModuleTab('/health/diet')?.label).toBe('饮食');
    expect(findModuleTab('/health')).toBeUndefined();
    expect(findModuleTab('/diet')).toBeUndefined();
    expect(findModuleTab('/insight/stats')?.label).toBe('统计');
    expect(findModuleTab('/insight/review')?.label).toBe('复盘');
    expect(findModuleTab('/insight')).toBeUndefined();
    expect(findModuleTab('/review')).toBeUndefined();
    expect(findModuleTab('/growth/habits')?.label).toBe('习惯养成');
    expect(findModuleTab('/growth/goals')?.label).toBe('目标');
    expect(findModuleTab('/growth/journal')?.label).toBe('日记与心情');
    expect(findModuleTab('/growth')).toBeUndefined();
    expect(findModuleTab('/journal')).toBeUndefined();
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

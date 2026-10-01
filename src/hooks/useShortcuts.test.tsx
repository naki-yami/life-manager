import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NEW_ENTRY_EVENT,
  requestNewEntry,
  useGlobalShortcuts,
  useNewEntryShortcut,
} from './useShortcuts';

const Host: React.FC<{ onOpenPalette: () => void }> = ({ onOpenPalette }) => {
  useGlobalShortcuts(onOpenPalette);
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

const renderHost = (onOpenPalette: () => void) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="*" element={<Host onOpenPalette={onOpenPalette} />} />
      </Routes>
    </MemoryRouter>,
  );

describe('useGlobalShortcuts', () => {
  it('按 n 会向页面广播新建事件', () => {
    const handler = vi.fn();
    const Listener: React.FC = () => {
      useNewEntryShortcut(handler);
      return null;
    };
    const open = vi.fn();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Host onOpenPalette={open} />
        <Listener />
      </MemoryRouter>,
    );
    fireEvent.keyDown(window, { key: 'n' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('事件名是稳定的 lm:new-entry', () => {
    expect(NEW_ENTRY_EVENT).toBe('lm:new-entry');
  });

  it('按 / 打开命令面板', () => {
    const open = vi.fn();
    renderHost(open);
    fireEvent.keyDown(window, { key: '/' });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('g 后接数字跳转对应主页面（g 2 = 今日计划）', () => {
    const open = vi.fn();
    renderHost(open);
    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByTestId('location')).toHaveTextContent('/tasks');
  });

  it('g 后接 3 进书房：直接落在默认子页', () => {
    const open = vi.fn();
    renderHost(open);
    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: '3' });
    expect(screen.getByTestId('location')).toHaveTextContent('/study/books');
  });

  it('单独按数字不跳转，必须跟在 g 后面', () => {
    const open = vi.fn();
    renderHost(open);
    fireEvent.keyDown(window, { key: '2' });
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('在输入框里打字时单键快捷键不触发', () => {
    const open = vi.fn();
    const handler = vi.fn();
    const Listener: React.FC = () => {
      useNewEntryShortcut(handler);
      return <input aria-label="打字框" />;
    };
    render(
      <MemoryRouter>
        <Listener />
      </MemoryRouter>,
    );

    const input = screen.getByRole('textbox', { name: '打字框' });
    input.focus();
    fireEvent.keyDown(input, { key: 'n' });
    fireEvent.keyDown(input, { key: '/' });

    expect(handler).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('按住修饰键时不触发（避免抢占系统快捷键）', () => {
    const open = vi.fn();
    renderHost(open);
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    fireEvent.keyDown(window, { key: '/', metaKey: true });
    expect(open).not.toHaveBeenCalled();
  });
});

describe('新建意图的认领', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const Listener: React.FC<{ onNew: () => void }> = ({ onNew }) => {
    useNewEntryShortcut(onNew);
    return null;
  };

  it('命令面板先跳转、页面后挂载时也能认领（懒加载场景）', () => {
    requestNewEntry();

    const onNew = vi.fn();
    render(
      <MemoryRouter>
        <Listener onNew={onNew} />
      </MemoryRouter>,
    );

    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('已经挂载的页面立刻收到，且不会在重挂载时再触发一次', () => {
    const onNew = vi.fn();
    const { unmount } = render(
      <MemoryRouter>
        <Listener onNew={onNew} />
      </MemoryRouter>,
    );

    requestNewEntry();
    expect(onNew).toHaveBeenCalledTimes(1);

    unmount();
    render(
      <MemoryRouter>
        <Listener onNew={onNew} />
      </MemoryRouter>,
    );
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('过期的意图不会被之后的页面误认领', () => {
    vi.useFakeTimers();
    requestNewEntry();

    vi.advanceTimersByTime(10_000);

    const onNew = vi.fn();
    render(
      <MemoryRouter>
        <Listener onNew={onNew} />
      </MemoryRouter>,
    );
    expect(onNew).not.toHaveBeenCalled();
  });
});

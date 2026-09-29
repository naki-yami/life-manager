import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumePaletteFocus,
  requestPaletteFocus,
  resetPaletteFocus,
  usePaletteFocus,
} from './usePaletteFocus';

const Host: React.FC<{ path: string; onFocus: (entityId: string) => void }> = ({
  path,
  onFocus,
}) => {
  usePaletteFocus(path, onFocus);
  return null;
};

beforeEach(() => {
  resetPaletteFocus();
});

afterEach(() => {
  vi.useRealTimers();
  resetPaletteFocus();
});

describe('命令面板聚焦请求', () => {
  it('页面后挂载时补认领（懒加载页面走这条路）', () => {
    // 面板先登记再跳路由，此时目标页还没挂载
    requestPaletteFocus('/tasks', 'task-1');

    const onFocus = vi.fn();
    render(<Host path="/tasks" onFocus={onFocus} />);

    expect(onFocus).toHaveBeenCalledWith('task-1');
  });

  it('页面已经挂载时立刻收到通知', () => {
    const onFocus = vi.fn();
    render(<Host path="/tasks" onFocus={onFocus} />);

    act(() => {
      requestPaletteFocus('/tasks', 'task-2');
    });

    expect(onFocus).toHaveBeenCalledWith('task-2');
  });

  it('消费过的请求不会残留到下一次挂载', () => {
    const onFocus = vi.fn();
    render(<Host path="/tasks" onFocus={onFocus} />);

    act(() => {
      requestPaletteFocus('/tasks', 'task-3');
    });
    expect(onFocus).toHaveBeenCalledTimes(1);

    // 再挂一个同路径页面，不该重复打开同一个详情
    render(<Host path="/tasks" onFocus={onFocus} />);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('路径不匹配时不认领，也不会把请求吞掉', () => {
    requestPaletteFocus('/books', 'book-1');

    const onFocus = vi.fn();
    render(<Host path="/tasks" onFocus={onFocus} />);

    expect(onFocus).not.toHaveBeenCalled();
    expect(consumePaletteFocus('/books')).toBe('book-1');
  });

  it('没有请求时什么也不做', () => {
    const onFocus = vi.fn();
    render(<Host path="/tasks" onFocus={onFocus} />);
    expect(onFocus).not.toHaveBeenCalled();
  });

  it('超过有效期就作废，避免很久以后莫名弹出详情', () => {
    vi.useFakeTimers();
    requestPaletteFocus('/tasks', 'task-4');

    vi.advanceTimersByTime(60_000);

    const onFocus = vi.fn();
    render(<Host path="/tasks" onFocus={onFocus} />);
    expect(onFocus).not.toHaveBeenCalled();
  });

  it('页面卸载后不再接收通知', () => {
    const onFocus = vi.fn();
    const { unmount } = render(<Host path="/tasks" onFocus={onFocus} />);
    unmount();

    act(() => {
      requestPaletteFocus('/tasks', 'task-5');
    });
    expect(onFocus).not.toHaveBeenCalled();
  });
});

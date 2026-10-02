import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useUrlSelection } from './useUrlSelection';

/** 把当前 URL 打到 DOM 上，便于断言「选中真的进 URL 了」 */
const LocationProbe: React.FC = () => {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
};

const wrapper =
  (entry: string) =>
  ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[entry]}>
      {children}
      <LocationProbe />
    </MemoryRouter>
  );

describe('useUrlSelection', () => {
  it('URL 里的 id 在可见列表里就用它', () => {
    const { result } = renderHook(() => useUrlSelection('book', ['a', 'b', 'c']), {
      wrapper: wrapper('/?book=b'),
    });

    expect(result.current[0]).toBe('b');
  });

  it('没传参数时回落到第一条可见项 —— 右栏常驻有内容', () => {
    const { result } = renderHook(() => useUrlSelection('book', ['a', 'b', 'c']), {
      wrapper: wrapper('/'),
    });

    expect(result.current[0]).toBe('a');
  });

  it('URL 里是一个已经看不见的 id（被筛掉了）时也回落', () => {
    const { result } = renderHook(() => useUrlSelection('book', ['a', 'b']), {
      wrapper: wrapper('/?book=已删除的书'),
    });

    expect(result.current[0]).toBe('a');
  });

  it('列表为空时给 null，交给调用方走空态', () => {
    const { result } = renderHook(() => useUrlSelection('book', []), {
      wrapper: wrapper('/?book=a'),
    });

    expect(result.current[0]).toBeNull();
  });

  it('select 把 id 写进 URL，且不冲掉别的查询参数', () => {
    const { result } = renderHook(() => useUrlSelection('book', ['a', 'b']), {
      wrapper: wrapper('/?range=7'),
    });

    act(() => result.current[1]('b'));

    const search = document.querySelector('[data-testid="location"]')!.textContent ?? '';
    expect(search).toContain('book=b');
    // 同页别的参数（筛选、时间窗）必须保住
    expect(search).toContain('range=7');
  });
});

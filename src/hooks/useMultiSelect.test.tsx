import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMultiSelect } from './useMultiSelect';

const A = ['t1', 't2', 't3', 't4'];

const setup = (ids: readonly string[] = A) =>
  renderHook(({ list }) => useMultiSelect({ ids: list }), {
    initialProps: { list: ids },
  });

describe('useMultiSelect', () => {
  it('初始没选中，也不在批量模式', () => {
    const { result } = setup();

    expect(result.current.isActive).toBe(false);
    expect(result.current.count).toBe(0);
    expect(result.current.selectedIds).toEqual([]);
  });

  it('toggle 勾选与取消，count 跟着变', () => {
    const { result } = setup();

    act(() => result.current.toggle('t1'));
    act(() => result.current.toggle('t3'));
    expect(result.current.count).toBe(2);
    expect(result.current.isActive).toBe(true);
    expect(result.current.has('t1')).toBe(true);
    expect(result.current.has('t2')).toBe(false);
    expect(result.current.selectedIds).toEqual(['t1', 't3']);

    act(() => result.current.toggle('t1'));
    expect(result.current.count).toBe(1);
    expect(result.current.has('t1')).toBe(false);
  });

  it('selectAll 选的是传进来的那批，不是全部', () => {
    const { result } = setup();

    // 页面筛出 2 条之后传进来的就是这 2 条
    act(() => result.current.toggle('t1'));
    act(() => result.current.clear());
    act(() => result.current.selectAll());

    expect(result.current.count).toBe(4);
    expect(result.current.selectedIds).toEqual(A);
  });

  it('清空之后退出批量模式', () => {
    const { result } = setup();

    act(() => result.current.selectAll());
    expect(result.current.isActive).toBe(true);

    act(() => result.current.clear());
    expect(result.current.isActive).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('可选项变少时，已失效的选中项被自动剔除', () => {
    const { result, rerender } = setup();

    act(() => result.current.selectAll());
    expect(result.current.count).toBe(4);

    // 筛条件收紧，只剩 t2、t3 可见 —— t1、t4 不能再留在选中集里，
    // 否则用户看不见它们，批量删除却会把它们删掉
    rerender({ list: ['t2', 't3'] });

    expect(result.current.selectedIds).toEqual(['t2', 't3']);
    expect(result.current.count).toBe(2);
  });

  it('可选项全没了就自动退出批量模式', () => {
    const { result, rerender } = setup();

    act(() => result.current.selectAll());
    rerender({ list: [] });

    expect(result.current.isActive).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('可选项没变时，选中集不会被无故换引用', () => {
    const { result, rerender } = setup();

    act(() => result.current.toggle('t1'));
    const before = result.current.selectedIds;

    // 传同一个内容的新数组：ids 引用变了，但内容一致，选中集应当原样保留
    rerender({ list: [...A] });

    expect(result.current.selectedIds).toEqual(before);
  });

  it('选中一条已被移除、同时又有新条目进来，两边都不受影响', () => {
    const { result, rerender } = setup();

    act(() => result.current.toggle('t1'));
    act(() => result.current.toggle('t4'));

    rerender({ list: ['t2', 't4', 't5'] });

    // t1 没了被剔掉，t4 还在，t5 是新来的但没被自动选中
    expect(result.current.selectedIds).toEqual(['t4']);
    expect(result.current.has('t5')).toBe(false);
  });
});

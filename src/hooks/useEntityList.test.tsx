import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEntityList } from './useEntityList';

interface Book {
  id: string;
  title: string;
  author: string;
  tags: string[];
  status: 'reading' | 'finished';
}

const BOOKS: Book[] = [
  { id: 'b1', title: '维摩诘经', author: '佚名', tags: ['佛学'], status: 'reading' },
  { id: 'b2', title: '庄子今注今译', author: '陈鼓应', tags: ['道家'], status: 'finished' },
  { id: 'b3', title: '读书的方法', author: '佚名', tags: ['方法论'], status: 'finished' },
  { id: 'b4', title: 'Deep Work', author: 'Cal Newport', tags: ['专注'], status: 'reading' },
];

// 模块级常量：引用稳定，页面照这个写法用
const bookFields = (book: Book): string[] => [book.title, book.author, ...book.tags];
const bookStatus = (book: Book): Book['status'] => book.status;

function setup(items: readonly Book[] = BOOKS) {
  return renderHook(() =>
    useEntityList<Book, Book['status']>({ items, searchFields: bookFields, statusOf: bookStatus }),
  );
}

describe('useEntityList', () => {
  it('默认不搜也不筛，全部返回', () => {
    const { result } = setup();

    expect(result.current.visible).toHaveLength(4);
    expect(result.current.keyword).toBe('');
    expect(result.current.filter).toBe('all');
    expect(result.current.filteredOut).toBe(false);
  });

  it('关键词在标题、作者与标签里匹配，忽略大小写', () => {
    const { result } = setup();

    act(() => result.current.setKeyword('佚名'));
    expect(result.current.visible.map((book) => book.id)).toEqual(['b1', 'b3']);

    act(() => result.current.setKeyword('deep work'));
    expect(result.current.visible.map((book) => book.id)).toEqual(['b4']);
  });

  it('输入 #标签 也能搜到——标签在界面上就显示成 #佛学', () => {
    const { result } = setup();

    act(() => result.current.setKeyword('#佛学'));

    expect(result.current.visible.map((book) => book.id)).toEqual(['b1']);
  });

  it('状态筛选与关键词同时生效', () => {
    const { result } = setup();

    act(() => result.current.setFilter('reading'));
    expect(result.current.visible.map((book) => book.id)).toEqual(['b1', 'b4']);

    act(() => result.current.setKeyword('deep'));
    expect(result.current.visible.map((book) => book.id)).toEqual(['b4']);

    act(() => result.current.setFilter('all'));
    expect(result.current.visible.map((book) => book.id)).toEqual(['b4']);
  });

  it('countOf 给分段控件算角标：all 是总数，其余按状态数', () => {
    const { result } = setup();

    expect(result.current.countOf('all')).toBe(4);
    expect(result.current.countOf('reading')).toBe(2);
    expect(result.current.countOf('finished')).toBe(2);
  });

  it('有数据但被筛空时 filteredOut 为 true，空库时为 false', () => {
    const { result } = setup();

    act(() => result.current.setKeyword('这本书不存在'));
    expect(result.current.visible).toEqual([]);
    expect(result.current.filteredOut).toBe(true);

    // 空库时要说「还没有数据」，不能说「没筛出来」
    const empty = setup([]);
    expect(empty.result.current.filteredOut).toBe(false);
  });

  it('initialFilter 决定初始筛选值', () => {
    const { result } = renderHook(() =>
      useEntityList<Book, Book['status']>({
        items: BOOKS,
        searchFields: bookFields,
        statusOf: bookStatus,
        initialFilter: 'finished',
      }),
    );

    expect(result.current.filter).toBe('finished');
    expect(result.current.visible.map((book) => book.id)).toEqual(['b2', 'b3']);
  });

  it('不传 statusOf 时只能搜、不能筛，countOf 恒为总数', () => {
    const { result } = renderHook(() =>
      useEntityList<Book, Book['status']>({ items: BOOKS, searchFields: bookFields }),
    );

    act(() => result.current.setFilter('reading'));

    expect(result.current.visible).toHaveLength(4);
    expect(result.current.countOf('reading')).toBe(4);
  });

  it('clearFilters 一次清掉关键词并把筛选退回「全部」', () => {
    const { result } = setup();

    act(() => result.current.setKeyword('deep'));
    act(() => result.current.setFilter('finished'));
    expect(result.current.visible).toEqual([]);

    act(() => result.current.clearFilters());

    expect(result.current.keyword).toBe('');
    expect(result.current.filter).toBe('all');
    expect(result.current.visible).toHaveLength(4);
  });

  it('换了 searchFields 会立刻按新字段匹配，不会拿到旧闭包', () => {
    const { result, rerender } = renderHook(
      ({ fields }: { fields: (book: Book) => Array<string | undefined | null> }) =>
        useEntityList<Book, Book['status']>({
          items: BOOKS,
          searchFields: fields,
          statusOf: bookStatus,
        }),
      { initialProps: { fields: (book: Book) => [book.title] } },
    );

    act(() => result.current.setKeyword('佚名'));
    // 第一版只搜标题，「佚名」只出现在作者字段里
    expect(result.current.visible).toEqual([]);

    rerender({ fields: bookFields });
    expect(result.current.visible.map((book) => book.id)).toEqual(['b1', 'b3']);
  });
});

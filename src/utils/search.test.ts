import { describe, expect, it } from 'vitest';
import { filterByKeyword, matchesKeyword } from './search';

describe('matchesKeyword', () => {
  it('空关键词匹配一切', () => {
    expect(matchesKeyword('', '任意')).toBe(true);
    expect(matchesKeyword('   ', '任意')).toBe(true);
  });

  it('忽略大小写与首尾空格', () => {
    expect(matchesKeyword('  BOOK ', 'books')).toBe(true);
  });

  it('任一字段命中即通过', () => {
    expect(matchesKeyword('作者', '书名', '某作者')).toBe(true);
  });

  it('null / undefined 字段不会抛错', () => {
    expect(matchesKeyword('x', undefined, null)).toBe(false);
  });

  it('开头的 # 会被忽略，方便直接粘贴标签', () => {
    expect(matchesKeyword('#工作', '工作')).toBe(true);
    expect(matchesKeyword('#工作', '待办')).toBe(false);
    // 只有 # 时等价于不筛选
    expect(matchesKeyword('#', '待办')).toBe(true);
  });
});

describe('filterByKeyword', () => {
  const items = [
    { title: '深入理解计算机系统', author: 'Randal' },
    { title: '人类简史', author: 'Harari' },
  ];

  it('空关键词返回浅拷贝，不返回原数组引用', () => {
    const result = filterByKeyword(items, '', (item) => [item.title]);
    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });

  it('按任一字段过滤', () => {
    const result = filterByKeyword(items, 'harari', (item) => [item.title, item.author]);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('人类简史');
  });
});

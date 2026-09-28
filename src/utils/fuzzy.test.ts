import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('空查询匹配一切且不产生高亮', () => {
    expect(fuzzyMatch('', '读书')).toEqual({ score: 0, matched: [] });
    expect(fuzzyMatch('   ', '读书')).toEqual({ score: 0, matched: [] });
  });

  it('子序列不成立时返回 null', () => {
    expect(fuzzyMatch('xyz', '读书 books')).toBeNull();
    expect(fuzzyMatch('ba', 'abc')).toBeNull();
  });

  it('大小写不敏感', () => {
    expect(fuzzyMatch('BOOK', 'books')).not.toBeNull();
  });

  it('返回命中下标，供高亮使用', () => {
    const result = fuzzyMatch('bk', 'books');
    expect(result?.matched).toEqual([0, 3]);
  });

  it('连续命中的分数高于分散命中', () => {
    const consecutive = fuzzyMatch('book', 'book list');
    const scattered = fuzzyMatch('book', 'b-o-o-k');
    expect(consecutive!.score).toBeGreaterThan(scattered!.score);
  });

  it('词首命中优先于词中命中', () => {
    const boundary = fuzzyMatch('l', 'my list');
    const middle = fuzzyMatch('l', 'folder');
    expect(boundary!.score).toBeGreaterThan(middle!.score);
  });

  it('同样的命中下，目标越短分数越高', () => {
    const short = fuzzyMatch('set', 'settings');
    const long = fuzzyMatch('set', 'settings and more options');
    expect(short!.score).toBeGreaterThan(long!.score);
  });
});

describe('fuzzyFilter', () => {
  const items = [
    { id: 'home', label: '首页总览', alias: ['home'] },
    { id: 'books', label: '读书', alias: ['books'] },
    { id: 'dev', label: '开发工作', alias: ['dev'] },
  ];

  it('按分数降序返回，并可限制条数', () => {
    const results = fuzzyFilter('o', items, {
      getText: (item) => item.label,
      getKeywords: (item) => item.alias,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);
    // 分数必须单调不增
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('可以用英文别名命中中文条目', () => {
    const results = fuzzyFilter('books', items, {
      getText: (item) => item.label,
      getKeywords: (item) => item.alias,
    });
    expect(results.map((r) => r.item.id)).toContain('books');
  });

  it('limit 生效', () => {
    const results = fuzzyFilter('o', items, {
      limit: 1,
      getText: (item) => item.label,
      getKeywords: (item) => item.alias,
    });
    expect(results).toHaveLength(1);
  });
  it('无命中时返回空数组', () => {
    expect(fuzzyFilter('zzzz', items, { getText: (item) => item.label })).toEqual([]);
  });
});

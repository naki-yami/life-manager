import { describe, expect, it } from 'vitest';
import {
  collectTagStats,
  extractTags,
  hasTag,
  MAX_TAG_COUNT,
  MAX_TAG_LENGTH,
  normalizeTag,
  normalizeTags,
  tagTone,
} from './tags';

describe('normalizeTag', () => {
  it('去掉 # 前缀与首尾空白', () => {
    expect(normalizeTag('  #工作 ')).toBe('工作');
    expect(normalizeTag('＃工作')).toBe('工作');
    expect(normalizeTag('##工作')).toBe('工作');
  });

  it('内部空白压成一个空格', () => {
    expect(normalizeTag('deep   work')).toBe('deep work');
  });

  it('超长截断到上限', () => {
    const long = '一'.repeat(MAX_TAG_LENGTH + 5);
    expect(normalizeTag(long)).toHaveLength(MAX_TAG_LENGTH);
  });

  it('空串与只有 # 的输入归一化为空串', () => {
    expect(normalizeTag('   ')).toBe('');
    expect(normalizeTag('#')).toBe('');
  });
});

describe('normalizeTags', () => {
  it('忽略大小写去重并保留首次出现的写法', () => {
    expect(normalizeTags(['工作', 'Work', 'work ', '#工作'])).toEqual(['工作', 'Work']);
  });

  it('丢弃空值与非字符串', () => {
    expect(normalizeTags(['  ', '#', 42, null, undefined, '健身'])).toEqual(['健身']);
  });

  it('超过上限时截断', () => {
    const many = Array.from({ length: MAX_TAG_COUNT + 4 }, (_, index) => `t${index}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAG_COUNT);
  });

  it('幂等', () => {
    const once = normalizeTags([' 工作 ', 'work', 'WORK']);
    expect(normalizeTags(once)).toEqual(once);
  });
});

describe('hasTag', () => {
  it('忽略大小写与 # 前缀', () => {
    expect(hasTag(['Work'], '#work')).toBe(true);
    expect(hasTag(['工作'], '工作')).toBe(true);
  });

  it('空列表或空标签一律 false', () => {
    expect(hasTag([], '工作')).toBe(false);
    expect(hasTag(undefined, '工作')).toBe(false);
    expect(hasTag(['工作'], '  ')).toBe(false);
  });

  it('不做子串匹配', () => {
    expect(hasTag(['工作安排'], '工作')).toBe(false);
  });
});

describe('tagTone', () => {
  it('同一标签永远同一颜色', () => {
    expect(tagTone('工作')).toBe(tagTone('工作'));
  });

  it('结果落在允许的档位里', () => {
    const tones = new Set(['default', 'accent', 'success', 'warning', 'danger', 'info']);
    for (const tag of ['工作', '健身', '读书', 'a', 'b', 'c', 'deep work']) {
      expect(tones.has(tagTone(tag))).toBe(true);
    }
  });
});

describe('extractTags', () => {
  it('摘出空格分隔的标签', () => {
    expect(extractTags('交周报 #工作 #紧急 明天')).toEqual({
      text: '交周报 明天',
      tags: ['工作', '紧急'],
    });
  });

  it('中文紧贴 # 也能认出来（没有空格）', () => {
    expect(extractTags('写周报#工作')).toEqual({ text: '写周报', tags: ['工作'] });
  });

  it('标点会终止标签，不留孤立标点', () => {
    expect(extractTags('交周报 #工作，明天')).toEqual({
      text: '交周报，明天',
      tags: ['工作'],
    });
  });

  it('C# 这类不算标签', () => {
    expect(extractTags('学 C# 语言')).toEqual({ text: '学 C# 语言', tags: [] });
  });

  it('没有标签时原样返回', () => {
    expect(extractTags('  跑步 30min  ')).toEqual({ text: '  跑步 30min  ', tags: [] });
  });

  it('重复标签只留一个', () => {
    expect(extractTags('#工作 写周报 #工作').tags).toEqual(['工作']);
  });

  it('支持全角 ＃', () => {
    expect(extractTags('买牛奶 ＃家庭')).toEqual({ text: '买牛奶', tags: ['家庭'] });
  });
});

describe('collectTagStats', () => {
  it('按使用次数排序并记录跨模块情况', () => {
    const stats = collectTagStats([
      { tags: ['工作', '紧急'], kind: '任务' },
      { tags: ['工作'], kind: '书' },
      { tags: ['健身'], kind: '训练记录' },
    ]);

    expect(stats).toEqual([
      { tag: '工作', count: 2, kinds: ['书', '任务'] },
      { tag: '健身', count: 1, kinds: ['训练记录'] },
      { tag: '紧急', count: 1, kinds: ['任务'] },
    ]);
  });

  it('同样次数时按标签名排序', () => {
    const stats = collectTagStats([
      { tags: ['b'], kind: '任务' },
      { tags: ['a'], kind: '任务' },
    ]);
    expect(stats.map((item) => item.tag)).toEqual(['a', 'b']);
  });

  it('没有标签时返回空数组', () => {
    expect(collectTagStats([{ kind: '任务' }])).toEqual([]);
  });
});

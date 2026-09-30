import { describe, expect, it } from 'vitest';
import type { JournalEntry, MoodLevel } from '../types';
import {
  MOOD_BARS,
  MOOD_LABELS,
  MOOD_LEVELS,
  MOOD_TONES,
  clampMood,
  formatMood,
  isEmptyDraft,
  journalChars,
  journalEntryOn,
  moodBuckets,
  moodDistribution,
  moodLabel,
  moodPoints,
  moodTone,
  summarizeJournal,
} from './journal';

/**
 * 造一条日记；只写关心的字段，其余走默认值。
 * `mood` 放开成 number：有几条用例专门要喂越界 / 脏数据，看归一化怎么收场。
 */
const entry = (
  patch: Partial<Omit<JournalEntry, 'mood'>> & { date: string; mood?: number },
): JournalEntry => ({
  id: `id-${patch.date}`,
  tags: [],
  text: '',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...patch,
  mood: (patch.mood ?? 0) as MoodLevel,
});

describe('心情档位', () => {
  it('五档只列 1–5，0 是「没记」不在档位表里', () => {
    expect(MOOD_LEVELS).toEqual([1, 2, 3, 4, 5]);
    for (const level of MOOD_LEVELS) {
      expect(MOOD_LABELS[level]).toBeTruthy();
      expect(MOOD_BARS[level]).toBeTruthy();
      expect(MOOD_TONES[level]).toBeTruthy();
    }
  });

  it('clampMood 把数字收进 0–5 的整数档', () => {
    expect(clampMood(-3)).toBe(0);
    expect(clampMood(0)).toBe(0);
    expect(clampMood(7)).toBe(5);
    expect(clampMood(3.5)).toBe(4);
    expect(clampMood(2.4)).toBe(2);
  });

  it('脏数据（NaN / 无穷）落到「没记」，不抛错也不给随机档', () => {
    expect(clampMood(Number.NaN)).toBe(0);
    expect(clampMood(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampMood(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('标签 / 配色 / 文案都按收边后的档位取', () => {
    expect(moodLabel(5)).toBe('很好');
    expect(moodLabel(99)).toBe('很好');
    expect(moodTone(1)).toBe('danger');
    expect(moodTone(5)).toBe('success');
    expect(moodTone(0)).toBe('default');
    expect(formatMood(4)).toBe('4（不错）');
  });

  it('按周聚合出的小数借最近那一档的名字，但数字照原样显示', () => {
    expect(formatMood(3.5)).toBe('3.5（不错）');
  });
});

describe('journalChars', () => {
  it('去掉空白再数：空格、换行、制表与全角空格都不算写下的内容', () => {
    expect(journalChars('你好 世界')).toBe(4);
    expect(journalChars('  你好\n世界\t！  ')).toBe(5);
    expect(journalChars('全角　空格')).toBe(4);
    expect(journalChars('   \n\t  ')).toBe(0);
  });
});

describe('isEmptyDraft', () => {
  it('没心情、没标签、正文也只有空白才算空', () => {
    expect(isEmptyDraft({ mood: 0, tags: [], text: '' })).toBe(true);
    expect(isEmptyDraft({ mood: 0, tags: [], text: '   \n ' })).toBe(true);
  });

  it('任一组内容落笔就不算空', () => {
    expect(isEmptyDraft({ mood: 3, tags: [], text: '' })).toBe(false);
    expect(isEmptyDraft({ mood: 0, tags: ['工作'], text: '' })).toBe(false);
    expect(isEmptyDraft({ mood: 0, tags: [], text: '写了点东西' })).toBe(false);
  });
});

describe('journalEntryOn（一天一条的取法）', () => {
  it('没有这一天就返回 undefined', () => {
    expect(journalEntryOn([entry({ date: '2026-09-29' })], '2026-09-30')).toBeUndefined();
  });

  it('同一天有多条时取最后改过的那条', () => {
    const older = entry({
      date: '2026-09-29',
      id: 'old',
      text: '旧',
      updatedAt: '2026-09-29T08:00:00.000Z',
    });
    const newer = entry({
      date: '2026-09-29',
      id: 'new',
      text: '新',
      updatedAt: '2026-09-29T20:00:00.000Z',
    });

    expect(journalEntryOn([newer, older], '2026-09-29')?.id).toBe('new');
    expect(journalEntryOn([older, newer], '2026-09-29')?.id).toBe('new');
  });
});

describe('moodPoints（心情曲线取数）', () => {
  const entries: JournalEntry[] = [
    entry({ date: '2026-09-25', mood: 2, id: 'a' }),
    entry({ date: '2026-09-27', mood: 0, id: 'b' }),
    entry({ date: '2026-09-28', mood: 5, id: 'c' }),
    entry({ date: '2026-09-30', mood: 4, id: 'd' }),
    entry({ date: '2026-09-20', mood: 1, id: 'outside' }),
  ];

  it('只给记了心情的日子出点：mood=0 的日期不补 0', () => {
    const points = moodPoints(entries, 7, '2026-09-30');

    expect(points.map((point) => point.date)).toEqual(['2026-09-25', '2026-09-28', '2026-09-30']);
    expect(points.map((point) => point.value)).toEqual([2, 5, 4]);
  });

  it('窗口之外的记录不参与', () => {
    const points = moodPoints(entries, 3, '2026-09-30');
    expect(points.map((point) => point.date)).toEqual(['2026-09-28', '2026-09-30']);
  });

  it('按时间升序返回，输入顺序被打乱也一样', () => {
    const shuffled = [entries[3]!, entries[0]!, entries[2]!];
    expect(moodPoints(shuffled, 7, '2026-09-30').map((point) => point.date)).toEqual([
      '2026-09-25',
      '2026-09-28',
      '2026-09-30',
    ]);
  });

  it('同一天多条时只留最后改过的那条', () => {
    const duplicated = [
      entry({ date: '2026-09-29', mood: 1, id: 'old', updatedAt: '2026-09-29T07:00:00.000Z' }),
      entry({ date: '2026-09-29', mood: 5, id: 'new', updatedAt: '2026-09-29T21:00:00.000Z' }),
    ];

    expect(moodPoints(duplicated, 7, '2026-09-30')).toEqual([{ date: '2026-09-29', value: 5 }]);
  });

  it('非法日期的记录被跳过，不会在图上落一个假的点', () => {
    const broken = [entry({ date: '2026/09/29', mood: 4 })];
    expect(moodPoints(broken, 7, '2026-09-30')).toEqual([]);
  });

  it('越界的心情值先收边再上曲线', () => {
    const wild = [entry({ date: '2026-09-29', mood: 99 })];
    expect(moodPoints(wild, 7, '2026-09-30')).toEqual([{ date: '2026-09-29', value: 5 }]);
  });
});

describe('moodBuckets（按周 / 按月求均值）', () => {
  const points = [
    { date: '2026-09-28', value: 2 },
    { date: '2026-09-29', value: 4 },
    { date: '2026-10-01', value: 3 },
    { date: '2026-09-05', value: 5 },
  ];

  it('按周聚合取均值而不是求和：一周三天「一般」不该读成 9 分', () => {
    const buckets = moodBuckets(points, 'week');

    expect(buckets).toEqual([
      { date: '2026-08-31', value: 5 },
      { date: '2026-09-28', value: 3 },
    ]);
  });

  it('按月聚合，日期键取当月 1 号，跨月各归各的', () => {
    const buckets = moodBuckets(points, 'month');

    expect(buckets).toEqual([
      { date: '2026-09-01', value: 3.7 },
      { date: '2026-10-01', value: 3 },
    ]);
  });

  it('均值保留一位小数', () => {
    const week = [
      { date: '2026-09-28', value: 1 },
      { date: '2026-09-29', value: 2 },
      { date: '2026-09-30', value: 2 },
    ];

    expect(moodBuckets(week, 'week')).toEqual([{ date: '2026-09-28', value: 1.7 }]);
  });

  it('空输入返回空数组', () => {
    expect(moodBuckets([], 'week')).toEqual([]);
    expect(moodBuckets([], 'month')).toEqual([]);
  });
});

describe('summarizeJournal', () => {
  it('一篇都没有时全是 0，不给 NaN', () => {
    expect(summarizeJournal([])).toEqual({ total: 0, withMood: 0, average: 0, chars: 0 });
  });

  it('平均分只算记了心情的那几篇', () => {
    const entries = [
      entry({ date: '2026-09-28', mood: 5, text: '好' }),
      entry({ date: '2026-09-29', mood: 3, text: '还行 吧' }),
      entry({ date: '2026-09-30', mood: 0, text: '只写了字' }),
    ];

    expect(summarizeJournal(entries)).toEqual({
      total: 3,
      withMood: 2,
      average: 4,
      chars: 1 + 3 + 4,
    });
  });

  it('平均分保留一位小数', () => {
    const entries = [
      entry({ date: '2026-09-28', mood: 1 }),
      entry({ date: '2026-09-29', mood: 2 }),
      entry({ date: '2026-09-30', mood: 2 }),
    ];

    expect(summarizeJournal(entries).average).toBe(1.7);
  });
});

describe('moodDistribution', () => {
  it('按 1–5 数各有多少篇，没记心情的不计入任何一档', () => {
    const entries = [
      entry({ date: '2026-09-24', mood: 5 }),
      entry({ date: '2026-09-25', mood: 5 }),
      entry({ date: '2026-09-26', mood: 3 }),
      entry({ date: '2026-09-27', mood: 0 }),
    ];

    expect(moodDistribution(entries)).toEqual([
      { level: 1, count: 0 },
      { level: 2, count: 0 },
      { level: 3, count: 1 },
      { level: 4, count: 0 },
      { level: 5, count: 2 },
    ]);
  });

  it('空集合也返回完整的五个档位', () => {
    expect(moodDistribution([]).map((row) => row.count)).toEqual([0, 0, 0, 0, 0]);
  });
});

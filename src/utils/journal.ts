/**
 * 日记与心情的取数与口径。
 *
 * 这里集中三件事：**心情档位怎么取名**、**一天一条怎么找**、**心情曲线怎么算**。
 * 页面只负责画，口径全在这一份里，免得「页面上的平均分」和「统计页的平均分」各算各的。
 */
import type { JournalEntry, MoodLevel } from '../types';
import { isDayKey } from './date';
import { dayRange, monthStartKey, sumOf, weekStartKey } from './stats';
import type { DayPoint } from './stats';

/** 五档心情。0 是「当天没记」，不在这张表里 */
export const MOOD_LEVELS: readonly MoodLevel[] = [1, 2, 3, 4, 5];

export const MOOD_LABELS: Record<MoodLevel, string> = {
  0: '未记',
  1: '很糟',
  2: '不佳',
  3: '一般',
  4: '不错',
  5: '很好',
};

export type MoodTone = 'default' | 'danger' | 'warning' | 'info' | 'success';

/**
 * 从糟到好的配色：两头发红、中间中性、好的一头走绿。
 * 心情本身是有方向的，用分类色（chart-1..8）反而读不出好坏。
 */
export const MOOD_TONES: Record<MoodLevel, MoodTone> = {
  0: 'default',
  1: 'danger',
  2: 'warning',
  3: 'default',
  4: 'info',
  5: 'success',
};

/** 分布条用的实心色，与上面同一套语义色 */
export const MOOD_BARS: Record<MoodLevel, string> = {
  0: 'bg-line-strong',
  1: 'bg-danger',
  2: 'bg-warning',
  3: 'bg-line-strong',
  4: 'bg-info',
  5: 'bg-success',
};

/** 把任意数字收进 0–5 的整数档：喂进来的可能是脏数据，也可能是按周聚合出的平均值 */
export function clampMood(value: number): MoodLevel {
  if (!Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(0, Math.round(value))) as MoodLevel;
}

export function moodLabel(value: number): string {
  return MOOD_LABELS[clampMood(value)];
}

export function moodTone(value: number): MoodTone {
  return MOOD_TONES[clampMood(value)];
}

/** 「4（不错）」；按周聚合出的 3.5 会借最近那一档的名字 */
export function formatMood(value: number): string {
  return `${value}（${moodLabel(value)}）`;
}

/** 正文写了多少字：去掉空白再数，换行与缩进不算「写下的内容」 */
export function journalChars(text: string): number {
  return text.replace(/\s/g, '').length;
}

/** 空草稿：没心情、没标签、没正文。保存空草稿等于删掉这一天 */
export function isEmptyDraft(draft: {
  mood: number;
  tags: readonly string[];
  text: string;
}): boolean {
  return clampMood(draft.mood) === 0 && draft.tags.length === 0 && draft.text.trim() === '';
}

/**
 * 找某一天的日记。
 *
 * 一天一条是 store 的约定，但手改过的备份里可能出现同一天两条，
 * 这时取**最后改过**的那条 —— 页面永远显示用户最近写下的内容。
 */
export function journalEntryOn(
  entries: readonly JournalEntry[],
  date: string,
): JournalEntry | undefined {
  let kept: JournalEntry | undefined;
  for (const entry of entries) {
    if (entry.date !== date) continue;
    if (!kept || kept.updatedAt.localeCompare(entry.updatedAt) < 0) kept = entry;
  }
  return kept;
}

/**
 * 心情曲线：只给**记了心情**的日子。
 *
 * 缺的日子不补 0 —— 补出来的 0 会把折线拽到底，读起来像「那天心情极差」，
 * 而真实情况只是那天没记。同一天多条时取最后改过的那条。
 */
export function moodPoints(
  entries: readonly JournalEntry[],
  days: number,
  endKey: string,
): DayPoint[] {
  const window = new Set(dayRange(endKey, days));
  const byDate = new Map<string, JournalEntry>();
  for (const entry of entries) {
    if (!isDayKey(entry.date) || !window.has(entry.date)) continue;
    if (clampMood(entry.mood) === 0) continue;
    const kept = byDate.get(entry.date);
    if (!kept || kept.updatedAt.localeCompare(entry.updatedAt) < 0) byDate.set(entry.date, entry);
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({ date: entry.date, value: clampMood(entry.mood) }));
}

/**
 * 按周 / 按月取平均心情。
 *
 * 与柱状图的 `bucketize` 有意不同：那边求和（一天的次数加起来就是那一周的量），
 * 心情求和不成立 —— 一周七天都是「一般」不该读成 21 分。所以这里单独做一套求均值的聚合，
 * 日期键仍取周一 / 当月 1 号，和别的图对齐。
 */
export function moodBuckets(points: readonly DayPoint[], mode: 'week' | 'month'): DayPoint[] {
  const keyOf = mode === 'month' ? monthStartKey : weekStartKey;
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const point of points) {
    const bucket = buckets.get(keyOf(point.date)) ?? { sum: 0, count: 0 };
    bucket.sum += point.value;
    bucket.count += 1;
    buckets.set(keyOf(point.date), bucket);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, bucket]) => ({ date, value: round1(bucket.sum / bucket.count) }));
}

export interface JournalSummary {
  /** 写过的篇数 */
  total: number;
  /** 其中记了心情的篇数 */
  withMood: number;
  /** 记了心情那几篇的平均分（一位小数）；一篇都没记心情时为 0 */
  average: number;
  /** 写下的总字数（去空白） */
  chars: number;
}

export function summarizeJournal(entries: readonly JournalEntry[]): JournalSummary {
  const moods = entries.map((entry) => clampMood(entry.mood)).filter((mood) => mood > 0);
  return {
    total: entries.length,
    withMood: moods.length,
    average: moods.length === 0 ? 0 : round1(sumOf(moods) / moods.length),
    chars: entries.reduce((sum, entry) => sum + journalChars(entry.text), 0),
  };
}

/** 1–5 各有多少篇，供分布条与读屏 */
export function moodDistribution(
  entries: readonly JournalEntry[],
): Array<{ level: MoodLevel; count: number }> {
  return MOOD_LEVELS.map((level) => ({
    level,
    count: entries.filter((entry) => clampMood(entry.mood) === level).length,
  }));
}

/** 保留一位小数：心情平均值的精度需求就到这儿 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

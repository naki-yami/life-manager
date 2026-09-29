import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReviewStore } from './reviewStore';
import { STORAGE_KEYS } from '../utils/storageKeys';

const store = () => useReviewStore.getState();
const first = () => store().reviews[0]!;

beforeEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  useReviewStore.setState({ reviews: [] });
});

const answers = (best: string, blocker = '', next = '') => ({ best, blocker, next });

describe('reviewStore 写入', () => {
  it('周复盘按周期起始日 upsert，再写一次是修正而不是新增', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 9, 0, 0));

    store().saveReview('week', '2026-09-29', answers('初稿', '偶尔走神', '接着写'));
    expect(store().reviews).toHaveLength(1);
    expect(first()).toMatchObject({
      period: 'week',
      date: '2026-09-28',
      best: '初稿',
      blocker: '偶尔走神',
      next: '接着写',
    });

    const created = { id: first().id, createdAt: first().createdAt };

    vi.setSystemTime(new Date(2026, 8, 30, 9, 0, 0));
    // 同周的任意一天都落到同一条记录上
    store().saveReview('week', '2026-10-01', answers('改过的'));

    expect(store().reviews).toHaveLength(1);
    expect(first().id).toBe(created.id);
    expect(first().createdAt).toBe(created.createdAt);
    expect(first().best).toBe('改过的');
    expect(first().blocker).toBe('');
    expect(first().updatedAt).not.toBe(created.createdAt);
  });

  it('日复盘与周复盘各写各的，互不覆盖', () => {
    store().saveReview('day', '2026-09-29', answers('今天'));
    store().saveReview('week', '2026-09-29', answers('这周'));

    expect(store().reviews.map((entry) => `${entry.period}:${entry.date}`)).toEqual([
      'day:2026-09-29',
      'week:2026-09-28',
    ]);
  });

  it('回答会去掉首尾空白，空回答也照存', () => {
    store().saveReview('day', '2026-09-29', { best: '  有事  ', blocker: '', next: '\n' });

    expect(first()).toMatchObject({ best: '有事', blocker: '', next: '' });
    expect(first().id).toBeTruthy();
    expect(first().createdAt).toBeTruthy();
  });

  it('非法日期不写入，避免出现定位不了的记录', () => {
    store().saveReview('day', '2026/09/29', answers('a'));
    store().saveReview('week', '', answers('b'));

    expect(store().reviews).toEqual([]);
  });

  it('deleteReview 只删这一条', () => {
    store().saveReview('day', '2026-09-29', answers('今天'));
    store().saveReview('week', '2026-09-29', answers('这周'));
    const id = first().id;

    store().deleteReview(id);

    expect(store().reviews).toHaveLength(1);
    expect(first().period).toBe('week');
  });

  it('replaceReviews 用于导入与清空', () => {
    store().saveReview('day', '2026-09-29', answers('今天'));

    store().replaceReviews([]);
    expect(store().reviews).toEqual([]);

    store().replaceReviews([
      {
        id: 'r9',
        period: 'week',
        date: '2026-09-21',
        best: '导入回来的',
        blocker: '',
        next: '',
        createdAt: '2026-09-21T12:00:00',
        updatedAt: '2026-09-21T12:00:00',
      },
    ]);
    expect(store().reviews).toHaveLength(1);
  });

  it('数据落在 lm:review 上', async () => {
    store().saveReview('day', '2026-09-29', answers('写进存储'));

    await vi.waitFor(() => {
      const raw = localStorage.getItem(STORAGE_KEYS.review);
      expect(raw).toBeTruthy();
      expect(raw).toContain('写进存储');
    });
  });
});

describe('reviewStore 归一化', () => {
  it('旧数据缺字段时补齐成当前结构', async () => {
    localStorage.setItem(
      STORAGE_KEYS.review,
      JSON.stringify({ state: { reviews: [{ id: 'r1', best: '补写的内容' }] }, version: 11 }),
    );

    await useReviewStore.persist.rehydrate();

    expect(first()).toMatchObject({
      id: 'r1',
      period: 'week',
      date: '',
      best: '补写的内容',
      blocker: '',
      next: '',
    });
    expect(first().createdAt).toBeTruthy();
    expect(first().updatedAt).toBeTruthy();
  });

  it('坏掉的记录被丢弃，合法的留下', async () => {
    localStorage.setItem(
      STORAGE_KEYS.review,
      JSON.stringify({
        state: {
          reviews: [{ id: 'ok', period: 'day', date: '2026-09-29', best: '正常' }, 'nonsense', 42],
        },
        version: 11,
      }),
    );

    await useReviewStore.persist.rehydrate();

    expect(store().reviews.map((entry) => entry.id)).toEqual(['ok']);
  });
});

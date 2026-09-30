import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useJournalStore } from './journalStore';
import { STORAGE_KEYS } from '../utils/storageKeys';

const store = () => useJournalStore.getState();
const first = () => store().entries[0]!;

beforeEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  useJournalStore.setState({ entries: [] });
});

const draft = (patch: Partial<{ mood: number; tags: string[]; text: string }> = {}) => ({
  mood: 0,
  tags: [],
  text: '',
  ...patch,
});

describe('journalStore 写入', () => {
  it('按日期 upsert：同一天再写一次是修正，不会攒出第二篇', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 9, 0, 0));

    store().saveEntry('2026-09-29', draft({ mood: 3, text: '初稿' }));
    expect(store().entries).toHaveLength(1);
    expect(first()).toMatchObject({ date: '2026-09-29', mood: 3, tags: [], text: '初稿' });

    const created = { id: first().id, createdAt: first().createdAt };

    vi.setSystemTime(new Date(2026, 8, 29, 21, 0, 0));
    store().saveEntry('2026-09-29', draft({ mood: 5, text: '改过的' }));

    expect(store().entries).toHaveLength(1);
    expect(first().id).toBe(created.id);
    expect(first().createdAt).toBe(created.createdAt);
    expect(first()).toMatchObject({ mood: 5, text: '改过的' });
    expect(first().updatedAt).not.toBe(created.createdAt);
  });

  it('不同的日期各存各的', () => {
    store().saveEntry('2026-09-28', draft({ mood: 2 }));
    store().saveEntry('2026-09-29', draft({ mood: 4 }));

    expect(store().entries.map((entry) => entry.date)).toEqual(['2026-09-28', '2026-09-29']);
  });

  it('标签走统一的清洗：去空格、去重、丢掉不可用的', () => {
    store().saveEntry('2026-09-29', draft({ mood: 3, tags: [' 工作 ', '工作', '', '旅行'] }));

    expect(first().tags).toEqual(['工作', '旅行']);
  });

  it('正文去掉首尾空白；心情越界先收边', () => {
    store().saveEntry('2026-09-29', draft({ mood: 99, text: '  今天还行  ' }));

    expect(first()).toMatchObject({ mood: 5, text: '今天还行' });
  });

  it('非法日期不写入，避免出现定位不了的记录', () => {
    store().saveEntry('2026/09/29', draft({ mood: 3, text: '写不进去' }));
    store().saveEntry('', draft({ mood: 3 }));

    expect(store().entries).toEqual([]);
  });

  it('每次生成的 id 互不重复', () => {
    for (let index = 0; index < 20; index += 1) {
      store().saveEntry(`2026-09-${String(index + 1).padStart(2, '0')}`, draft({ mood: 3 }));
    }

    expect(new Set(store().entries.map((entry) => entry.id)).size).toBe(20);
  });
});

describe('journalStore 清空即删除', () => {
  it('原本写过的那天被清空后再保存，记录直接消失', () => {
    store().saveEntry('2026-09-29', draft({ mood: 3, text: '写过的' }));
    expect(store().entries).toHaveLength(1);

    store().saveEntry('2026-09-29', draft());

    expect(store().entries).toEqual([]);
  });

  it('原本就没有这一天时，保存空草稿不会留下一条空记录', () => {
    store().saveEntry('2026-09-29', draft());

    expect(store().entries).toEqual([]);
  });

  it('只清空一部分内容不算删除：留着心情就还在', () => {
    store().saveEntry('2026-09-29', draft({ mood: 3, text: '写过的' }));
    store().saveEntry('2026-09-29', draft({ mood: 3 }));

    expect(store().entries).toHaveLength(1);
    expect(first()).toMatchObject({ mood: 3, text: '' });
  });

  it('deleteEntry 只删指定的那一条', () => {
    store().saveEntry('2026-09-28', draft({ mood: 2 }));
    store().saveEntry('2026-09-29', draft({ mood: 4 }));
    const [keep, remove] = store().entries;

    store().deleteEntry(remove!.id);

    expect(store().entries.map((entry) => entry.date)).toEqual([keep!.date]);
  });

  it('replaceEntries 整表写入（撤销与导入在用）', () => {
    store().saveEntry('2026-09-29', draft({ mood: 4, text: '原文' }));
    const snapshot = store().entries;

    store().replaceEntries([]);
    expect(store().entries).toEqual([]);

    store().replaceEntries(snapshot);
    expect(store().entries).toHaveLength(1);
    expect(first().text).toBe('原文');
  });
});

describe('journalStore 持久化与归一化', () => {
  it('写入 lm:journal，心情与正文一起落盘', async () => {
    store().saveEntry('2026-09-29', draft({ mood: 4, tags: ['工作'], text: '写进存储' }));

    await vi.waitFor(() => {
      const raw = localStorage.getItem(STORAGE_KEYS.journal);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as { state: { entries: Array<Record<string, unknown>> } };
      expect(parsed.state.entries[0]).toMatchObject({
        date: '2026-09-29',
        mood: 4,
        tags: ['工作'],
        text: '写进存储',
      });
    });
  });

  it('旧数据缺字段时按 schema 补齐', async () => {
    localStorage.setItem(
      STORAGE_KEYS.journal,
      JSON.stringify({ state: { entries: [{ id: 'j1', date: '2026-09-29' }] }, version: 11 }),
    );

    await useJournalStore.persist.rehydrate();

    expect(store().entries[0]).toMatchObject({
      id: 'j1',
      date: '2026-09-29',
      mood: 0,
      tags: [],
      text: '',
    });
    expect(store().entries[0]!.createdAt).toBeTruthy();
  });

  it('归一化时心情被收进 0–5，脏记录被丢弃', async () => {
    localStorage.setItem(
      STORAGE_KEYS.journal,
      JSON.stringify({
        state: {
          entries: [
            { id: 'j1', date: '2026-09-29', mood: 9, text: '越界的' },
            { id: 'j2', date: '2026-09-30', mood: -2 },
            'nonsense',
            42,
          ],
        },
        version: 11,
      }),
    );

    await useJournalStore.persist.rehydrate();

    expect(store().entries.map((entry) => entry.id)).toEqual(['j1', 'j2']);
    expect(store().entries[0]!.mood).toBe(5);
    expect(store().entries[1]!.mood).toBe(0);
  });
});

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  LEGACY_STORAGE_KEYS,
  STORAGE_KEYS,
  appStorageKeys,
  isAppStorageKey,
  migrateLegacyStorageKeys,
} from './storageKeys';

beforeEach(() => {
  localStorage.clear();
});

describe('migrateLegacyStorageKeys', () => {
  it('把旧 key 的数据搬到新 key，并且保留旧 key 作为兜底', () => {
    localStorage.setItem('tasks-storage', '{"state":{"tasks":[]},"version":0}');

    const migrated = migrateLegacyStorageKeys();

    expect(migrated).toEqual([STORAGE_KEYS.tasks]);
    expect(localStorage.getItem(STORAGE_KEYS.tasks)).toBe('{"state":{"tasks":[]},"version":0}');
    expect(localStorage.getItem('tasks-storage')).not.toBeNull();
  });

  it('新 key 已有数据时不覆盖', () => {
    localStorage.setItem('tasks-storage', '旧数据');
    localStorage.setItem(STORAGE_KEYS.tasks, '新数据');

    migrateLegacyStorageKeys();

    expect(localStorage.getItem(STORAGE_KEYS.tasks)).toBe('新数据');
  });

  it('旧 key 不存在时什么都不做', () => {
    expect(migrateLegacyStorageKeys()).toEqual([]);
  });

  it('每个旧 key 都有对应的新 key 映射', () => {
    expect(Object.keys(LEGACY_STORAGE_KEYS)).toHaveLength(8);
    for (const [legacy, next] of Object.entries(LEGACY_STORAGE_KEYS)) {
      expect(legacy.endsWith('-storage')).toBe(true);
      expect(next.startsWith('lm:')).toBe(true);
    }
  });
});

describe('isAppStorageKey', () => {
  it('按 lm: 前缀判断', () => {
    expect(isAppStorageKey(appStorageKeys()[0]!)).toBe(true);
    expect(isAppStorageKey('other')).toBe(false);
  });
});

describe('迁移时机', () => {
  it('storageKeys 模块被求值时就已经完成迁移（保证早于 store 反序列化）', async () => {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem(
      'books-storage',
      JSON.stringify({ state: { books: [{ id: 'b1', title: '旧书' }] }, version: 0 }),
    );

    // 模拟全新的模块图：store 都会 import 这个模块，
    // 所以只要 import 它就等于「store 初始化之前」
    const fresh = await import('./storageKeys');

    expect(localStorage.getItem(fresh.STORAGE_KEYS.books)).not.toBeNull();
  });
});

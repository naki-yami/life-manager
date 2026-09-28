import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  LEGACY_STORAGE_KEYS,
  STORAGE_KEYS,
  appStorageKeys,
  clearAppStorage,
  estimateStorageBytes,
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

describe('clearAppStorage', () => {
  it('只删除本应用的 key，绝不影响同源下的其他数据', () => {
    localStorage.setItem(STORAGE_KEYS.tasks, 'app');
    localStorage.setItem(STORAGE_KEYS.theme, 'app');
    localStorage.setItem('some-other-project', '别人的数据');
    localStorage.setItem('vite-plugin-react', '工具数据');

    const removed = clearAppStorage();

    expect(removed).toHaveLength(2);
    expect(localStorage.getItem(STORAGE_KEYS.tasks)).toBeNull();
    // 回归守卫：旧实现用的是 localStorage.clear()，会把下面这些一起清掉
    expect(localStorage.getItem('some-other-project')).toBe('别人的数据');
    expect(localStorage.getItem('vite-plugin-react')).toBe('工具数据');
  });

  // 回归守卫：快照必须撑过「清除数据」，否则「清除后可回滚」直接失效
  it('保留自动备份快照，保证清除后仍能回滚', () => {
    localStorage.setItem(STORAGE_KEYS.tasks, 'app');
    localStorage.setItem('lm:backup:auto:1759000000000', '{"entries":{}}');

    const removed = clearAppStorage();

    expect(removed).toEqual([STORAGE_KEYS.tasks]);
    expect(localStorage.getItem(STORAGE_KEYS.tasks)).toBeNull();
    expect(localStorage.getItem('lm:backup:auto:1759000000000')).not.toBeNull();
  });
});

describe('estimateStorageBytes', () => {
  it('只统计本应用的 key', () => {
    localStorage.setItem(STORAGE_KEYS.tasks, 'abcd');
    localStorage.setItem('unrelated', 'x'.repeat(1000));

    // key 'lm:tasks'(8) + value(4) = 12 字符 -> 24 字节（UTF-16）
    expect(estimateStorageBytes()).toBe((STORAGE_KEYS.tasks.length + 4) * 2);
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

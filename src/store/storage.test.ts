import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAppData,
  clearStorageFailure,
  getStorageFailure,
  isQuotaExceededError,
  measureAppStorage,
  persistStorage,
  readAppStateEntries,
  readAppValue,
  writeAppValue,
  subscribeStorageFailure,
  type StorageFailure,
} from './storage';
import { useTaskStore } from './taskStore';
import { useUiStore } from './uiStore';
import { STORAGE_KEYS } from '../utils/storageKeys';

function quotaError(): Error {
  const error = new Error('存储空间不足');
  error.name = 'QuotaExceededError';
  return error;
}

const EMPTY_TASKS = JSON.stringify({ state: { tasks: [], memos: [] }, version: 11 });

beforeEach(() => {
  clearStorageFailure();
  useTaskStore.setState({ tasks: [], memos: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
  clearStorageFailure();
});

describe('isQuotaExceededError', () => {
  it('认出各浏览器的配额错误写法', () => {
    expect(isQuotaExceededError(quotaError())).toBe(true);
    expect(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError({ code: 1014 })).toBe(true);
    expect(isQuotaExceededError(new Error('别的错'))).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError('oops')).toBe(false);
  });
});

describe('写入失败的处理', () => {
  it('写满时不抛异常，而是记录失败并通知订阅者', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    const seen: Array<StorageFailure | null> = [];
    const unsubscribe = subscribeStorageFailure((failure) => seen.push(failure));

    expect(() => useTaskStore.getState().addTask('写周报', '', 'high', '')).not.toThrow();

    // 落盘是异步的：失败要等这一轮微任务跑完才会被记下来
    await vi.waitFor(() => expect(getStorageFailure()).not.toBeNull());
    const failure = getStorageFailure();
    expect(failure?.key).toBe(STORAGE_KEYS.tasks);
    expect(failure?.kind).toBe('write');
    expect(failure?.quotaExceeded).toBe(true);
    expect(seen[seen.length - 1]?.key).toBe(STORAGE_KEYS.tasks);
    // 关键：数据还在内存里，用户可以继续操作并立刻导出备份
    expect(useTaskStore.getState().tasks).toHaveLength(1);

    unsubscribe();
  });

  it('同一个 key 恢复写入后告警自动消失', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    useTaskStore.getState().addTask('写周报', '', 'high', '');
    await vi.waitFor(() => expect(getStorageFailure()).not.toBeNull());

    spy.mockRestore();
    useTaskStore.getState().addTask('再写一条', '', 'low', '');

    await vi.waitFor(() => expect(getStorageFailure()).toBeNull());
  });

  it('别的 key 写入成功不会误清掉告警', async () => {
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === STORAGE_KEYS.tasks) throw quotaError();
      original.call(this, key, value);
    });

    useTaskStore.getState().addTask('写周报', '', 'high', '');
    await vi.waitFor(() => expect(getStorageFailure()?.key).toBe(STORAGE_KEYS.tasks));

    useUiStore.getState().toggleDensity();

    // 等「界面偏好」这一笔真的写下去，再确认它没有顺手把任务那边的告警抹掉
    await vi.waitFor(() => expect(localStorage.getItem(STORAGE_KEYS.ui)).not.toBeNull());
    expect(getStorageFailure()?.key).toBe(STORAGE_KEYS.tasks);
  });

  it('取消订阅后不再收到通知', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStorageFailure(listener);
    unsubscribe();

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    useTaskStore.getState().addTask('写周报', '', 'high', '');

    await vi.waitFor(() => expect(getStorageFailure()).not.toBeNull());
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('读取失败的处理', () => {
  it('存的内容不是合法 JSON 时按空数据处理，并上报读失败', async () => {
    localStorage.setItem(STORAGE_KEYS.tasks, 'not-json');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await persistStorage.getItem(STORAGE_KEYS.tasks)).toBeNull();

    const failure = getStorageFailure();
    expect(failure?.key).toBe(STORAGE_KEYS.tasks);
    expect(failure?.kind).toBe('read');
    // 静默把用户数据换成默认值是最不该发生的那种「安静」，所以必须留下日志
    expect(errorSpy).toHaveBeenCalled();
  });

  it('读取本身抛错时按「没存过」处理，不让应用起不来', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('读取被拒绝');
    });

    await expect(readAppValue(STORAGE_KEYS.tasks)).resolves.toBeNull();

    spy.mockRestore();
  });

  it('存过数据时照常解析出对象', async () => {
    localStorage.setItem(STORAGE_KEYS.tasks, EMPTY_TASKS);

    expect(await persistStorage.getItem(STORAGE_KEYS.tasks)).toEqual({
      state: { tasks: [], memos: [] },
      version: 11,
    });
  });
});

describe('读写往返', () => {
  it('写进去能读出来，删掉之后读到空', async () => {
    await writeAppValue(STORAGE_KEYS.books, '书架');

    expect(await readAppValue(STORAGE_KEYS.books)).toBe('书架');

    await persistStorage.removeItem(STORAGE_KEYS.books);

    expect(await readAppValue(STORAGE_KEYS.books)).toBeNull();
  });
});

describe('readAppStateEntries', () => {
  it('取全部模块数据与设置项，但不含自动快照', async () => {
    localStorage.setItem(STORAGE_KEYS.tasks, EMPTY_TASKS);
    localStorage.setItem(STORAGE_KEYS.theme, '"dark"');
    localStorage.setItem('lm:backup:auto:1759000000000', '{"entries":{}}');

    // 主题/密度本来就随备份一起导出，快照当然也要带上它们
    expect(await readAppStateEntries()).toEqual([
      [STORAGE_KEYS.tasks, EMPTY_TASKS],
      [STORAGE_KEYS.theme, '"dark"'],
    ]);
  });
});

describe('measureAppStorage', () => {
  it('只统计本应用占用的字节数，并说明数据落在哪', async () => {
    localStorage.setItem(STORAGE_KEYS.tasks, 'abcd');
    localStorage.setItem('unrelated', 'x'.repeat(1000));

    const usage = await measureAppStorage();

    // key 'lm:tasks'(8) + value(4) = 12 字符 -> 24 字节（UTF-16）
    expect(usage.bytes).toBe((STORAGE_KEYS.tasks.length + 4) * 2);
    expect(usage.backend).toBe('localstorage');
    expect(usage.level).toBe('ok');
  });

  it('超过预警线时标记为 warning', async () => {
    localStorage.setItem(STORAGE_KEYS.tasks, 'x'.repeat(3 * 1024 * 1024));

    expect((await measureAppStorage()).level).toBe('warning');
  });
});

describe('clearAppData', () => {
  it('只删除本应用的 key，绝不影响同源下的其他数据', async () => {
    localStorage.setItem(STORAGE_KEYS.tasks, 'app');
    localStorage.setItem(STORAGE_KEYS.theme, 'app');
    localStorage.setItem('some-other-project', '别人的数据');
    localStorage.setItem('vite-plugin-react', '工具数据');

    const removed = await clearAppData();

    expect(removed).toHaveLength(2);
    expect(localStorage.getItem(STORAGE_KEYS.tasks)).toBeNull();
    // 回归守卫：旧实现用的是 localStorage.clear()，会把下面这些一起清掉
    expect(localStorage.getItem('some-other-project')).toBe('别人的数据');
    expect(localStorage.getItem('vite-plugin-react')).toBe('工具数据');
  });

  // 回归守卫：快照必须撑过「清除数据」，否则「清除后可回滚」直接失效
  it('保留自动备份快照，保证清除后仍能回滚', async () => {
    localStorage.setItem(STORAGE_KEYS.tasks, 'app');
    localStorage.setItem('lm:backup:auto:1759000000000', '{"entries":{}}');

    const removed = await clearAppData();

    expect(removed).toEqual([STORAGE_KEYS.tasks]);
    expect(localStorage.getItem(STORAGE_KEYS.tasks)).toBeNull();
    expect(localStorage.getItem('lm:backup:auto:1759000000000')).not.toBeNull();
  });

  it('显式关掉 keepBackups 时连快照一起清', async () => {
    localStorage.setItem(STORAGE_KEYS.tasks, 'app');
    localStorage.setItem('lm:backup:auto:1759000000000', '{"entries":{}}');

    const removed = await clearAppData({ keepBackups: false });

    expect(removed).toHaveLength(2);
    expect(localStorage.getItem('lm:backup:auto:1759000000000')).toBeNull();
  });
});

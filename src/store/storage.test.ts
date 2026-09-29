import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStorageFailure,
  getStorageFailure,
  isQuotaExceededError,
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
  it('写满时不抛异常，而是记录失败并通知订阅者', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    const seen: Array<StorageFailure | null> = [];
    const unsubscribe = subscribeStorageFailure((failure) => seen.push(failure));

    expect(() => useTaskStore.getState().addTask('写周报', '', 'high', '')).not.toThrow();

    const failure = getStorageFailure();
    expect(failure?.key).toBe(STORAGE_KEYS.tasks);
    expect(failure?.quotaExceeded).toBe(true);
    expect(seen[seen.length - 1]?.key).toBe(STORAGE_KEYS.tasks);
    // 关键：数据还在内存里，用户可以继续操作并立刻导出备份
    expect(useTaskStore.getState().tasks).toHaveLength(1);

    unsubscribe();
  });

  it('同一个 key 恢复写入后告警自动消失', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    useTaskStore.getState().addTask('写周报', '', 'high', '');
    expect(getStorageFailure()).not.toBeNull();

    spy.mockRestore();
    useTaskStore.getState().addTask('再写一条', '', 'low', '');

    expect(getStorageFailure()).toBeNull();
  });

  it('别的 key 写入成功不会误清掉告警', () => {
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
    expect(getStorageFailure()?.key).toBe(STORAGE_KEYS.tasks);

    useUiStore.getState().toggleDensity();

    expect(getStorageFailure()?.key).toBe(STORAGE_KEYS.tasks);
  });

  it('取消订阅后不再收到通知', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStorageFailure(listener);
    unsubscribe();

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    useTaskStore.getState().addTask('写周报', '', 'high', '');

    expect(listener).not.toHaveBeenCalled();
  });
});

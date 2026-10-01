import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSaveStamp, markSaved, resetSaveStamp, subscribeSaveStamp } from './saveStamp';

beforeEach(() => {
  resetSaveStamp();
});

describe('saveStamp', () => {
  it('还没写过时是 null —— 侧栏那行字要能区分「本次没改动」和「刚存过」', () => {
    expect(getSaveStamp()).toBeNull();
  });

  it('markSaved 记下时刻并通知订阅者', () => {
    const listener = vi.fn();
    subscribeSaveStamp(listener);

    markSaved(1_000);

    expect(getSaveStamp()).toBe(1_000);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('时刻没变就不重复通知，避免同一次写入把订阅者刷两遍', () => {
    const listener = vi.fn();
    subscribeSaveStamp(listener);

    markSaved(1_000);
    markSaved(1_000);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('退订之后不再收到通知', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSaveStamp(listener);

    markSaved(1_000);
    unsubscribe();
    markSaved(2_000);

    expect(listener).toHaveBeenCalledTimes(1);
    // 值本身照旧更新，退订只影响通知
    expect(getSaveStamp()).toBe(2_000);
  });
});

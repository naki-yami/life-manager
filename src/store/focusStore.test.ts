import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFocusStore } from './focusStore';
import { STORAGE_KEYS } from '../utils/storageKeys';

const store = () => useFocusStore.getState();
const first = () => store().sessions[0]!;

beforeEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  useFocusStore.setState({ sessions: [], active: null });
});

const startFocus = (overrides: { title?: string; entityId?: string } = {}): void =>
  store().startFocus({
    entityId: overrides.entityId ?? 't1',
    title: overrides.title ?? '写方案',
    target: 'task',
    mode: 'pomodoro',
    plannedMinutes: 25,
  });

describe('focusStore 计时', () => {
  it('开始专注写入进行中的状态，并按 1 – 600 分钟收敛计划时长', () => {
    startFocus();

    expect(store().active).toMatchObject({
      entityId: 't1',
      title: '写方案',
      target: 'task',
      mode: 'pomodoro',
      plannedMinutes: 25,
    });
    expect(store().active?.startedAt).toBeTruthy();
    // 还没结束，不写记录
    expect(store().sessions).toEqual([]);

    store().startFocus({
      entityId: 't2',
      title: '看论文',
      target: 'book',
      mode: 'stopwatch',
      plannedMinutes: 9999,
    });
    expect(store().active?.plannedMinutes).toBe(600);
  });

  it('同一时刻只有一个在跑的专注：再开一个会替换掉上一个', () => {
    startFocus();
    store().startFocus({
      entityId: 't2',
      title: '看论文',
      target: 'book',
      mode: 'pomodoro',
      plannedMinutes: 25,
    });

    expect(store().active?.entityId).toBe('t2');
    expect(store().sessions).toEqual([]);
  });

  it('结束写一条记录：时长取实际经过的分钟，至少 1 分钟', () => {
    vi.useFakeTimers();
    const start = new Date(2026, 8, 29, 9, 0, 0);
    vi.setSystemTime(start);
    startFocus();

    const session = store().finishFocus(new Date(2026, 8, 29, 9, 12, 30));

    expect(session).toMatchObject({
      title: '写方案',
      minutes: 13,
      plannedMinutes: 25,
      posted: false,
    });
    expect(store().active).toBeNull();
    expect(store().sessions).toHaveLength(1);

    // 立刻结束也算 1 分钟，不会出现 0 分钟的噪声记录
    const instant = new Date(2026, 8, 29, 9, 12, 31);
    vi.setSystemTime(instant);
    startFocus({ entityId: 't2', title: '看论文' });
    expect(store().finishFocus(instant)?.minutes).toBe(1);
  });

  it('没有在跑的专注时结束返回 null，不写空记录', () => {
    expect(store().finishFocus()).toBeNull();
    expect(store().sessions).toEqual([]);
  });

  it('取消专注不写记录', () => {
    startFocus();
    store().cancelFocus();

    expect(store().active).toBeNull();
    expect(store().sessions).toEqual([]);
  });

  it('专注算在开始的那一天：跨零点的会话不会跑到第二天', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 23, 50, 0));
    store().startFocus({
      entityId: 't1',
      title: '收尾',
      target: 'task',
      mode: 'stopwatch',
      plannedMinutes: 25,
    });

    store().finishFocus(new Date(2026, 8, 30, 0, 10, 0));

    expect(first().date).toBe('2026-09-29');
    expect(first().minutes).toBe(20);
  });
});

describe('focusStore 记录管理', () => {
  const seed = (): string => {
    startFocus();
    return store().finishFocus(new Date(Date.now() + 60_000))!.id;
  };

  it('回填标记可以置位与撤销', () => {
    const id = seed();

    store().markPosted(id);
    expect(first().posted).toBe(true);

    store().markPosted(id, false);
    expect(first().posted).toBe(false);
  });

  it('删除记录只删这一条', () => {
    const id = seed();
    seed();

    store().deleteSession(id);

    expect(store().sessions).toHaveLength(1);
    expect(store().sessions[0]!.id).not.toBe(id);
  });

  it('replaceSessions 用于导入与清空', () => {
    seed();
    store().replaceSessions([]);
    expect(store().sessions).toEqual([]);
  });

  it('数据落在 lm:focus 上，进行中的专注也会一起存', async () => {
    startFocus();

    await vi.waitFor(() => {
      const raw = localStorage.getItem(STORAGE_KEYS.focus);
      expect(raw).toBeTruthy();
      expect(raw).toContain('写方案');
      expect(raw).toContain('"active"');
    });
  });
});

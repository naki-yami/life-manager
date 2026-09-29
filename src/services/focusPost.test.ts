import { beforeEach, describe, expect, it } from 'vitest';
import { focusHours, postFocusSession } from './focusPost';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useFocusStore } from '../store/focusStore';
import { useGameStore } from '../store/gameStore';
import type { FocusSession } from '../types';

const session = (overrides: Partial<FocusSession> = {}): FocusSession => ({
  id: 's1',
  date: '2026-09-29',
  entityId: 'e1',
  title: '写方案',
  target: 'task',
  mode: 'pomodoro',
  plannedMinutes: 25,
  minutes: 25,
  startedAt: '2026-09-29T09:00:00.000Z',
  endedAt: '2026-09-29T09:25:00.000Z',
  posted: false,
  createdAt: '2026-09-29T09:25:00.000Z',
  ...overrides,
});

/** 把会话登记进 focus store，验证 markPosted 真的落到了记录上 */
const seedSession = (overrides: Partial<FocusSession> = {}): FocusSession => {
  const item = session(overrides);
  useFocusStore.setState({ sessions: [item], active: null });
  return item;
};

beforeEach(() => {
  localStorage.clear();
  useFocusStore.setState({ sessions: [], active: null });
  useDevStore.setState({ projects: [], sessions: [] });
  useBookStore.setState({ books: [], sessions: [] });
  useGameStore.setState({ games: [], sessions: [] });
});

describe('focusHours', () => {
  it('分钟换算成小时并保留两位小数', () => {
    expect(focusHours(25)).toBe(0.42);
    expect(focusHours(30)).toBe(0.5);
    expect(focusHours(120)).toBe(2);
  });

  it('非法或非正数一律算 0 小时', () => {
    expect(focusHours(0)).toBe(0);
    expect(focusHours(-10)).toBe(0);
    expect(focusHours(Number.NaN)).toBe(0);
  });
});

describe('postFocusSession', () => {
  it('开发项目：把时长写成工时流水并同步累计工时', () => {
    const projectId = useDevStore.getState().addProject('Life Manager', '');
    seedSession({ target: 'dev', entityId: projectId, minutes: 90 });

    const outcome = postFocusSession(session({ target: 'dev', entityId: projectId, minutes: 90 }));

    expect(outcome.ok).toBe(true);
    const [work] = useDevStore.getState().sessions;
    expect(work).toMatchObject({ projectId, date: '2026-09-29', hours: 1.5 });
    expect(work!.note).toContain('专注计时');
    expect(useDevStore.getState().projects[0]!.hoursSpent).toBe(1.5);
    expect(useFocusStore.getState().sessions[0]!.posted).toBe(true);
  });

  it('书籍：按分钟写进阅读流水', () => {
    useBookStore.getState().addBook('置身事内', '兰小欢', '');
    const bookId = useBookStore.getState().books[0]!.id;
    seedSession({ target: 'book', entityId: bookId, minutes: 45 });

    const outcome = postFocusSession(session({ target: 'book', entityId: bookId, minutes: 45 }));

    expect(outcome.ok).toBe(true);
    expect(useBookStore.getState().sessions[0]).toMatchObject({
      bookId,
      date: '2026-09-29',
      minutes: 45,
    });
    expect(useFocusStore.getState().sessions[0]!.posted).toBe(true);
  });

  it('游戏：按小时写进游玩流水', () => {
    useGameStore.getState().addGame('Baldur\u2019s Gate 3', 'PC');
    const gameId = useGameStore.getState().games[0]!.id;
    seedSession({ target: 'game', entityId: gameId, minutes: 120 });

    const outcome = postFocusSession(session({ target: 'game', entityId: gameId, minutes: 120 }));

    expect(outcome.ok).toBe(true);
    expect(useGameStore.getState().sessions[0]).toMatchObject({ gameId, hours: 2 });
    expect(useGameStore.getState().games[0]!.hoursPlayed).toBe(2);
  });

  it('任务是勾完成，不写时长流水', () => {
    const outcome = postFocusSession(session({ target: 'task' }));

    expect(outcome).toMatchObject({ ok: false, reason: 'task' });
    expect(useDevStore.getState().sessions).toEqual([]);
    expect(useFocusStore.getState().sessions).toEqual([]);
  });

  it('对象已被删掉时不造挂空 id 的幽灵流水', () => {
    seedSession({ target: 'dev', entityId: 'no-such-project' });

    const outcome = postFocusSession(session({ target: 'dev', entityId: 'no-such-project' }));

    expect(outcome).toMatchObject({ ok: false, reason: 'missing' });
    expect(useDevStore.getState().sessions).toEqual([]);
    expect(useFocusStore.getState().sessions[0]!.posted).toBe(false);
  });

  it('已经回填过的会话不会写第二遍', () => {
    const projectId = useDevStore.getState().addProject('Life Manager', '');
    seedSession({ target: 'dev', entityId: projectId, posted: true });

    const outcome = postFocusSession(session({ target: 'dev', entityId: projectId, posted: true }));

    expect(outcome).toMatchObject({ ok: false, reason: 'posted' });
    expect(useDevStore.getState().sessions).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { FocusSession } from '../types';
import {
  MAX_FOCUS_MINUTES,
  elapsedMinutes,
  elapsedSeconds,
  focusMinutes,
  focusMinutesByDay,
  focusSummary,
  formatFocusDuration,
  isTimeOfDay,
  normalizeTimebox,
} from './focus';

const session = (overrides: Partial<FocusSession> = {}): FocusSession => ({
  id: 's1',
  date: '2026-09-29',
  entityId: 't1',
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

/*
 * 「今日时间轴」那张卡下线之后，刻度 / 吸附 / 重叠分列 / 位置百分比这一整套
 * 排版计算的用例一并撤了 —— 连同实现。这里只留数据层还在用的部分：
 * 时间格式校验、时间盒归一化、专注时长。
 */

describe('时间格式', () => {
  it('isTimeOfDay 只认 24 小时制的 HH:mm', () => {
    expect(isTimeOfDay('06:00')).toBe(true);
    expect(isTimeOfDay('23:59')).toBe(true);
    expect(isTimeOfDay('24:00')).toBe(false);
    expect(isTimeOfDay('9:00')).toBe(false);
    expect(isTimeOfDay('09:60')).toBe(false);
    expect(isTimeOfDay(900)).toBe(false);
  });
});

describe('时间盒', () => {
  it('normalizeTimebox 收下合法时间盒', () => {
    expect(normalizeTimebox({ date: '2026-09-29', start: '09:00', minutes: 90 })).toEqual({
      date: '2026-09-29',
      start: '09:00',
      minutes: 90,
    });
  });

  it('任何一项不合法都退回 null（= 没排）', () => {
    expect(normalizeTimebox(null)).toBeNull();
    expect(normalizeTimebox('09:00')).toBeNull();
    expect(normalizeTimebox({ date: '2026/09/29', start: '09:00', minutes: 60 })).toBeNull();
    expect(normalizeTimebox({ date: '2026-09-29', start: '25:00', minutes: 60 })).toBeNull();
    expect(
      normalizeTimebox({ date: '2026-09-29', start: '09:00', minutes: Number.NaN }),
    ).toBeNull();
    expect(normalizeTimebox({ date: '2026-09-29', start: '09:00', minutes: '60' })).toBeNull();
  });

  it('时长越界时夹到合法范围而不是丢掉整条时间盒', () => {
    expect(normalizeTimebox({ date: '2026-09-29', start: '09:00', minutes: 5 })).toEqual({
      date: '2026-09-29',
      start: '09:00',
      minutes: 15,
    });
    expect(normalizeTimebox({ date: '2026-09-29', start: '09:00', minutes: 9999 })).toEqual({
      date: '2026-09-29',
      start: '09:00',
      minutes: 600,
    });
  });
});

describe('专注时长', () => {
  it('formatFocusDuration 说人话', () => {
    expect(formatFocusDuration(0)).toBe('0 分钟');
    expect(formatFocusDuration(45)).toBe('45 分钟');
    expect(formatFocusDuration(60)).toBe('1 小时');
    expect(formatFocusDuration(85)).toBe('1 小时 25 分');
    expect(formatFocusDuration(600)).toBe('10 小时');
  });

  it('focusMinutes 夹在 1 – 600 之间，脏数据退回 1', () => {
    expect(focusMinutes(25)).toBe(25);
    expect(focusMinutes(0)).toBe(1);
    expect(focusMinutes(12.4)).toBe(12);
    expect(focusMinutes(9999)).toBe(MAX_FOCUS_MINUTES);
    expect(focusMinutes('25')).toBe(1);
    expect(focusMinutes(Number.NaN)).toBe(1);
  });

  it('elapsedSeconds / elapsedMinutes 按已过去的时间算，未来时间记 0', () => {
    const start = '2026-09-29T09:00:00.000Z';
    expect(elapsedSeconds(start, new Date('2026-09-29T09:00:30.000Z'))).toBe(30);
    expect(elapsedMinutes(start, new Date('2026-09-29T09:00:30.000Z'))).toBe(1);
    expect(elapsedMinutes(start, new Date('2026-09-29T09:25:00.000Z'))).toBe(25);
    expect(elapsedSeconds(start, new Date('2026-09-29T08:59:00.000Z'))).toBe(0);
    expect(elapsedMinutes('不是时间', new Date('2026-09-29T09:25:00.000Z'))).toBe(0);
  });

  it('focusSummary 汇总某一天的总时长与次数', () => {
    const sessions = [
      session({ id: 'a', minutes: 25 }),
      session({ id: 'b', minutes: 45 }),
      session({ id: 'c', date: '2026-09-28', minutes: 30 }),
    ];
    expect(focusSummary(sessions, '2026-09-29')).toEqual({ minutes: 70, count: 2 });
    expect(focusSummary(sessions, '2026-09-27')).toEqual({ minutes: 0, count: 0 });
  });

  it('focusMinutesByDay 按给定日期顺序给出每天的分钟数', () => {
    const sessions = [
      session({ id: 'a', date: '2026-09-28', minutes: 30 }),
      session({ id: 'b', date: '2026-09-29', minutes: 25 }),
      session({ id: 'c', date: '2026-09-29', minutes: 15 }),
    ];
    expect(focusMinutesByDay(sessions, ['2026-09-27', '2026-09-28', '2026-09-29'])).toEqual([
      0, 30, 40,
    ]);
  });
});

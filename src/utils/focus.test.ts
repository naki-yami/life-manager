import { describe, expect, it } from 'vitest';
import type { FocusSession, Task } from '../types';
import {
  MAX_FOCUS_MINUTES,
  TIMELINE_MINUTES,
  elapsedMinutes,
  elapsedSeconds,
  focusMinutes,
  focusMinutesByDay,
  focusSummary,
  formatFocusDuration,
  isTimeOfDay,
  layoutTimeboxes,
  minutesToTime,
  normalizeTimebox,
  snapMinutes,
  snapToSlot,
  timeToMinutes,
  timeboxEnd,
  timeboxRangeLabel,
  timeboxedTasks,
  timelinePosition,
  timelineSlots,
} from './focus';

const task = (id: string, start: string, minutes: number, date = '2026-09-29'): Task => ({
  id,
  title: `任务 ${id}`,
  description: '',
  priority: 'medium',
  status: 'pending',
  dueDate: '',
  subtasks: [],
  repeat: null,
  timebox: { date, start, minutes },
  tags: [],
  createdAt: '2026-09-29T00:00:00.000Z',
});

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

describe('时间解析', () => {
  it('isTimeOfDay 只认 24 小时制的 HH:mm', () => {
    expect(isTimeOfDay('06:00')).toBe(true);
    expect(isTimeOfDay('23:59')).toBe(true);
    expect(isTimeOfDay('24:00')).toBe(false);
    expect(isTimeOfDay('9:00')).toBe(false);
    expect(isTimeOfDay('09:60')).toBe(false);
    expect(isTimeOfDay(900)).toBe(false);
  });

  it('timeToMinutes 与 minutesToTime 互逆', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);
    expect(timeToMinutes('9:30')).toBeNull();
    expect(timeToMinutes(undefined)).toBeNull();

    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(1439)).toBe('23:59');
    // 跨天按取模回绕，负数也不会画出 '-1:00' 这种时间
    expect(minutesToTime(1440)).toBe('00:00');
    expect(minutesToTime(-30)).toBe('23:30');
  });

  it('时间轴刻度是 06:00–23:30 的 30 分钟格', () => {
    const slots = timelineSlots();
    expect(slots).toHaveLength(36);
    expect(slots[0]).toBe('06:00');
    expect(slots[slots.length - 1]).toBe('23:30');
  });
});

describe('吸附', () => {
  it('开始时间吸附到 30 分钟刻度并夹在时间轴内', () => {
    expect(snapToSlot(9 * 60 + 10)).toBe(9 * 60);
    expect(snapToSlot(9 * 60 + 20)).toBe(9 * 60 + 30);
    // 早于 06:00 与晚于 23:30 的落点都会被夹回来
    expect(snapToSlot(3 * 60)).toBe(6 * 60);
    expect(snapToSlot(23 * 60 + 50)).toBe(23 * 60 + 30);
  });

  it('时长吸附按 15 分钟取整并夹在 15 分钟 – 10 小时之间', () => {
    expect(snapMinutes(52)).toBe(45);
    expect(snapMinutes(53)).toBe(60);
    expect(snapMinutes(0)).toBe(15);
    expect(snapMinutes(-20)).toBe(15);
    expect(snapMinutes(99999)).toBe(600);
    expect(snapMinutes(Number.NaN)).toBe(15);
    expect(snapMinutes('30')).toBe(15);
  });
});

describe('时间盒', () => {
  it('结束时刻与区间文案', () => {
    const box = { date: '2026-09-29', start: '09:00', minutes: 90 };
    expect(timeboxEnd(box)).toBe(630);
    expect(timeboxRangeLabel(box)).toBe('09:00–10:30');
  });

  it('跨到第二天的盒子收口成 24:00，不写成 00:00', () => {
    expect(timeboxRangeLabel({ date: '2026-09-29', start: '23:00', minutes: 120 })).toBe(
      '23:00–24:00',
    );
  });

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

  it('timeboxedTasks 只取那一天的盒子并按开始时间排序', () => {
    const tasks = [
      task('a', '14:00', 60),
      task('b', '09:00', 60),
      task('c', '09:00', 30),
      task('d', '10:00', 60, '2026-09-30'),
      { ...task('e', '08:00', 60), timebox: null },
    ];

    expect(timeboxedTasks(tasks, '2026-09-29').map((item) => item.task.id)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });

  it('没排时间盒的任务不会出现在时间轴上', () => {
    const noBox: Task = { ...task('a', '09:00', 60), timebox: null };
    expect(timeboxedTasks([noBox], '2026-09-29')).toEqual([]);
  });
});

describe('layoutTimeboxes', () => {
  it('互不重叠的盒子各占整宽', () => {
    const laid = layoutTimeboxes([
      { id: 'a', title: 'A', start: 540, minutes: 60 },
      { id: 'b', title: 'B', start: 660, minutes: 60 },
    ]);
    expect(laid.map((box) => [box.id, box.lane, box.lanes])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ]);
  });

  it('重叠的盒子并排分列，同一组共用列数', () => {
    const laid = layoutTimeboxes([
      { id: 'a', title: 'A', start: 540, minutes: 60 },
      { id: 'b', title: 'B', start: 570, minutes: 60 },
    ]);
    expect(laid.map((box) => [box.id, box.lane, box.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
    ]);
  });

  it('链条式重叠只需两列：前一个结束后，第三个盒子回到第一列', () => {
    const laid = layoutTimeboxes([
      { id: 'a', title: 'A', start: 540, minutes: 60 },
      { id: 'b', title: 'B', start: 570, minutes: 60 },
      { id: 'c', title: 'C', start: 600, minutes: 60 },
    ]);
    // a、b、c 首尾相接而不是两两同时进行，所以并排两列就够（c 回收 a 空出的第一列）
    expect(laid.map((box) => [box.id, box.lane, box.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 2],
    ]);
  });

  it('不相干的一组不会被另一组的重叠压窄', () => {
    const laid = layoutTimeboxes([
      { id: 'a', title: 'A', start: 540, minutes: 60 },
      { id: 'b', title: 'B', start: 570, minutes: 60 },
      { id: 'c', title: 'C', start: 780, minutes: 60 },
    ]);
    expect(laid.map((box) => [box.id, box.lane, box.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
    ]);
  });
});

describe('timelinePosition', () => {
  it('按时间轴总长换算成百分比', () => {
    const at = timelinePosition(6 * 60, 30);
    expect(at.top).toBe(0);
    expect(at.height).toBeCloseTo((30 / TIMELINE_MINUTES) * 100, 6);

    const noon = timelinePosition(12 * 60, 60);
    expect(noon.top).toBeCloseTo((360 / TIMELINE_MINUTES) * 100, 6);
  });

  it('轴外的部分被夹掉，不会溢出时间轴', () => {
    expect(timelinePosition(3 * 60, 60).top).toBe(0);
    const late = timelinePosition(23 * 60 + 30, 120);
    expect(late.top + late.height).toBeCloseTo(100, 6);
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

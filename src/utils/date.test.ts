import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatDayLabel,
  formatDuration,
  formatMonthLabel,
  formatNumber,
  formatShortDate,
  greeting,
  todayKey,
} from './date';

describe('date utils', () => {
  it('todayKey 输出 YYYY-MM-DD', () => {
    expect(todayKey(new Date('2026-09-28T10:00:00Z'))).toBe('2026-09-28');
  });

  it('addDays 按本地日历加减，跨月与跨年都正确', () => {
    expect(addDays('2026-09-28', 1)).toBe('2026-09-29');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-09-28', 1)).toBe(addDays(addDays('2026-09-28', 1), 0));
  });

  it('addDays 遇到非法输入时原样返回', () => {
    expect(addDays('', 1)).toBe('');
    expect(addDays('2026-09', 1)).toBe('2026-09');
  });

  it('formatDayLabel 带出月日与星期', () => {
    expect(formatDayLabel('2026-09-28')).toContain('9月28日');
    expect(formatDayLabel('2026-09-28')).toContain('周一');
    expect(formatDayLabel('bad')).toBe('bad');
  });

  it('formatNumber 加千分位，formatDuration 拆分小时与分钟', () => {
    expect(formatNumber(12345)).toBe('12,345');
    expect(formatDuration(0.5)).toBe('30 分钟');
    expect(formatDuration(2)).toBe('2 小时');
    expect(formatDuration(1.5)).toBe('1 小时 30 分');
  });
});

describe('formatMonthLabel', () => {
  it('输出「N 月」，非法输入原样返回', () => {
    expect(formatMonthLabel('2026-09-01')).toBe('9 月');
    expect(formatMonthLabel('2026-12-01')).toBe('12 月');
    expect(formatMonthLabel('bad')).toBe('bad');
  });
});

describe('formatShortDate', () => {
  it('输出「月/日」，非法输入原样返回', () => {
    expect(formatShortDate('2026-09-28')).toBe('9/28');
    expect(formatShortDate('2026-12-05')).toBe('12/5');
    expect(formatShortDate('bad')).toBe('bad');
  });
});

describe('daysBetween', () => {
  it('计算 to - from 的天数，跨月与跨年为负也正确', () => {
    expect(daysBetween('2026-09-01', '2026-09-28')).toBe(27);
    expect(daysBetween('2026-09-28', '2026-09-28')).toBe(0);
    expect(daysBetween('2026-09-28', '2026-09-01')).toBe(-27);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
  });

  it('非法输入返回 null，由调用方决定怎么展示', () => {
    expect(daysBetween('bad', '2026-09-28')).toBeNull();
    expect(daysBetween('2026-09-28', '')).toBeNull();
  });
});

describe('greeting', () => {
  it('按小时段返回问候语', () => {
    expect(greeting(3)).toBe('夜深了');
    expect(greeting(8)).toBe('早上好');
    expect(greeting(13)).toBe('中午好');
    expect(greeting(16)).toBe('下午好');
    expect(greeting(21)).toBe('晚上好');
  });
});

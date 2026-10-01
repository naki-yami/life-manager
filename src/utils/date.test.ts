import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKeyOf,
  daysBetween,
  formatDayLabel,
  formatDuration,
  formatMonthLabel,
  formatNumber,
  formatShortDate,
  greeting,
  isoWeekNumber,
  relativeTimeLabel,
  todayKey,
  weekdayName,
} from './date';

describe('date utils', () => {
  it('todayKey 输出 YYYY-MM-DD', () => {
    expect(todayKey(new Date('2026-09-28T10:00:00Z'))).toBe('2026-09-28');
  });

  it('todayKey 用本地日历，不用 UTC 日期', () => {
    // 用本地字段构造，避免测试结果随运行环境的时区变化
    expect(todayKey(new Date(2026, 8, 28, 0, 30))).toBe('2026-09-28');
    expect(todayKey(new Date(2026, 8, 28, 23, 30))).toBe('2026-09-28');
    // 旧实现走 toISOString()，在东八区（UTC+8）凌晨这两个时刻都会算成 9-27
    expect(todayKey(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
    expect(todayKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
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

describe('dayKeyOf', () => {
  it('时间戳换算成本地日期键', () => {
    const iso = '2026-09-28T17:30:00.000Z';
    expect(dayKeyOf(iso)).toBe(todayKey(new Date(iso)));
  });

  it('本来就是日期键的原样返回，不受时区影响', () => {
    expect(dayKeyOf('2026-09-28')).toBe('2026-09-28');
    expect(dayKeyOf('2026-01-01')).toBe('2026-01-01');
  });

  it('Date 也能直接转', () => {
    expect(dayKeyOf(new Date(2026, 8, 28, 0, 30))).toBe('2026-09-28');
  });

  it('空值与坏时间戳返回 undefined，由调用方兜底', () => {
    expect(dayKeyOf(undefined)).toBeUndefined();
    expect(dayKeyOf(null)).toBeUndefined();
    expect(dayKeyOf('')).toBeUndefined();
    expect(dayKeyOf('不是时间')).toBeUndefined();
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

describe('weekdayName', () => {
  it('用中文念星期，和 formatLongDate 里那截保持一致', () => {
    expect(weekdayName(new Date(2026, 9, 1))).toBe('星期四');
    expect(weekdayName(new Date(2026, 9, 4))).toBe('星期日');
  });
});

describe('isoWeekNumber', () => {
  it('按 ISO 8601 算周序号', () => {
    expect(isoWeekNumber(new Date(2026, 9, 1))).toBe(40);
    expect(isoWeekNumber(new Date(2026, 0, 1))).toBe(1);
  });

  it('跨年那几天归到含 1 月 4 日的那一周，不会冒出第 0 周', () => {
    // 2025-12-29 是周一，属于 2026 年的第 1 周
    expect(isoWeekNumber(new Date(2025, 11, 29))).toBe(1);
    // 2027-01-01 是周五，仍算 2026 年的第 53 周
    expect(isoWeekNumber(new Date(2027, 0, 1))).toBe(53);
  });

  it('时分秒不参与计算：同一天不同时刻结果一样', () => {
    expect(isoWeekNumber(new Date(2026, 9, 1, 0, 0))).toBe(
      isoWeekNumber(new Date(2026, 9, 1, 23, 59)),
    );
  });
});

describe('relativeTimeLabel', () => {
  const at = new Date(2026, 9, 1, 9, 12, 0).getTime();

  it('一分钟以内说「刚刚」', () => {
    expect(relativeTimeLabel(at, at)).toBe('刚刚');
    expect(relativeTimeLabel(at, at + 30_000)).toBe('刚刚');
  });

  it('一小时以内给分钟数', () => {
    expect(relativeTimeLabel(at, at + 3 * 60_000)).toBe('3 分钟前');
    expect(relativeTimeLabel(at, at + 59 * 60_000)).toBe('59 分钟前');
  });

  it('超过一小时直接给钟点 —— 「5 小时前」还得自己换算', () => {
    expect(relativeTimeLabel(at, at + 5 * 3_600_000)).toBe('09:12');
  });

  it('时钟回拨导致的负数不会渲染成「-1 分钟前」', () => {
    expect(relativeTimeLabel(at, at - 10_000)).toBe('刚刚');
  });
});

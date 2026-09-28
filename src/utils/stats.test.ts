import { describe, expect, it } from 'vitest';
import {
  activeDays,
  averageOf,
  currentStreak,
  dayRange,
  heatLevel,
  normalizeToUnit,
  percentOf,
  seriesByDay,
  sumOf,
  sumSeries,
  weekdayIndex,
} from './stats';

describe('dayRange', () => {
  it('含结束日、按时间升序，长度等于天数', () => {
    expect(dayRange('2026-09-28', 3)).toEqual(['2026-09-26', '2026-09-27', '2026-09-28']);
  });

  it('跨月正确，天数非正时返回空数组', () => {
    expect(dayRange('2026-10-01', 2)).toEqual(['2026-09-30', '2026-10-01']);
    expect(dayRange('2026-10-01', 0)).toEqual([]);
  });
});

describe('seriesByDay', () => {
  const items = [
    { at: '2026-09-28', n: 2 },
    { at: '2026-09-28', n: 3 },
    { at: '2026-09-26', n: 1 },
    { at: undefined, n: 9 },
    { at: '2026-01-01', n: 9 },
  ];

  it('按天求和、缺失日期补 0、区间外的记录被忽略', () => {
    const series = seriesByDay(
      items,
      3,
      '2026-09-28',
      (item) => item.at,
      (item) => item.n,
    );
    expect(series).toEqual([
      { date: '2026-09-26', value: 1 },
      { date: '2026-09-27', value: 0 },
      { date: '2026-09-28', value: 5 },
    ]);
  });

  it('默认按条数计数', () => {
    const series = seriesByDay(items.slice(0, 3), 3, '2026-09-28', (item) => item.at);
    expect(series.map((point) => point.value)).toEqual([1, 0, 2]);
  });
});

describe('heatLevel', () => {
  it('0 与负数都是 0 级', () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(-1, 10)).toBe(0);
  });

  it('按比例分四档，任何正数至少 1 级', () => {
    expect(heatLevel(1, 100)).toBe(1);
    expect(heatLevel(25, 100)).toBe(1);
    expect(heatLevel(26, 100)).toBe(2);
    expect(heatLevel(100, 100)).toBe(4);
  });

  it('最大值缺失时退化为 0 级，避免除零', () => {
    expect(heatLevel(5, 0)).toBe(0);
  });
});

describe('normalizeToUnit', () => {
  it('线性归一到 0..1', () => {
    expect(normalizeToUnit([0, 5, 10])).toEqual([0, 0.5, 1]);
  });

  it('全等时统一给 0.5，全 0 时给 0', () => {
    expect(normalizeToUnit([3, 3])).toEqual([0.5, 0.5]);
    expect(normalizeToUnit([0, 0])).toEqual([0, 0]);
    expect(normalizeToUnit([])).toEqual([]);
  });
});

describe('percentOf / averageOf / sumOf', () => {
  it('百分比取整，分母为 0 时返回 0', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(3, 3)).toBe(100);
    expect(percentOf(1, 0)).toBe(0);
  });

  it('平均值取整，空数组返回 0', () => {
    expect(averageOf([1, 2, 4])).toBe(2);
    expect(averageOf([])).toBe(0);
    expect(sumOf([1, 2, 3])).toBe(6);
  });
});

describe('activeDays / currentStreak', () => {
  const series = [
    { date: '2026-09-25', value: 2 },
    { date: '2026-09-26', value: 0 },
    { date: '2026-09-27', value: 1 },
    { date: '2026-09-28', value: 3 },
  ];

  it('activeDays 只留下有记录的天', () => {
    expect(activeDays(series)).toEqual(['2026-09-25', '2026-09-27', '2026-09-28']);
  });

  it('从今天往前数连续天数，中间断了就停', () => {
    expect(currentStreak(series, '2026-09-28')).toBe(2);
    expect(currentStreak(series, '2026-09-29')).toBe(0);
  });
});

describe('weekdayIndex', () => {
  it('周一为 0、周日为 6', () => {
    expect(weekdayIndex('2026-09-28')).toBe(0);
    expect(weekdayIndex('2026-10-04')).toBe(6);
  });

  it('非法输入返回 0', () => {
    expect(weekdayIndex('bad')).toBe(0);
  });
});

describe('sumSeries', () => {
  it('逐日相加并按日期升序', () => {
    const merged = sumSeries(
      [
        { date: '2026-09-28', value: 2 },
        { date: '2026-09-27', value: 1 },
      ],
      [
        { date: '2026-09-28', value: 3 },
        { date: '2026-09-26', value: 5 },
      ],
    );
    expect(merged).toEqual([
      { date: '2026-09-26', value: 5 },
      { date: '2026-09-27', value: 1 },
      { date: '2026-09-28', value: 5 },
    ]);
  });

  it('空输入返回空数组', () => {
    expect(sumSeries()).toEqual([]);
    expect(sumSeries([])).toEqual([]);
  });
});

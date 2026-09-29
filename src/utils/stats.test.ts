import { describe, expect, it } from 'vitest';
import {
  activeDays,
  averageOf,
  currentStreak,
  dayRange,
  heatLevel,
  monthBuckets,
  normalizeToUnit,
  percentOf,
  seriesByDay,
  seriesByMonth,
  seriesByWeek,
  monthStartKey,
  splitWindow,
  changeRate,
  weekStartKey,
  sumOf,
  sumSeries,
  weekBuckets,
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

describe('weekStartKey / monthStartKey', () => {
  it('周一为起点：周一归本周，周日归上一周', () => {
    expect(weekStartKey('2026-09-28')).toBe('2026-09-28');
    expect(weekStartKey('2026-10-01')).toBe('2026-09-28');
    expect(weekStartKey('2026-09-27')).toBe('2026-09-21');
  });

  it('月份键统一归到 1 号', () => {
    expect(monthStartKey('2026-09-28')).toBe('2026-09-01');
  });
});

describe('seriesByWeek', () => {
  const items = [
    { at: '2026-09-28', n: 3 },
    { at: '2026-09-29', n: 4 },
    { at: '2026-09-22', n: 2 },
    { at: '2026-09-14', n: 1 },
    { at: undefined, n: 9 },
  ];

  it('按自然周求和，日期键是当周周一，缺失周补 0', () => {
    const series = seriesByWeek(
      items,
      3,
      '2026-09-28',
      (item) => item.at,
      (item) => item.n,
    );
    expect(series).toEqual([
      { date: '2026-09-14', value: 1 },
      { date: '2026-09-21', value: 2 },
      { date: '2026-09-28', value: 7 },
    ]);
  });

  it('默认每条记录算 1 次，周数非正时返回空数组', () => {
    const series = seriesByWeek(items, 1, '2026-09-28', (item) => item.at);
    expect(series).toEqual([{ date: '2026-09-28', value: 2 }]);
    expect(seriesByWeek(items, 0, '2026-09-28', (item) => item.at)).toEqual([]);
  });
});

describe('seriesByMonth', () => {
  it('按自然月求和，跨年也能正确往前推', () => {
    const items = [
      { at: '2026-01-15', n: 2 },
      { at: '2025-12-31', n: 5 },
      { at: '2025-11-02', n: 1 },
    ];
    const series = seriesByMonth(
      items,
      3,
      '2026-01-15',
      (item) => item.at,
      (item) => item.n,
    );
    expect(series).toEqual([
      { date: '2025-11-01', value: 1 },
      { date: '2025-12-01', value: 5 },
      { date: '2026-01-01', value: 2 },
    ]);
  });

  it('同月多条记录合并到一格', () => {
    const items = [
      { at: '2026-09-02', n: 1 },
      { at: '2026-09-28', n: 4 },
    ];
    expect(
      seriesByMonth(
        items,
        1,
        '2026-09-28',
        (item) => item.at,
        (item) => item.n,
      ),
    ).toEqual([{ date: '2026-09-01', value: 5 }]);
  });
});

describe('weekBuckets / monthBuckets', () => {
  // 2026-09-21 是周一，09-27 是周日，09-28 是下一周的周一，10-02 是周五
  const daily = [
    { date: '2026-09-21', value: 1 },
    { date: '2026-09-22', value: 2 },
    { date: '2026-09-27', value: 4 },
    { date: '2026-09-28', value: 8 },
    { date: '2026-10-02', value: 16 },
  ];

  it('按自然周合并到周一，跨周不串台', () => {
    expect(weekBuckets(daily)).toEqual([
      { date: '2026-09-21', value: 7 },
      { date: '2026-09-28', value: 24 },
    ]);
  });

  it('按自然月合并到当月 1 号', () => {
    expect(monthBuckets(daily)).toEqual([
      { date: '2026-09-01', value: 15 },
      { date: '2026-10-01', value: 16 },
    ]);
  });

  it('空序列返回空数组', () => {
    expect(weekBuckets([])).toEqual([]);
    expect(monthBuckets([])).toEqual([]);
  });

  it('乱序输入按日期重新排序', () => {
    const shuffled = [daily[4]!, daily[0]!, daily[3]!, daily[1]!, daily[2]!];
    expect(weekBuckets(shuffled)).toEqual(weekBuckets(daily));
    expect(monthBuckets(shuffled)).toEqual(monthBuckets(daily));
  });
});

describe('changeRate', () => {
  it('按上期计算百分比并四舍五入', () => {
    expect(changeRate(120, 100)).toBe(20);
    expect(changeRate(80, 100)).toBe(-20);
    expect(changeRate(1, 3)).toBe(-67);
  });

  it('上期为 0 时不会出现 Infinity', () => {
    expect(changeRate(5, 0)).toBe(100);
    expect(changeRate(0, 0)).toBe(0);
  });
});

describe('splitWindow', () => {
  it('把区间对半切开，偶数长度时两半等长', () => {
    const series = dayRange('2026-09-28', 4).map((date, index) => ({ date, value: index + 1 }));
    expect(splitWindow(series)).toEqual({ current: 7, previous: 3 });
  });

  it('长度为奇数时本期取最后半天，上期取紧挨着的前半天', () => {
    const series = dayRange('2026-09-28', 3).map((date, index) => ({ date, value: index + 1 }));
    expect(splitWindow(series)).toEqual({ current: 3, previous: 2 });
  });

  it('空区间返回全 0', () => {
    expect(splitWindow([])).toEqual({ current: 0, previous: 0 });
  });
});

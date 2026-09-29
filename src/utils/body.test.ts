import { describe, expect, it } from 'vitest';
import type { BodyMetric } from '../types';
import { addDays } from './date';
import {
  MAX_BODY_FAT,
  MAX_BODY_READING,
  MAX_TREND_POINTS,
  bodyEntries,
  bodyFatOf,
  bodyPoints,
  bodyValueOf,
  changeFromPrevious,
  formatDelta,
  formatMetric,
  hasAnyValue,
  latestPoint,
  measurementFields,
  measurementLabel,
  measurementOf,
  readMetric,
  sanitizeMeasurements,
  sortedMetrics,
  weightOf,
} from './body';

const metric = (date: string, patch: Partial<BodyMetric> = {}): BodyMetric => ({
  id: `id-${date}`,
  date,
  measurements: {},
  createdAt: `${date}T09:00:00.000Z`,
  ...patch,
});

describe('readMetric', () => {
  it('非数字与非正数一律当成「没记」', () => {
    expect(readMetric(undefined, 'weight')).toBeUndefined();
    expect(readMetric('70', 'weight')).toBeUndefined();
    expect(readMetric(Number.NaN, 'weight')).toBeUndefined();
    expect(readMetric(Number.POSITIVE_INFINITY, 'weight')).toBeUndefined();
    expect(readMetric(0, 'weight')).toBeUndefined();
    expect(readMetric(-3, 'weight')).toBeUndefined();
  });

  it('保留一位小数', () => {
    expect(readMetric(70.44, 'weight')).toBe(70.4);
    expect(readMetric(70.46, 'weight')).toBe(70.5);
    expect(readMetric(70, 'weight')).toBe(70);
  });

  it('超上限按上限收：体脂按百分比，其余按通用上限', () => {
    expect(readMetric(150, 'bodyFat')).toBe(MAX_BODY_FAT);
    expect(readMetric(900, 'weight')).toBe(MAX_BODY_READING);
    expect(readMetric(900, 'measurement')).toBe(MAX_BODY_READING);
  });
});

describe('sanitizeMeasurements', () => {
  it('丢掉非法键与非法值，并去掉键两侧空白', () => {
    expect(
      sanitizeMeasurements({
        ' waist ': 80,
        chest: '95',
        hip: 0,
        '': 90,
        ['x'.repeat(40)]: 70,
      }),
    ).toEqual({ waist: 80 });
  });

  it('非对象输入给空表', () => {
    expect(sanitizeMeasurements(null)).toEqual({});
    expect(sanitizeMeasurements([1, 2])).toEqual({});
    expect(sanitizeMeasurements('chest')).toEqual({});
  });

  it('最多保留 20 个部位，避免脏数据把单条记录撑爆', () => {
    const many = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [`part-${index}`, 60 + index]),
    );
    expect(Object.keys(sanitizeMeasurements(many))).toHaveLength(20);
  });
});

describe('sortedMetrics', () => {
  it('按日期升序，并滤掉日期不合法的脏记录', () => {
    const sorted = sortedMetrics([
      metric('2026-09-03', { weight: 69 }),
      metric('2026/09/01', { weight: 71 }),
      metric('2026-09-01', { weight: 70 }),
    ]);

    expect(sorted.map((record) => record.date)).toEqual(['2026-09-01', '2026-09-03']);
  });

  it('同一天多条时按创建时间排，保证「较上次」口径稳定', () => {
    const sorted = sortedMetrics([
      metric('2026-09-01', { createdAt: '2026-09-01T21:00:00.000Z', weight: 70 }),
      metric('2026-09-01', { createdAt: '2026-09-01T07:00:00.000Z', weight: 71 }),
    ]);

    expect(sorted.map((record) => record.weight)).toEqual([71, 70]);
  });
});

describe('取值函数', () => {
  it('体重与体脂读不到时是 undefined，而不是 0', () => {
    expect(weightOf(metric('2026-09-01'))).toBeUndefined();
    expect(bodyFatOf(metric('2026-09-01', { bodyFat: 0 }))).toBeUndefined();
    expect(bodyValueOf(metric('2026-09-01', { weight: 70 }), 'weight')).toBe(70);
  });

  it('measurementOf 生成部位取值函数', () => {
    const records = [metric('2026-09-01', { measurements: { waist: 80 } })];
    expect(bodyPoints(records, measurementOf('waist'))).toEqual([
      { date: '2026-09-01', value: 80 },
    ]);
    expect(bodyPoints(records, measurementOf('hip'))).toEqual([]);
  });

  it('hasAnyValue 判断这条记录是不是空的', () => {
    expect(hasAnyValue(metric('2026-09-01'))).toBe(false);
    expect(hasAnyValue(metric('2026-09-01', { bodyFat: 18 }))).toBe(true);
    expect(hasAnyValue(metric('2026-09-01', { measurements: { waist: 80 } }))).toBe(true);
  });
});

describe('bodyPoints', () => {
  const records = [
    metric('2026-09-01', { weight: 71 }),
    metric('2026-09-02'),
    metric('2026-09-03', { weight: 70.5 }),
    metric('2026-09-04', { weight: 70 }),
  ];

  it('只取真正有读数的日子，不补 0', () => {
    expect(bodyPoints(records, weightOf)).toEqual([
      { date: '2026-09-01', value: 71 },
      { date: '2026-09-03', value: 70.5 },
      { date: '2026-09-04', value: 70 },
    ]);
  });

  it('超过 limit 时只留最近的若干个点', () => {
    const many = Array.from({ length: MAX_TREND_POINTS + 10 }, (_, index) =>
      metric(addDays('2026-01-01', index), { weight: 70 }),
    );
    const points = bodyPoints(many, weightOf);
    expect(points).toHaveLength(MAX_TREND_POINTS);
    // 只留最近的一段，最前面的 10 天被裁掉
    expect(points[0]!.date).toBe(addDays('2026-01-01', 10));
  });

  it('同一天只有一条读数（后者覆盖前者）', () => {
    const points = bodyPoints(
      [
        metric('2026-09-01', { weight: 71, createdAt: '2026-09-01T07:00:00.000Z' }),
        metric('2026-09-01', { weight: 70, createdAt: '2026-09-01T21:00:00.000Z' }),
      ],
      weightOf,
    );

    expect(points).toEqual([{ date: '2026-09-01', value: 70 }]);
  });
});

describe('latestPoint / changeFromPrevious', () => {
  it('不足两次记录时返回 null，而不是假装差值为 0', () => {
    expect(latestPoint([], weightOf)).toBeNull();
    expect(changeFromPrevious([metric('2026-09-01', { weight: 70 })], weightOf)).toBeNull();
  });

  it('取最近两次读数算差值', () => {
    const records = [metric('2026-09-01', { weight: 71 }), metric('2026-09-03', { weight: 70.6 })];

    expect(latestPoint(records, weightOf)).toEqual({ date: '2026-09-03', value: 70.6 });
    expect(changeFromPrevious(records, weightOf)).toEqual({
      delta: -0.4,
      previous: { date: '2026-09-01', value: 71 },
      current: { date: '2026-09-03', value: 70.6 },
    });
  });

  it('中间一天没称不影响「较上次」，比的是上一次真实读数', () => {
    const records = [
      metric('2026-09-01', { weight: 71 }),
      metric('2026-09-02'),
      metric('2026-09-03', { weight: 70 }),
    ];

    expect(changeFromPrevious(records, weightOf)?.delta).toBe(-1);
  });
});

describe('bodyEntries', () => {
  it('按 体重 → 体脂 → 内置部位 → 自定义部位 排序', () => {
    const entries = bodyEntries(
      metric('2026-09-29', {
        weight: 70,
        bodyFat: 18,
        measurements: { waist: 80, arm: 33, 左腿: 55 },
      }),
    );

    expect(entries.map((entry) => entry.label)).toEqual(['体重', '体脂率', '腰围', '臂围', '左腿']);
    expect(entries[0]).toMatchObject({ unit: 'kg', value: 70 });
    expect(entries[2]).toMatchObject({ unit: 'cm', value: 80 });
  });

  it('没记的项不出现', () => {
    expect(bodyEntries(metric('2026-09-29', { bodyFat: 18 })).map((entry) => entry.key)).toEqual([
      'bodyFat',
    ]);
  });
});

describe('measurementFields / measurementLabel', () => {
  it('默认给五个内置部位', () => {
    expect(measurementFields().map((field) => field.key)).toEqual([
      'chest',
      'waist',
      'hip',
      'arm',
      'thigh',
    ]);
  });

  it('记录里的自定义部位追加在内置部位之后', () => {
    const fields = measurementFields(metric('2026-09-29', { measurements: { 左腿: 55 } }));
    expect(fields.map((field) => field.key)).toEqual([
      'chest',
      'waist',
      'hip',
      'arm',
      'thigh',
      '左腿',
    ]);
    expect(fields[5]!.unit).toBe('cm');
  });

  it('未知部位回退成键名', () => {
    expect(measurementLabel('waist')).toBe('腰围');
    expect(measurementLabel('左腿')).toBe('左腿');
  });
});

describe('格式化', () => {
  it('formatMetric 去掉没意义的小数', () => {
    expect(formatMetric(70)).toBe('70');
    expect(formatMetric(70.5)).toBe('70.5');
    expect(formatMetric(70.44)).toBe('70.4');
  });

  it('formatDelta 带符号', () => {
    expect(formatDelta(-0.4)).toBe('-0.4');
    expect(formatDelta(1)).toBe('+1');
    expect(formatDelta(0)).toBe('0');
    expect(formatDelta(0.04)).toBe('0');
  });
});

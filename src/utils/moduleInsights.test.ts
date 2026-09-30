import { describe, expect, it } from 'vitest';
import { summarizeModule, volumeByDay, workoutVolume, writingDailyWords } from './moduleInsights';
import type { WorkoutRecord, WritingProject, WritingSnapshot } from '../types';

/** 用本地时间构造快照时间戳：快照存的是 UTC ISO，这里要的是「本地哪一天」，两者必须对齐才测得出东西 */
const atLocal = (year: number, month: number, day: number, hour = 12, minute = 0): string =>
  new Date(year, month - 1, day, hour, minute).toISOString();

const record = (exercises: WorkoutRecord['exercises'], date = '2026-09-28'): WorkoutRecord => ({
  id: 'r1',
  date,
  planName: '推日',
  exercises,
  notes: '',
  tags: [],
  createdAt: '2026-09-28T04:00:00.000Z',
});

describe('workoutVolume', () => {
  it('按组数 × 次数 × 重量累加每条动作', () => {
    expect(
      workoutVolume(
        record([
          { name: '卧推', sets: 4, reps: 8, weight: 60 },
          { name: '飞鸟', sets: 3, reps: 12, weight: 10 },
        ]),
      ),
    ).toBe(4 * 8 * 60 + 3 * 12 * 10);
  });

  it('自重动作（重量 0）贡献 0，负数按 0 处理', () => {
    expect(
      workoutVolume(
        record([
          { name: '俯卧撑', sets: 3, reps: 20, weight: 0 },
          { name: '脏数据', sets: -5, reps: 10, weight: 80 },
        ]),
      ),
    ).toBe(0);
  });

  it('没有动作时是 0，不会算出 NaN', () => {
    expect(workoutVolume(record([]))).toBe(0);
  });
});

describe('volumeByDay', () => {
  it('按天累加容量，区间外的记录不计入', () => {
    const series = volumeByDay(
      [
        record([{ name: '深蹲', sets: 5, reps: 5, weight: 100 }], '2026-09-28'),
        record([{ name: '硬拉', sets: 3, reps: 5, weight: 100 }], '2026-09-28'),
        record([{ name: '卧推', sets: 1, reps: 1, weight: 999 }], '2026-01-01'),
      ],
      2,
      '2026-09-28',
    );

    expect(series).toEqual([
      { date: '2026-09-27', value: 0 },
      { date: '2026-09-28', value: 5 * 5 * 100 + 3 * 5 * 100 },
    ]);
  });
});

const snapshot = (createdAt: string, wordCount: number): WritingSnapshot => ({
  id: createdAt,
  createdAt,
  wordCount,
  content: '',
});

const project = (snapshots: WritingSnapshot[], wordCount = 0): WritingProject => ({
  id: 'p1',
  title: '长文',
  type: 'article',
  status: 'draft',
  wordCount,
  notes: '',
  tags: [],
  content: '',
  targetWords: 0,
  snapshots,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-28T00:00:00.000Z',
});

describe('writingDailyWords', () => {
  it('按相邻两版快照的差记在后一版那天，而不是把累计字数堆到区间第一天', () => {
    const series = writingDailyWords(
      [
        project([
          snapshot(atLocal(2026, 9, 26), 500),
          snapshot(atLocal(2026, 9, 27), 900),
          snapshot(atLocal(2026, 9, 28), 1200),
        ]),
      ],
      3,
      '2026-09-28',
    );

    expect(series).toEqual([
      { date: '2026-09-26', value: 500 },
      { date: '2026-09-27', value: 400 },
      { date: '2026-09-28', value: 300 },
    ]);
  });

  it('同一天的多次保存按时间戳分先后，不按传入顺序', () => {
    const series = writingDailyWords(
      [project([snapshot(atLocal(2026, 9, 28, 18), 900), snapshot(atLocal(2026, 9, 28, 8), 600)])],
      1,
      '2026-09-28',
    );

    // 早上 600（当天第一版，整版计入）+ 晚上涨到 900 的 300
    expect(series).toEqual([{ date: '2026-09-28', value: 900 }]);
  });

  it('删字不产生负增量；多个项目各算各的', () => {
    const series = writingDailyWords(
      [
        project([snapshot(atLocal(2026, 9, 27), 1000), snapshot(atLocal(2026, 9, 28), 400)]),
        { ...project([snapshot(atLocal(2026, 9, 28, 13), 50)]), id: 'p2' },
      ],
      2,
      '2026-09-28',
    );

    expect(series).toEqual([
      { date: '2026-09-27', value: 1000 },
      { date: '2026-09-28', value: 50 },
    ]);
  });

  it('没有快照的项目不产生数据，区间长度照样铺满', () => {
    expect(writingDailyWords([project([])], 3, '2026-09-28')).toEqual([
      { date: '2026-09-26', value: 0 },
      { date: '2026-09-27', value: 0 },
      { date: '2026-09-28', value: 0 },
    ]);
  });

  it('时间戳认不出来时跳过那版，不当成 0 字', () => {
    const series = writingDailyWords(
      [
        project([
          { id: 'bad', createdAt: '不是时间', wordCount: 800, content: '' },
          snapshot(atLocal(2026, 9, 28), 200),
        ]),
      ],
      1,
      '2026-09-28',
    );

    expect(series).toEqual([{ date: '2026-09-28', value: 200 }]);
  });

  it('本地凌晨保存的字算在当天，不算 UTC 的前一天', () => {
    // 东八区 00:30 保存 == UTC 前一天 16:30；按 UTC 切片会记到 9/27
    const series = writingDailyWords(
      [project([snapshot(atLocal(2026, 9, 28, 0, 30), 120)])],
      3,
      '2026-09-28',
    );

    expect(series[2]).toEqual({ date: '2026-09-28', value: 120 });
  });
});

describe('summarizeModule', () => {
  it('给出合计、单日最高与有记录的天数', () => {
    expect(
      summarizeModule([
        { date: '2026-09-26', value: 0 },
        { date: '2026-09-27', value: 30 },
        { date: '2026-09-28', value: 12 },
      ]),
    ).toEqual({ total: 42, best: 30, days: 2 });
  });

  it('全 0 时最高是 0，不是 1', () => {
    expect(summarizeModule([{ date: '2026-09-28', value: 0 }])).toEqual({
      total: 0,
      best: 0,
      days: 0,
    });
  });

  it('空序列不炸', () => {
    expect(summarizeModule([])).toEqual({ total: 0, best: 0, days: 0 });
  });
});

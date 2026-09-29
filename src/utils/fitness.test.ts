import { describe, expect, it } from 'vitest';
import { epley1RM, personalBests } from './fitness';
import type { WorkoutRecord } from '../types';

const record = (date: string, exercises: Array<{ name: string; sets: number; reps: number; weight: number }>): WorkoutRecord => ({
  id: `r-${date}-${exercises[0]?.name ?? ''}`,
  date,
  planName: '',
  exercises: exercises.map((exercise) => ({ id: `${date}-${exercise.name}`, ...exercise })),
  notes: '',
  tags: [],
  createdAt: `${date}T10:00:00.000Z`,
});

describe('epley1RM', () => {
  it('单次直接就是 1RM，多次按 Epley 换算', () => {
    expect(epley1RM(80, 1)).toBe(80);
    // 60×5 → 60 × (1 + 5/30) = 70
    expect(epley1RM(60, 5)).toBe(70);
    // 结果四舍五入到 0.5
    expect(epley1RM(100, 3)).toBe(110);
  });

  it('零重量或零次数返回 0', () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(60, 0)).toBe(0);
  });
});

describe('personalBests', () => {
  it('同一动作跨记录取最佳，按 1RM 降序排列', () => {
    const records = [
      record('2026-09-01', [{ name: '卧推', sets: 3, reps: 5, weight: 60 }]),
      record('2026-09-15', [{ name: '卧推', sets: 3, reps: 5, weight: 70 }]),
      record('2026-09-20', [{ name: '深蹲', sets: 5, reps: 5, weight: 100 }]),
    ];

    const bests = personalBests(records);
    expect(bests).toHaveLength(2);
    expect(bests[0]).toEqual({ exercise: '深蹲', oneRm: 116.5, date: '2026-09-20' });
    expect(bests[1]).toEqual({ exercise: '卧推', oneRm: 81.5, date: '2026-09-15' });
  });

  it('零重量动作不计入', () => {
    const records = [record('2026-09-01', [{ name: '平板支撑', sets: 3, reps: 1, weight: 0 }])];
    expect(personalBests(records)).toHaveLength(0);
  });
});

import type { WorkoutRecord } from '../types';

/**
 * Epley 公式估算 1RM（最大可推重量）：
 * 1RM = 重量 × (1 + 次数 / 30)；单次直接就是 1RM。
 * 结果四舍五入到 0.5kg，避免一串小数。
 */
export function epley1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  const raw = reps === 1 ? weight : weight * (1 + reps / 30);
  return Math.round(raw * 2) / 2;
}

export interface PersonalRecord {
  /** 动作名（同一名字跨记录取最好的那次） */
  exercise: string;
  oneRm: number;
  /** 创下该成绩的训练日期 */
  date: string;
}

/** 每个动作的个人最佳（按估算 1RM），按 1RM 从高到低排序 */
export function personalBests(records: readonly WorkoutRecord[]): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>();
  for (const record of records) {
    for (const exercise of record.exercises) {
      const oneRm = epley1RM(exercise.weight, exercise.reps);
      if (oneRm <= 0) continue;
      const current = best.get(exercise.name);
      if (!current || oneRm > current.oneRm) {
        best.set(exercise.name, { exercise: exercise.name, oneRm, date: record.date });
      }
    }
  }
  return [...best.values()].sort((a, b) => b.oneRm - a.oneRm);
}

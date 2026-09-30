import { describe, expect, it } from 'vitest';
import { EQUIPMENTS, EXERCISE_SEEDS, MUSCLE_GROUPS } from './exercises';

describe('动作库种子数据', () => {
  it('名字不重复，肌群与器械都在约定表里', () => {
    const names = EXERCISE_SEEDS.map((exercise) => exercise.name);
    expect(new Set(names).size).toBe(names.length);
    for (const exercise of EXERCISE_SEEDS) {
      expect(MUSCLE_GROUPS, exercise.name).toContain(exercise.muscleGroup);
      expect(EQUIPMENTS, exercise.name).toContain(exercise.equipment);
    }
  });

  it('规模够用：至少 60 条，六大肌群全有覆盖', () => {
    expect(EXERCISE_SEEDS.length).toBeGreaterThanOrEqual(60);
    for (const group of MUSCLE_GROUPS) {
      expect(
        EXERCISE_SEEDS.some((exercise) => exercise.muscleGroup === group),
        group,
      ).toBe(true);
    }
  });

  it('常见主力动作都在', () => {
    const names = new Set(EXERCISE_SEEDS.map((exercise) => exercise.name));
    for (const expected of ['杠铃卧推', '杠铃深蹲', '硬拉', '引体向上', '杠铃站姿推举']) {
      expect(names.has(expected), expected).toBe(true);
    }
  });
});

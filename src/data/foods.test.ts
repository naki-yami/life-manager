import { describe, expect, it } from 'vitest';
import { FOOD_SEEDS } from './foods';
import { FOOD_CATEGORIES } from './foodCategories';

describe('食物库种子数据', () => {
  it('名字不重复，分类都在共享分类表里', () => {
    const names = FOOD_SEEDS.map((food) => food.name);
    expect(new Set(names).size).toBe(names.length);
    for (const food of FOOD_SEEDS) {
      expect(FOOD_CATEGORIES, food.name).toContain(food.category);
    }
  });

  it('营养数值都是非负数，热量与宏量的大体关系合理', () => {
    for (const food of FOOD_SEEDS) {
      expect(food.calories, food.name).toBeGreaterThanOrEqual(0);
      expect(food.protein, food.name).toBeGreaterThanOrEqual(0);
      expect(food.carbs, food.name).toBeGreaterThanOrEqual(0);
      expect(food.fat, food.name).toBeGreaterThanOrEqual(0);
      // 4/4/9 估算：宏量算出来的热量不会超过标注值的 1.6 倍（允许膳食纤维等误差）
      const estimated = food.protein * 4 + food.carbs * 4 + food.fat * 9;
      expect(estimated, food.name).toBeLessThanOrEqual(Math.max(food.calories * 1.6, 30));
    }
  });

  it('规模够用：至少 100 条，覆盖全部分类', () => {
    expect(FOOD_SEEDS.length).toBeGreaterThanOrEqual(100);
    for (const category of FOOD_CATEGORIES) {
      expect(FOOD_SEEDS.some((food) => food.category === category), category).toBe(true);
    }
  });
});

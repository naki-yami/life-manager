/** 饮食记录与食物库共用的食物分类（与 MealRecord 里 FoodItem.category 的取值一致） */
export const FOOD_CATEGORIES = [
  '主食',
  '蛋白质',
  '蔬菜',
  '水果',
  '乳制品',
  '饮品',
  '零食',
  '其他',
] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

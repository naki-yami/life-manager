import type { DietGoals } from '../types';

/**
 * 饮食模块的共享常量与清洗。
 *
 * 放在 `utils/` 而不是 store 里：`services/schemas.ts`（备份校验）与 `store/dietStore.ts`
 * （持久化归一化）都要用同一套规则，两边各写一遍迟早会漂移。
 */

/** 每日目标的默认值；也是「用户从没设过」的判定基准 */
export const DEFAULT_DIET_GOALS: DietGoals = { calories: 2000, protein: 80 };

/** 一天最多记多少杯水（与 store 里 setWater 的上限一致） */
export const MAX_WATER_GLASSES = 99;

/** 把杯数收进 0–99；手改过的备份文件也可能带进来一个离谱的数 */
export function clampWaterGlasses(glasses: number): number {
  return Math.max(0, Math.min(MAX_WATER_GLASSES, glasses));
}

/** 本机目标是否还是默认值（= 用户没设过，可以由备份采用） */
export function isDefaultDietGoals(goals: DietGoals): boolean {
  return (
    goals.calories === DEFAULT_DIET_GOALS.calories && goals.protein === DEFAULT_DIET_GOALS.protein
  );
}

/**
 * 读一个「日期 → 杯数」的映射：剔掉非数字的脏值，并截断到 0–99。
 *
 * 比 `store/normalize.ts` 的 `pickNumberMap` 多一步截断 —— 备份文件是用户可以手改的入口，
 * 手改进去的 999 不该原样写回 store。
 */
export function sanitizeWater(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
  );
  return Object.fromEntries(entries.map(([date, glasses]) => [date, clampWaterGlasses(glasses)]));
}

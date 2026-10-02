import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DietGoals, MealRecord, MealTemplate, MealType, FoodItem } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { persistOptions } from './persist';
import { asRecord, normalizeArray, pickNumber, pickNumberMap } from './normalize';
import { mealRecordSchema, mealTemplateSchema } from '../services/schemas';
import { normalizeTags } from '../utils/tags';
import { clampWaterGlasses, DEFAULT_DIET_GOALS } from '../utils/diet';

interface DietState {
  records: MealRecord[];
  /** 餐次模板（F16）：常吃组合的快捷方式，不参与统计 */
  templates: MealTemplate[];
  /** 每日目标（热量 kcal / 蛋白质 g），0 表示未设置 */
  goals: DietGoals;
  /** 饮水打卡：日期键 -> 杯数 */
  water: Record<string, number>;
  addRecord: (date: string, type: MealType, items: FoodItem[], tags?: string[]) => void;
  deleteRecord: (id: string) => void;
  /**
   * 就地改一条记录（日期 / 餐次 / 食物清单 / 标签）。
   * 四个合计数会按新的 items 重算，调用方不必自己算。
   */
  updateRecord: (id: string, patch: Partial<Omit<MealRecord, 'id'>>) => void;
  /** 把一餐存成模板（复制食物清单，连带当时选的餐次）；名字重复时自动加序号 */
  addTemplateFromRecord: (record: MealRecord, name?: string) => void;
  deleteTemplate: (id: string) => void;
  setGoals: (goals: DietGoals) => void;
  setWater: (date: string, glasses: number) => void;
  getRecordsByDate: (date: string) => MealRecord[];
  replaceRecords: (records: MealRecord[]) => void;
  replaceTemplates: (templates: MealTemplate[]) => void;
  /** 整块换掉饮水打卡（导入备份用）；逐日改走 `setWater` */
  replaceWater: (water: Record<string, number>) => void;
}

/** 每日目标是用户可改的设置项，脏数据回退默认值即可，不涉及用户记录 */
const normalizeGoals = (raw: unknown): DietGoals => {
  const record = asRecord(raw);
  return {
    calories: pickNumber(record.calories, DEFAULT_DIET_GOALS.calories),
    protein: pickNumber(record.protein, DEFAULT_DIET_GOALS.protein),
  };
};

const defaultState = {
  records: [] as MealRecord[],
  templates: [] as MealTemplate[],
  goals: { ...DEFAULT_DIET_GOALS },
  water: {} as Record<string, number>,
};

/**
 * 从一餐推出模板的默认名字，例如「早餐 · 燕麦鸡蛋」。
 *
 * 重名不在这里处理 —— 让 store 的 action 拿现有列表去避让，
 * 因为重名判断要看「当前模板列表」，而那个列表只有在 set 的回调里才是最新的。
 */
function defaultTemplateName(record: MealRecord): string {
  const first = record.items[0]?.name ?? '未命名';
  const suffix = record.items.length > 1 ? ` 等 ${record.items.length} 项` : '';
  return `${MEAL_LABEL[record.type]} · ${first}${suffix}`;
}

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

export const useDietStore = create<DietState>()(
  persist(
    (set, get) => ({
      ...defaultState,
      addRecord: (date, type, items, tags = []) => {
        const itemsWithIds = items.map((item) => ({ ...item, id: item.id || createId() }));
        const totalCalories = itemsWithIds.reduce((sum, item) => sum + item.calories, 0);
        const totalProtein = itemsWithIds.reduce((sum, item) => sum + (item.protein ?? 0), 0);
        const totalCarbs = itemsWithIds.reduce((sum, item) => sum + (item.carbs ?? 0), 0);
        const totalFat = itemsWithIds.reduce((sum, item) => sum + (item.fat ?? 0), 0);
        set((state) => ({
          records: [
            ...state.records,
            {
              id: createId(),
              date,
              type,
              items: itemsWithIds,
              totalCalories,
              totalProtein,
              totalCarbs,
              totalFat,
              tags: normalizeTags(tags),
            },
          ],
        }));
      },
      deleteRecord: (id) => set((state) => ({ records: state.records.filter((r) => r.id !== id) })),
      /*
       * 就地改一条记录。四个合计数必须跟着重算 —— 它们是从 items 派生出来的，
       * 只改 items 会让卡片上的热量和条目对不上（那才是「两个真相源」）。
       */
      updateRecord: (id, patch) =>
        set((state) => ({
          records: state.records.map((record) => {
            if (record.id !== id) return record;
            const next = { ...record, ...patch };
            const items = (patch.items ?? record.items).map((item) => ({
              ...item,
              id: item.id || createId(),
            }));
            return {
              ...next,
              items,
              tags: patch.tags ? normalizeTags(patch.tags) : record.tags,
              totalCalories: items.reduce((sum, item) => sum + item.calories, 0),
              totalProtein: items.reduce((sum, item) => sum + (item.protein ?? 0), 0),
              totalCarbs: items.reduce((sum, item) => sum + (item.carbs ?? 0), 0),
              totalFat: items.reduce((sum, item) => sum + (item.fat ?? 0), 0),
            };
          }),
        })),
      addTemplateFromRecord: (record, name) =>
        set((state) => {
          const wanted = (name ?? defaultTemplateName(record)).trim() || '未命名模板';
          // 重名就加序号，别让用户面对两个一样的名字在列表里分不清
          const taken = new Set(state.templates.map((t) => t.name));
          let finalName = wanted;
          for (let n = 2; taken.has(finalName); n += 1) finalName = `${wanted} (${n})`;

          return {
            templates: [
              ...state.templates,
              {
                id: createId(),
                name: finalName,
                type: record.type,
                // 深拷一份：模板与来源记录此后各走各的，改一边不该动另一边。
                // 食物条目的 id 重新发，免得模板与记录里的 id 撞上。
                items: record.items.map((item) => ({ ...item, id: createId() })),
                createdAt: new Date().toISOString(),
              },
            ],
          };
        }),
      deleteTemplate: (id) =>
        set((state) => ({ templates: state.templates.filter((t) => t.id !== id) })),
      setGoals: (goals) => set({ goals }),
      setWater: (date, glasses) =>
        set((state) => ({ water: { ...state.water, [date]: clampWaterGlasses(glasses) } })),
      getRecordsByDate: (date) => get().records.filter((r) => r.date === date),
      replaceRecords: (records) => set({ records }),
      replaceTemplates: (templates) => set({ templates }),
      replaceWater: (water) => set({ water }),
    }),
    persistOptions<DietState, Pick<DietState, 'records' | 'templates' | 'goals' | 'water'>>({
      name: STORAGE_KEYS.diet,
      partialize: (state) => ({
        records: state.records,
        templates: state.templates,
        goals: state.goals,
        water: state.water,
      }),
      // 营养素合计是后加的字段，按 schema 补 0；goals / water 属于设置项，脏值直接回退默认
      normalize: (persisted) => {
        const raw = asRecord(persisted);
        return {
          records: normalizeArray(mealRecordSchema, raw.records),
          templates: normalizeArray(mealTemplateSchema, raw.templates),
          goals: normalizeGoals(raw.goals),
          water: pickNumberMap(raw.water),
        };
      },
    }),
  ),
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DietGoals, MealRecord, MealType, FoodItem } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { persistOptions } from './persist';
import { asRecord, normalizeArray, pickNumber, pickNumberMap } from './normalize';
import { mealRecordSchema } from '../services/schemas';

interface DietState {
  records: MealRecord[];
  /** 每日目标（热量 kcal / 蛋白质 g），0 表示未设置 */
  goals: DietGoals;
  /** 饮水打卡：日期键 -> 杯数 */
  water: Record<string, number>;
  addRecord: (date: string, type: MealType, items: FoodItem[]) => void;
  deleteRecord: (id: string) => void;
  setGoals: (goals: DietGoals) => void;
  setWater: (date: string, glasses: number) => void;
  getRecordsByDate: (date: string) => MealRecord[];
  replaceRecords: (records: MealRecord[]) => void;
}

const DEFAULT_GOALS: DietGoals = { calories: 2000, protein: 80 };

/** 每日目标是用户可改的设置项，脏数据回退默认值即可，不涉及用户记录 */
const normalizeGoals = (raw: unknown): DietGoals => {
  const record = asRecord(raw);
  return {
    calories: pickNumber(record.calories, DEFAULT_GOALS.calories),
    protein: pickNumber(record.protein, DEFAULT_GOALS.protein),
  };
};

const defaultState = {
  records: [] as MealRecord[],
  goals: { ...DEFAULT_GOALS },
  water: {} as Record<string, number>,
};

export const useDietStore = create<DietState>()(
  persist(
    (set, get) => ({
      ...defaultState,
      addRecord: (date, type, items) => {
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
            },
          ],
        }));
      },
      deleteRecord: (id) => set((state) => ({ records: state.records.filter((r) => r.id !== id) })),
      setGoals: (goals) => set({ goals }),
      setWater: (date, glasses) =>
        set((state) => ({ water: { ...state.water, [date]: Math.max(0, Math.min(99, glasses)) } })),
      getRecordsByDate: (date) => get().records.filter((r) => r.date === date),
      replaceRecords: (records) => set({ records }),
    }),
    persistOptions<DietState, Pick<DietState, 'records' | 'goals' | 'water'>>({
      name: STORAGE_KEYS.diet,
      partialize: (state) => ({ records: state.records, goals: state.goals, water: state.water }),
      // 营养素合计是后加的字段，按 schema 补 0；goals / water 属于设置项，脏值直接回退默认
      normalize: (persisted) => {
        const raw = asRecord(persisted);
        return {
          records: normalizeArray(mealRecordSchema, raw.records),
          goals: normalizeGoals(raw.goals),
          water: pickNumberMap(raw.water),
        };
      },
    }),
  ),
);

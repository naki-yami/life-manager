import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DietGoals, MealRecord, MealType, FoodItem } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { STORE_VERSION, migrateState } from './persist';

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

const defaultState = {
  records: [] as MealRecord[],
  goals: { calories: 2000, protein: 80 } as DietGoals,
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
    {
      name: STORAGE_KEYS.diet,
      version: STORE_VERSION,
      partialize: (state) => ({ records: state.records, goals: state.goals, water: state.water }),
      // 旧数据的记录没有营养素合计，补 0 免得界面出现 undefined
      migrate: (persisted) => {
        const state = migrateState(persisted, defaultState);
        return {
          ...state,
          records: state.records.map((record) => ({
            ...record,
            totalProtein: record.totalProtein ?? 0,
            totalCarbs: record.totalCarbs ?? 0,
            totalFat: record.totalFat ?? 0,
          })),
          goals: state.goals ?? { calories: 2000, protein: 80 },
          water: state.water ?? {},
        };
      },
    },
  ),
);

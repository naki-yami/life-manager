import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MealRecord, MealType, FoodItem } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { STORE_VERSION, migrateState } from './persist';

interface DietState {
  records: MealRecord[];
  addRecord: (date: string, type: MealType, items: FoodItem[]) => void;
  deleteRecord: (id: string) => void;
  getRecordsByDate: (date: string) => MealRecord[];
  replaceRecords: (records: MealRecord[]) => void;
}

const defaultState = { records: [] as MealRecord[] };

export const useDietStore = create<DietState>()(
  persist(
    (set, get) => ({
      ...defaultState,
      addRecord: (date, type, items) => {
        const itemsWithIds = items.map((item) => ({ ...item, id: item.id || createId() }));
        const totalCalories = itemsWithIds.reduce((sum, item) => sum + item.calories, 0);
        set((state) => ({
          records: [
            ...state.records,
            { id: createId(), date, type, items: itemsWithIds, totalCalories },
          ],
        }));
      },
      deleteRecord: (id) => set((state) => ({ records: state.records.filter((r) => r.id !== id) })),
      getRecordsByDate: (date) => get().records.filter((r) => r.date === date),
      replaceRecords: (records) => set({ records }),
    }),
    {
      name: STORAGE_KEYS.diet,
      version: STORE_VERSION,
      partialize: (state) => ({ records: state.records }),
      migrate: (persisted) => migrateState(persisted, defaultState),
    },
  ),
);

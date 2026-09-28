import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MealRecord, MealType, FoodItem } from '../types';
import { generateId } from '../utils/helpers';

interface DietState {
  records: MealRecord[];
  addRecord: (date: string, type: MealType, items: FoodItem[]) => void;
  deleteRecord: (id: string) => void;
  getRecordsByDate: (date: string) => MealRecord[];
}

export const useDietStore = create<DietState>()(
  persist(
    (set, get) => ({
      records: [],
      addRecord: (date, type, items) => {
        const itemsWithIds = items.map((item) => ({
          ...item,
          id: item.id || generateId(),
        }));
        const totalCalories = itemsWithIds.reduce((sum, item) => sum + item.calories, 0);
        set((state) => ({
          records: [
            ...state.records,
            {
              id: generateId(),
              date,
              type,
              items: itemsWithIds,
              totalCalories,
            },
          ],
        }));
      },
      deleteRecord: (id) =>
        set((state) => ({ records: state.records.filter((r) => r.id !== id) })),
      getRecordsByDate: (date) => get().records.filter((r) => r.date === date),
    }),
    { name: 'diet-storage' }
  )
);

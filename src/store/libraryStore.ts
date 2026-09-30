import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { z } from 'zod';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { normalizeArray, pickEnum } from './normalize';
import { persistOptions } from './persist';
import { customExerciseSchema, customFoodSchema } from '../services/schemas';
import { FOOD_CATEGORIES } from '../data/foodCategories';
import { FOOD_SEEDS } from '../data/foods';
import { EXERCISE_SEEDS } from '../data/exercises';

export type CustomFood = z.infer<typeof customFoodSchema>;
export type CustomExercise = z.infer<typeof customExerciseSchema>;

/**
 * 用户自建库（F9）：种子数据之外的「我的食物 / 我的动作」。
 *
 * 种子数据放在 src/data 里随包发布、不可变；用户自己加的条目存在这个 store 里，
 * 两边在页面上拼成一个完整的库。按名字去重（忽略首尾空格），
 * 避免同一个东西加两遍后选择器里出现两行。
 */
interface LibraryState {
  customFoods: CustomFood[];
  customExercises: CustomExercise[];
  addCustomFood: (food: Omit<CustomFood, 'id' | 'createdAt'>) => void | 'duplicate';
  deleteCustomFood: (id: string) => void;
  addCustomExercise: (exercise: Omit<CustomExercise, 'id' | 'createdAt'>) => void | 'duplicate';
  deleteCustomExercise: (id: string) => void;
  replaceLibrary: (data: {
    customFoods?: CustomFood[];
    customExercises?: CustomExercise[];
  }) => void;
}

const defaultState = {
  customFoods: [] as CustomFood[],
  customExercises: [] as CustomExercise[],
};

const normalize = (persisted: unknown) => {
  const record = typeof persisted === 'object' && persisted !== null ? persisted : {};
  return {
    customFoods: normalizeArray(customFoodSchema, (record as Record<string, unknown>).customFoods),
    customExercises: normalizeArray(
      customExerciseSchema,
      (record as Record<string, unknown>).customExercises,
    ),
  };
};

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set) => ({
      ...defaultState,
      addCustomFood: (food) => {
        const name = food.name.trim();
        if (!name) return;
        let duplicated = false;
        set((state) => {
          if (state.customFoods.some((item) => item.name === name)) {
            duplicated = true;
            return state;
          }
          return {
            customFoods: [
              {
                ...food,
                name,
                category: pickEnum(food.category, FOOD_CATEGORIES, '其他'),
                id: createId(),
                createdAt: new Date().toISOString(),
              },
              ...state.customFoods,
            ],
          };
        });
        return duplicated ? 'duplicate' : undefined;
      },
      deleteCustomFood: (id) =>
        set((state) => ({ customFoods: state.customFoods.filter((item) => item.id !== id) })),
      addCustomExercise: (exercise) => {
        const name = exercise.name.trim();
        if (!name) return;
        let duplicated = false;
        set((state) => {
          if (state.customExercises.some((item) => item.name === name)) {
            duplicated = true;
            return state;
          }
          return {
            customExercises: [
              {
                ...exercise,
                name,
                id: createId(),
                createdAt: new Date().toISOString(),
              },
              ...state.customExercises,
            ],
          };
        });
        return duplicated ? 'duplicate' : undefined;
      },
      deleteCustomExercise: (id) =>
        set((state) => ({
          customExercises: state.customExercises.filter((item) => item.id !== id),
        })),
      replaceLibrary: (data) =>
        set((state) => ({
          customFoods: data.customFoods ?? state.customFoods,
          customExercises: data.customExercises ?? state.customExercises,
        })),
    }),
    persistOptions({
      name: STORAGE_KEYS.library,
      partialize: (state) => ({
        customFoods: state.customFoods,
        customExercises: state.customExercises,
      }),
      normalize,
    }),
  ),
);

/** 食物库条目在选择器里的统一形状；category 用开放字符串兼容自建条目 */
export interface LibraryFood {
  id?: string;
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** 食物库的完整视图：自建在前（最近加的最先看到），种子在后 */
export function allFoods(customFoods: CustomFood[]): LibraryFood[] {
  return [...customFoods, ...FOOD_SEEDS];
}

/** 动作库条目在选择器里的统一形状 */
export interface LibraryExercise {
  id?: string;
  name: string;
  muscleGroup: string;
  equipment: string;
}

/** 动作库的完整视图：自建在前，种子在后 */
export function allExercises(customExercises: CustomExercise[]): LibraryExercise[] {
  return [...customExercises, ...EXERCISE_SEEDS];
}

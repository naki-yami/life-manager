import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Habit, HabitKind, HabitSchedule } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import {
  MAX_HABIT_AMOUNT,
  habitTarget,
  isDayKey,
  normalizeSchedule,
  sanitizeHabitLogs,
} from '../utils/habits';
import { persistOptions } from './persist';
import { asRecord, normalizeArray } from './normalize';
import { habitSchema } from '../services/schemas';

/**
 * 习惯打卡。
 *
 * 设计上的三个取舍：
 * - **日志只记有打卡的日子**（0 值删键），一年下来几千个键，空记录纯属浪费存储；
 * - **打卡与撤销走同一个入口**：`toggleHabitLog` 点一下写入、再点一下清除，
 *   不需要弹窗确认 —— 这才是「点格子直接打卡」；
 * - **断签不清强度分**：分数由 utils/habits 的指数加权模型算，store 只存原始日志。
 */
export interface HabitInput {
  name: string;
  kind?: HabitKind;
  target?: number;
  unit?: string;
  schedule?: HabitSchedule;
}

export type HabitPatch = Partial<Omit<Habit, 'id' | 'createdAt'>>;

interface HabitState {
  habits: Habit[];
  addHabit: (input: HabitInput) => void;
  updateHabit: (id: string, patch: HabitPatch) => void;
  deleteHabit: (id: string) => void;
  /** 直接设定某天的完成量；<= 0 表示取消打卡 */
  setHabitLog: (id: string, day: string, amount: number) => void;
  /** 点格子的默认行为：未达标则推进（binary 到位、count +1），已达标则清零 */
  toggleHabitLog: (id: string, day: string) => void;
  replaceHabits: (habits: Habit[]) => void;
}

const DEFAULT_SCHEDULE: HabitSchedule = { kind: 'daily', timesPerWeek: 1, everyDays: 1 };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

/** 写入一天的完成量；<= 0 时删除该键，避免日志里积一堆 0 */
function withLog(habit: Habit, day: string, amount: number): Habit {
  if (!isDayKey(day)) return habit;
  const logs = { ...habit.logs };
  const next = clamp(amount, 0, MAX_HABIT_AMOUNT);
  if (next <= 0) delete logs[day];
  else logs[day] = next;
  return { ...habit, logs };
}

function normalizePatch(habit: Habit, patch: HabitPatch): Habit {
  const next: Habit = { ...habit, ...patch };
  if (patch.schedule) next.schedule = normalizeSchedule(patch.schedule);
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.unit !== undefined) next.unit = patch.unit.trim();
  if (patch.target !== undefined) next.target = clamp(patch.target, 1, MAX_HABIT_AMOUNT);
  if (patch.logs) next.logs = sanitizeHabitLogs(patch.logs);
  return next;
}

const defaultState = { habits: [] as Habit[] };

export const useHabitStore = create<HabitState>()(
  persist(
    (set) => ({
      ...defaultState,
      addHabit: ({ name, kind = 'binary', target = 1, unit = '', schedule }) =>
        set((state) => ({
          habits: [
            ...state.habits,
            {
              id: createId(),
              name: name.trim(),
              kind,
              target: kind === 'count' ? clamp(target, 1, MAX_HABIT_AMOUNT) : 1,
              unit: unit.trim(),
              schedule: normalizeSchedule(schedule ?? DEFAULT_SCHEDULE),
              logs: {},
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      updateHabit: (id, patch) =>
        set((state) => ({
          habits: state.habits.map((habit) =>
            habit.id === id ? normalizePatch(habit, patch) : habit,
          ),
        })),
      deleteHabit: (id) =>
        set((state) => ({ habits: state.habits.filter((habit) => habit.id !== id) })),
      setHabitLog: (id, day, amount) =>
        set((state) => ({
          habits: state.habits.map((habit) =>
            habit.id === id ? withLog(habit, day, amount) : habit,
          ),
        })),
      toggleHabitLog: (id, day) =>
        set((state) => ({
          habits: state.habits.map((habit) => {
            if (habit.id !== id) return habit;
            const target = habitTarget(habit);
            const current = habit.logs[day] ?? 0;
            // 已达标再点即撤销；否则 binary 一次到位，count 每次加一
            const next = current >= target ? 0 : habit.kind === 'count' ? current + 1 : target;
            return withLog(habit, day, next);
          }),
        })),
      replaceHabits: (habits) => set({ habits }),
    }),
    persistOptions<HabitState, Pick<HabitState, 'habits'>>({
      name: STORAGE_KEYS.habits,
      partialize: (state) => ({ habits: state.habits }),
      normalize: (persisted) => ({
        habits: normalizeArray(habitSchema, asRecord(persisted).habits),
      }),
    }),
  ),
);

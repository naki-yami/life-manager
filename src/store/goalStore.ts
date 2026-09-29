import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Goal, GoalMetric, GoalPeriod } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { persistOptions } from './persist';
import { asRecord, normalizeArray } from './normalize';
import { goalSchema } from '../services/schemas';

/**
 * 目标与达成率。
 *
 * 三个约定：
 * - **只存「指标 + 周期 + 目标值」**：完成多少每次从各模块流水现算 ——
 *   存下来的进度会在数据变动之后悄悄撒谎；
 * - **同一指标同一周期只留一条，但由页面把关**：store 不做隐式合并，
 *   因为导入回来的数据里本来就可能有两条，那时候应该原样显示让人自己处理，
 *   而不是被悄悄吃掉一条；
 * - **新增不改旧**：加一个目标不会碰其它目标，`replaceGoals` 只服务于导入与撤销。
 */
export interface GoalInput {
  metric: GoalMetric;
  period: GoalPeriod;
  target: number;
}

interface GoalState {
  goals: Goal[];
  addGoal: (input: GoalInput) => void;
  updateGoal: (id: string, patch: Partial<GoalInput>) => void;
  removeGoal: (id: string) => void;
  replaceGoals: (goals: Goal[]) => void;
}

const defaultState = { goals: [] as Goal[] };

export const useGoalStore = create<GoalState>()(
  persist(
    (set) => ({
      ...defaultState,
      addGoal: (input) =>
        set((state) => ({
          goals: [
            ...state.goals,
            {
              id: createId(),
              metric: input.metric,
              period: input.period,
              target: input.target,
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      updateGoal: (id, patch) =>
        set((state) => ({
          goals: state.goals.map((goal) => (goal.id === id ? { ...goal, ...patch } : goal)),
        })),
      removeGoal: (id) => set((state) => ({ goals: state.goals.filter((goal) => goal.id !== id) })),
      replaceGoals: (goals) => set({ goals }),
    }),
    persistOptions<GoalState, Pick<GoalState, 'goals'>>({
      name: STORAGE_KEYS.goals,
      partialize: (state) => ({ goals: state.goals }),
      normalize: (persisted) => ({
        goals: normalizeArray(goalSchema, asRecord(persisted).goals),
      }),
    }),
  ),
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FitnessPlan, WorkoutRecord, Exercise } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { persistOptions } from './persist';
import { asRecord, normalizeArray } from './normalize';
import { fitnessPlanSchema, workoutRecordSchema } from '../services/schemas';
import { normalizeTags } from '../utils/tags';

interface FitnessState {
  plans: FitnessPlan[];
  records: WorkoutRecord[];
  addPlan: (name: string, description: string, exercises?: Exercise[]) => void;
  /** 局部更新一个计划（改名字 / 改描述 / 换动作清单） */
  updatePlan: (id: string, patch: Partial<Omit<FitnessPlan, 'id' | 'createdAt'>>) => void;
  /** 把一次训练存成训练日模板 —— F16「把这次存成模板」 */
  addPlanFromRecord: (record: WorkoutRecord, name: string) => void;
  deletePlan: (id: string) => void;
  addRecord: (
    planName: string,
    date: string,
    exercises: Exercise[],
    notes: string,
    tags?: string[],
  ) => void;
  deleteRecord: (id: string) => void;
  replacePlans: (plans: FitnessPlan[]) => void;
  replaceRecords: (records: WorkoutRecord[]) => void;
}

const defaultState = { plans: [] as FitnessPlan[], records: [] as WorkoutRecord[] };

/**
 * 存进模板的动作要剥掉 id 与当时的重量。
 *
 * 为什么不留重量：模板记的是「做哪些动作、各几组几次」，「推日卧推 60kg」里的
 * 60kg 是那一天的状态，不是模板的一部分 —— 留着它，三个月后套用会把当时的重量
 * 当成今天的建议，那是会误导人的。组数次数留下，重量清零让人自己填。
 */
function planExercisesFrom(record: WorkoutRecord): Exercise[] {
  return record.exercises.map(({ name, sets, reps }) => ({ name, sets, reps, weight: 0 }));
}

export const useFitnessStore = create<FitnessState>()(
  persist(
    (set) => ({
      ...defaultState,
      addPlan: (name, description, exercises = []) =>
        set((state) => ({
          plans: [
            ...state.plans,
            {
              id: createId(),
              name,
              description,
              exercises: exercises.map((ex) => ({ ...ex, id: ex.id || createId() })),
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      updatePlan: (id, patch) =>
        set((state) => ({
          plans: state.plans.map((plan) => (plan.id === id ? { ...plan, ...patch } : plan)),
        })),
      addPlanFromRecord: (record, name) =>
        set((state) => ({
          plans: [
            ...state.plans,
            {
              id: createId(),
              name,
              description: '',
              exercises: planExercisesFrom(record).map((ex) => ({ ...ex, id: createId() })),
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      deletePlan: (id) => set((state) => ({ plans: state.plans.filter((p) => p.id !== id) })),
      addRecord: (planName, date, exercises, notes, tags = []) =>
        set((state) => ({
          records: [
            {
              id: createId(),
              planName,
              date,
              exercises: exercises.map((ex) => ({ ...ex, id: ex.id || createId() })),
              notes,
              tags: normalizeTags(tags),
              createdAt: new Date().toISOString(),
            },
            ...state.records,
          ],
        })),
      deleteRecord: (id) => set((state) => ({ records: state.records.filter((r) => r.id !== id) })),
      replacePlans: (plans) => set({ plans }),
      replaceRecords: (records) => set({ records }),
    }),
    persistOptions<FitnessState, Pick<FitnessState, 'plans' | 'records'>>({
      name: STORAGE_KEYS.fitness,
      partialize: (state) => ({ plans: state.plans, records: state.records }),
      normalize: (persisted) => {
        const raw = asRecord(persisted);
        return {
          plans: normalizeArray(fitnessPlanSchema, raw.plans),
          records: normalizeArray(workoutRecordSchema, raw.records),
        };
      },
    }),
  ),
);

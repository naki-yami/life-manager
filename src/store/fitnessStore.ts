import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FitnessPlan, WorkoutRecord, Exercise } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { STORE_VERSION, migrateState } from './persist';

interface FitnessState {
  plans: FitnessPlan[];
  records: WorkoutRecord[];
  addPlan: (name: string, description: string) => void;
  deletePlan: (id: string) => void;
  addRecord: (planName: string, date: string, exercises: Exercise[], notes: string) => void;
  deleteRecord: (id: string) => void;
  replacePlans: (plans: FitnessPlan[]) => void;
  replaceRecords: (records: WorkoutRecord[]) => void;
}

const defaultState = { plans: [] as FitnessPlan[], records: [] as WorkoutRecord[] };

export const useFitnessStore = create<FitnessState>()(
  persist(
    (set) => ({
      ...defaultState,
      addPlan: (name, description) =>
        set((state) => ({
          plans: [
            ...state.plans,
            { id: createId(), name, description, createdAt: new Date().toISOString() },
          ],
        })),
      deletePlan: (id) => set((state) => ({ plans: state.plans.filter((p) => p.id !== id) })),
      addRecord: (planName, date, exercises, notes) =>
        set((state) => ({
          records: [
            {
              id: createId(),
              planName,
              date,
              exercises: exercises.map((ex) => ({ ...ex, id: ex.id || createId() })),
              notes,
              createdAt: new Date().toISOString(),
            },
            ...state.records,
          ],
        })),
      deleteRecord: (id) => set((state) => ({ records: state.records.filter((r) => r.id !== id) })),
      replacePlans: (plans) => set({ plans }),
      replaceRecords: (records) => set({ records }),
    }),
    {
      name: STORAGE_KEYS.fitness,
      version: STORE_VERSION,
      partialize: (state) => ({ plans: state.plans, records: state.records }),
      migrate: (persisted) => migrateState(persisted, defaultState),
    },
  ),
);

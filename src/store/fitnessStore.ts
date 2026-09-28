import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FitnessPlan, WorkoutRecord, Exercise } from '../types';
import { generateId } from '../utils/helpers';

interface FitnessState {
  plans: FitnessPlan[];
  records: WorkoutRecord[];
  addPlan: (name: string, description: string) => void;
  deletePlan: (id: string) => void;
  addRecord: (planName: string, date: string, exercises: Exercise[], notes: string) => void;
  deleteRecord: (id: string) => void;
}

export const useFitnessStore = create<FitnessState>()(
  persist(
    (set) => ({
      plans: [],
      records: [],
      addPlan: (name, description) =>
        set((state) => ({
          plans: [
            ...state.plans,
            {
              id: generateId(),
              name,
              description,
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      deletePlan: (id) =>
        set((state) => ({ plans: state.plans.filter((p) => p.id !== id) })),
      addRecord: (planName, date, exercises, notes) =>
        set((state) => ({
          records: [
            {
              id: generateId(),
              planName,
              date,
              exercises: exercises.map((ex) => ({ ...ex, id: ex.id || generateId() })),
              notes,
              createdAt: new Date().toISOString(),
            },
            ...state.records,
          ],
        })),
      deleteRecord: (id) =>
        set((state) => ({ records: state.records.filter((r) => r.id !== id) })),
    }),
    { name: 'fitness-storage' }
  )
);

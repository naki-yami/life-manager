import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { WritingProject, WritingType, WritingStatus } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { STORE_VERSION, migrateState } from './persist';

interface WritingState {
  projects: WritingProject[];
  addProject: (title: string, type: WritingType) => void;
  updateProject: (id: string, updates: Partial<WritingProject>) => void;
  deleteProject: (id: string) => void;
  updateStatus: (id: string, status: WritingStatus) => void;
  updateWordCount: (id: string, wordCount: number) => void;
  updateNotes: (id: string, notes: string) => void;
  replaceProjects: (projects: WritingProject[]) => void;
}

const defaultState = { projects: [] as WritingProject[] };

export const useWritingStore = create<WritingState>()(
  persist(
    (set) => ({
      ...defaultState,
      addProject: (title, type) =>
        set((state) => ({
          projects: [
            ...state.projects,
            {
              id: createId(),
              title,
              type,
              status: 'draft' as WritingStatus,
              wordCount: 0,
              notes: '',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        })),
      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p,
          ),
        })),
      deleteProject: (id) =>
        set((state) => ({ projects: state.projects.filter((p) => p.id !== id) })),
      updateStatus: (id, status) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, status, updatedAt: new Date().toISOString() } : p,
          ),
        })),
      updateWordCount: (id, wordCount) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, wordCount, updatedAt: new Date().toISOString() } : p,
          ),
        })),
      updateNotes: (id, notes) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, notes, updatedAt: new Date().toISOString() } : p,
          ),
        })),
      replaceProjects: (projects) => set({ projects }),
    }),
    {
      name: STORAGE_KEYS.writing,
      version: STORE_VERSION,
      partialize: (state) => ({ projects: state.projects }),
      migrate: (persisted) => migrateState(persisted, defaultState),
    },
  ),
);

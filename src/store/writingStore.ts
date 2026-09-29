import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { WritingProject, WritingSnapshot, WritingType, WritingStatus } from '../types';
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
  /** 保存正文：字数自动同步，并留一版快照（滚动保留 20 版） */
  updateContent: (id: string, content: string) => void;
  setTargetWords: (id: string, targetWords: number) => void;
  replaceProjects: (projects: WritingProject[]) => void;
}

/** 快照最多保留多少版 */
const MAX_SNAPSHOTS = 20;

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
              content: '',
              targetWords: 0,
              snapshots: [],
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
      updateContent: (id, content) =>
        set((state) => ({
          projects: state.projects.map((p) => {
            if (p.id !== id) return p;
            const wordCount = content.length;
            const lastSnapshot = p.snapshots[0];
            // 内容没变就不重复留版
            const snapshots: WritingSnapshot[] =
              lastSnapshot && lastSnapshot.content === content
                ? p.snapshots
                : [
                    {
                      id: createId(),
                      wordCount,
                      content,
                      createdAt: new Date().toISOString(),
                    },
                    ...p.snapshots,
                  ].slice(0, MAX_SNAPSHOTS);
            return { ...p, content, wordCount, snapshots, updatedAt: new Date().toISOString() };
          }),
        })),
      setTargetWords: (id, targetWords) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id
              ? { ...p, targetWords: Math.max(0, Math.round(targetWords)) }
              : p,
          ),
        })),
      replaceProjects: (projects) => set({ projects }),
    }),
    {
      name: STORAGE_KEYS.writing,
      version: STORE_VERSION,
      partialize: (state) => ({ projects: state.projects }),
      // 旧数据没有正文、目标字数与快照，补默认值
      migrate: (persisted) => {
        const state = migrateState(persisted, defaultState);
        return {
          ...state,
          projects: state.projects.map((project) => ({
            ...project,
            content: project.content ?? '',
            targetWords: project.targetWords ?? 0,
            snapshots: project.snapshots ?? [],
          })),
        };
      },
    },
  ),
);

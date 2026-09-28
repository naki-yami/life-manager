import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DevProject, DevProjectStatus, DevTask, DevTaskStatus, Priority } from '../types';
import { generateId } from '../utils/helpers';

interface DevState {
  projects: DevProject[];
  addProject: (name: string, description: string) => void;
  updateProject: (id: string, updates: Partial<DevProject>) => void;
  deleteProject: (id: string) => void;
  updateProjectStatus: (id: string, status: DevProjectStatus) => void;
  addTask: (projectId: string, title: string, priority: Priority) => void;
  updateTaskStatus: (projectId: string, taskId: string, status: DevTaskStatus) => void;
  deleteTask: (projectId: string, taskId: string) => void;
}

export const useDevStore = create<DevState>()(
  persist(
    (set) => ({
      projects: [],
      addProject: (name, description) =>
        set((state) => ({
          projects: [
            ...state.projects,
            {
              id: generateId(),
              name,
              description,
              status: 'planning' as DevProjectStatus,
              tasks: [],
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),
      deleteProject: (id) =>
        set((state) => ({ projects: state.projects.filter((p) => p.id !== id) })),
      updateProjectStatus: (id, status) =>
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, status } : p)),
        })),
      addTask: (projectId, title, priority) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  tasks: [
                    ...p.tasks,
                    {
                      id: generateId(),
                      title,
                      status: 'todo' as DevTaskStatus,
                      priority,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }
              : p
          ),
        })),
      updateTaskStatus: (projectId, taskId, status) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)),
                }
              : p
          ),
        })),
      deleteTask: (projectId, taskId) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) }
              : p
          ),
        })),
    }),
    { name: 'dev-storage' }
  )
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Task, Priority, TaskStatus, Memo } from '../types';
import { generateId } from '../utils/helpers';

interface TaskState {
  tasks: Task[];
  memos: Memo[];
  addTask: (title: string, description: string, priority: Priority, dueDate: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTaskStatus: (id: string) => void;
  addMemo: (content: string) => void;
  deleteMemo: (id: string) => void;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: [],
      memos: [],
      addTask: (title, description, priority, dueDate) =>
        set((state) => ({
          tasks: [
            ...state.tasks,
            {
              id: generateId(),
              title,
              description,
              priority,
              status: 'pending' as TaskStatus,
              dueDate,
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      updateTask: (id, updates) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),
      deleteTask: (id) =>
        set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
      toggleTaskStatus: (id) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: t.status === 'pending' ? 'completed' : 'pending',
                  completedAt: t.status === 'pending' ? new Date().toISOString() : undefined,
                }
              : t
          ),
        })),
      addMemo: (content) =>
        set((state) => ({
          memos: [
            { id: generateId(), content, createdAt: new Date().toISOString() },
            ...state.memos,
          ],
        })),
      deleteMemo: (id) =>
        set((state) => ({ memos: state.memos.filter((m) => m.id !== id) })),
    }),
    { name: 'tasks-storage' }
  )
);

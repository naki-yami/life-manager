import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Task, Priority, SubTask, TaskStatus, Memo, RepeatRule } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { STORE_VERSION, migrateState } from './persist';
import { nextDueDate } from '../utils/repeat';
import { todayKey } from '../utils/date';

interface TaskState {
  tasks: Task[];
  memos: Memo[];
  addTask: (
    title: string,
    description: string,
    priority: Priority,
    dueDate: string,
    repeat?: RepeatRule | null,
  ) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTaskStatus: (id: string) => void;
  addSubtask: (taskId: string, title: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;
  addMemo: (content: string) => void;
  deleteMemo: (id: string) => void;
  replaceTasks: (tasks: Task[]) => void;
  replaceMemos: (memos: Memo[]) => void;
}

const defaultState = { tasks: [] as Task[], memos: [] as Memo[] };

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      ...defaultState,
      addTask: (title, description, priority, dueDate, repeat = null) =>
        set((state) => ({
          tasks: [
            ...state.tasks,
            {
              id: createId(),
              title,
              description,
              priority,
              status: 'pending' as TaskStatus,
              dueDate,
              subtasks: [] as SubTask[],
              repeat: repeat ?? null,
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      updateTask: (id, updates) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),
      deleteTask: (id) => set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
      toggleTaskStatus: (id) =>
        set((state) => {
          const target = state.tasks.find((t) => t.id === id);
          if (!target) return state;

          const completing = target.status === 'pending';
          const nextTasks = state.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: (completing ? 'completed' : 'pending') as TaskStatus,
                  completedAt: completing ? new Date().toISOString() : undefined,
                }
              : t,
          );

          // 重复任务完成时自动生成下一次：新 id、清空完成时间、子任务重置为未做
          if (completing && target.repeat) {
            const due = target.dueDate || todayKey();
            nextTasks.push({
              ...target,
              id: createId(),
              status: 'pending',
              completedAt: undefined,
              dueDate: nextDueDate(target.repeat, due),
              subtasks: target.subtasks.map((subtask) => ({ ...subtask, done: false })),
              createdAt: new Date().toISOString(),
            });
          }

          return { tasks: nextTasks };
        }),
      addSubtask: (taskId, title) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  subtasks: [
                    ...t.subtasks,
                    { id: createId(), title, done: false },
                  ],
                }
              : t,
          ),
        })),
      toggleSubtask: (taskId, subtaskId) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  subtasks: t.subtasks.map((s) =>
                    s.id === subtaskId ? { ...s, done: !s.done } : s,
                  ),
                }
              : t,
          ),
        })),
      deleteSubtask: (taskId, subtaskId) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId
              ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subtaskId) }
              : t,
          ),
        })),
      addMemo: (content) =>
        set((state) => ({
          memos: [{ id: createId(), content, createdAt: new Date().toISOString() }, ...state.memos],
        })),
      deleteMemo: (id) => set((state) => ({ memos: state.memos.filter((m) => m.id !== id) })),
      replaceTasks: (tasks) => set({ tasks }),
      replaceMemos: (memos) => set({ memos }),
    }),
    {
      name: STORAGE_KEYS.tasks,
      version: STORE_VERSION,
      partialize: (state) => ({ tasks: state.tasks, memos: state.memos }),
      // 旧数据的任务没有子任务与重复规则，补默认值，避免界面上出现 undefined
      migrate: (persisted) => {
        const state = migrateState(persisted, defaultState);
        return {
          ...state,
          tasks: state.tasks.map((task) => ({
            ...task,
            subtasks: task.subtasks ?? [],
            repeat: task.repeat ?? null,
          })),
        };
      },
    },
  ),
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Task, Priority, SubTask, TaskStatus, Memo, RepeatRule, TaskTimebox } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { persistOptions } from './persist';
import { asRecord, normalizeArray } from './normalize';
import { memoSchema, taskSchema } from '../services/schemas';
import { nextDueDate } from '../utils/repeat';
import { todayKey } from '../utils/date';
import { normalizeTags } from '../utils/tags';
import { normalizeTimebox } from '../utils/focus';

interface TaskState {
  tasks: Task[];
  memos: Memo[];
  addTask: (
    title: string,
    description: string,
    priority: Priority,
    dueDate: string,
    repeat?: RepeatRule | null,
    tags?: string[],
  ) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  /** 排 / 撤时间盒；传 null 表示把任务从时间轴上拿下来 */
  setTimebox: (taskId: string, timebox: TaskTimebox | null) => void;
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
      addTask: (title, description, priority, dueDate, repeat = null, tags = []) =>
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
              timebox: null,
              tags: normalizeTags(tags),
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      updateTask: (id, updates) =>
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),
      // 合法性判定放在这，页面只管把落点丢进来；不合法就是「没排」，
      // 不会在时间轴上留下一个画不出来的盒子
      setTimebox: (taskId, timebox) =>
        set((state) => ({
          tasks: state.tasks.map((t) =>
            t.id === taskId ? { ...t, timebox: normalizeTimebox(timebox) } : t,
          ),
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
            const nextDate = nextDueDate(target.repeat, due);
            nextTasks.push({
              ...target,
              id: createId(),
              status: 'pending',
              completedAt: undefined,
              dueDate: nextDate,
              // 下一轮沿用同一个时间点，只把日期换掉 ——
              // 否则「每天 09:00 跑步」第二天就掉出时间轴了
              timebox: target.timebox ? { ...target.timebox, date: nextDate } : null,
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
    persistOptions<TaskState, Pick<TaskState, 'tasks' | 'memos'>>({
      name: STORAGE_KEYS.tasks,
      partialize: (state) => ({ tasks: state.tasks, memos: state.memos }),
      // 旧数据的任务没有子任务与重复规则，按 schema 补默认值。
      // 这一步挂在 merge 上，每次启动都会补齐，不再依赖版本号变化。
      normalize: (persisted) => {
        const raw = asRecord(persisted);
        return {
          tasks: normalizeArray(taskSchema, raw.tasks),
          memos: normalizeArray(memoSchema, raw.memos),
        };
      },
    }),
  ),
);

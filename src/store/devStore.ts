import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DevItemType,
  DevProject,
  DevProjectStatus,
  DevTask,
  DevTaskStatus,
  Priority,
  WorkSession,
} from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { persistOptions } from './persist';
import { asRecord, normalizeArray } from './normalize';
import { devProjectSchema, workSessionSchema } from '../services/schemas';
import { normalizeTags } from '../utils/tags';

interface DevState {
  projects: DevProject[];
  /** 工时流水，用来做「最近 30 天投入」这类按时间的统计 */
  sessions: WorkSession[];
  /** 返回新项目的 id，方便调用方立刻展开它 */
  addProject: (name: string, description: string, tags?: string[]) => string;
  updateProject: (id: string, updates: Partial<DevProject>) => void;
  deleteProject: (id: string) => void;
  updateProjectStatus: (id: string, status: DevProjectStatus) => void;
  addTask: (projectId: string, title: string, priority: Priority, type?: DevItemType) => void;
  updateTaskStatus: (projectId: string, taskId: string, status: DevTaskStatus) => void;
  deleteTask: (projectId: string, taskId: string) => void;
  /** 看板拖拽后整表写回某个项目的任务（顺序与状态一起定） */
  reorderTasks: (projectId: string, tasks: DevTask[]) => void;
  addMilestone: (projectId: string, title: string, dueDate?: string) => void;
  toggleMilestone: (projectId: string, milestoneId: string) => void;
  deleteMilestone: (projectId: string, milestoneId: string) => void;
  addLog: (projectId: string, date: string, content: string) => void;
  deleteLog: (projectId: string, logId: string) => void;
  /** 记一次工时：写流水的同时把工时累加到项目上 */
  addSession: (projectId: string, date: string, hours: number, note: string) => void;
  deleteSession: (id: string) => void;
  replaceProjects: (projects: DevProject[]) => void;
  replaceSessions: (sessions: WorkSession[]) => void;
}

const defaultState = { projects: [] as DevProject[], sessions: [] as WorkSession[] };

/** 累计工时不允许为负，删流水时用得上 */
const clampHours = (hours: number): number => Math.max(0, Math.round(hours * 100) / 100);

export const useDevStore = create<DevState>()(
  persist(
    (set) => ({
      ...defaultState,
      addProject: (name, description, tags = []) => {
        const project: DevProject = {
          id: createId(),
          name,
          description,
          status: 'planning',
          tasks: [],
          tags: normalizeTags(tags),
          hoursSpent: 0,
          techStack: [],
          repoUrl: '',
          archived: false,
          milestones: [],
          logs: [],
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ projects: [...state.projects, project] }));
        return project.id;
      },
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
      addTask: (projectId, title, priority, type) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  tasks: [
                    ...p.tasks,
                    {
                      id: createId(),
                      title,
                      status: 'todo' as DevTaskStatus,
                      priority,
                      type: type ?? 'feature',
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }
              : p,
          ),
        })),
      updateTaskStatus: (projectId, taskId, status) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) }
              : p,
          ),
        })),
      deleteTask: (projectId, taskId) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, tasks: p.tasks.filter((t) => t.id !== taskId) } : p,
          ),
        })),
      reorderTasks: (projectId, tasks) =>
        set((state) => ({
          projects: state.projects.map((p) => (p.id === projectId ? { ...p, tasks } : p)),
        })),
      addMilestone: (projectId, title, dueDate) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  milestones: [
                    ...p.milestones,
                    {
                      id: createId(),
                      title,
                      done: false,
                      ...(dueDate ? { dueDate } : {}),
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }
              : p,
          ),
        })),
      toggleMilestone: (projectId, milestoneId) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  milestones: p.milestones.map((m) =>
                    m.id === milestoneId ? { ...m, done: !m.done } : m,
                  ),
                }
              : p,
          ),
        })),
      deleteMilestone: (projectId, milestoneId) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? { ...p, milestones: p.milestones.filter((m) => m.id !== milestoneId) }
              : p,
          ),
        })),
      addLog: (projectId, date, content) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  logs: [
                    { id: createId(), date, content, createdAt: new Date().toISOString() },
                    ...p.logs,
                  ],
                }
              : p,
          ),
        })),
      deleteLog: (projectId, logId) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, logs: p.logs.filter((l) => l.id !== logId) } : p,
          ),
        })),
      addSession: (projectId, date, hours, note) =>
        set((state) => ({
          sessions: [
            {
              id: createId(),
              projectId,
              date,
              hours: clampHours(hours),
              note,
              createdAt: new Date().toISOString(),
            },
            ...state.sessions,
          ],
          // 流水与项目工时是一份数据，记一次就同步累加，避免两个数字互相打架
          projects: state.projects.map((project) =>
            project.id === projectId
              ? { ...project, hoursSpent: clampHours(project.hoursSpent + hours) }
              : project,
          ),
        })),
      deleteSession: (id) =>
        set((state) => {
          const target = state.sessions.find((session) => session.id === id);
          if (!target) return state;
          return {
            sessions: state.sessions.filter((session) => session.id !== id),
            projects: state.projects.map((project) =>
              project.id === target.projectId
                ? { ...project, hoursSpent: clampHours(project.hoursSpent - target.hours) }
                : project,
            ),
          };
        }),
      replaceProjects: (projects) => set({ projects }),
      replaceSessions: (sessions) => set({ sessions }),
    }),
    persistOptions<DevState, Pick<DevState, 'projects' | 'sessions'>>({
      name: STORAGE_KEYS.dev,
      partialize: (state) => ({ projects: state.projects, sessions: state.sessions }),
      // 工时、技术栈、归档、里程碑、日志、工作项分类都是历次迭代新加的字段，
      // 现在统一由 schema 补齐（含项目内嵌的工作项），不再逐版手写 map
      normalize: (persisted) => {
        const raw = asRecord(persisted);
        return {
          projects: normalizeArray(devProjectSchema, raw.projects),
          sessions: normalizeArray(workSessionSchema, raw.sessions),
        };
      },
    }),
  ),
);

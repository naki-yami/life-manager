import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DevProject, DevProjectStatus, DevTask, DevTaskStatus, Priority, WorkSession } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { STORE_VERSION, migrateState } from './persist';

interface DevState {
  projects: DevProject[];
  /** 工时流水，用来做「最近 30 天投入」这类按时间的统计 */
  sessions: WorkSession[];
  /** 返回新项目的 id，方便调用方立刻展开它 */
  addProject: (name: string, description: string) => string;
  updateProject: (id: string, updates: Partial<DevProject>) => void;
  deleteProject: (id: string) => void;
  updateProjectStatus: (id: string, status: DevProjectStatus) => void;
  addTask: (projectId: string, title: string, priority: Priority) => void;
  updateTaskStatus: (projectId: string, taskId: string, status: DevTaskStatus) => void;
  deleteTask: (projectId: string, taskId: string) => void;
  /** 看板拖拽后整表写回某个项目的任务（顺序与状态一起定） */
  reorderTasks: (projectId: string, tasks: DevTask[]) => void;
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
      addProject: (name, description) => {
        const project: DevProject = {
          id: createId(),
          name,
          description,
          status: 'planning',
          tasks: [],
          hoursSpent: 0,
          techStack: [],
          repoUrl: '',
          archived: false,
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
      addTask: (projectId, title, priority) =>
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
    {
      name: STORAGE_KEYS.dev,
      version: STORE_VERSION,
      partialize: (state) => ({ projects: state.projects, sessions: state.sessions }),
      // 旧数据里的项目没有 hoursSpent，补齐成 0，免得界面上出现 NaN；
      // v6 补齐技术栈 / 仓库地址 / 归档字段
      migrate: (persisted) => {
        const state = migrateState(persisted, defaultState);
        return {
          ...state,
          projects: state.projects.map((project) => ({
            ...project,
            hoursSpent: project.hoursSpent ?? 0,
            techStack: project.techStack ?? [],
            repoUrl: project.repoUrl ?? '',
            archived: project.archived ?? false,
          })),
        };
      },
    },
  ),
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActiveFocus, FocusMode, FocusSession, FocusTarget } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { dayKeyOf, todayKey } from '../utils/date';
import { elapsedMinutes, focusMinutes } from '../utils/focus';
import { persistOptions } from './persist';
import { asRecord, normalizeArray } from './normalize';
import { activeFocusSchema, focusSessionSchema } from '../services/schemas';

/**
 * 专注计时（番茄钟 / 正计时）。
 *
 * 三个约定：
 * - **同一时刻只有一个在跑的专注**：`active` 是单值而不是数组。人是单线程的，
 *   允许同时开两个表只会让「这次专注到底算多久」变成一笔糊涂账；
 * - **进行中与已完成分开存**：秒表在跑的时候不该在记录列表里出现半成品，
 *   刷新页面后要恢复的也只是「还在跑的那一个」；
 * - **取消不写记录**：只有真正结束（到点或手动停）才落一条流水，
 *   否则点开又点停会在地里积一堆 1 分钟的噪声。
 */

export interface StartFocusInput {
  /** 关联的实体 id；实体被删后这条记录靠 title 仍然可读 */
  entityId: string;
  title: string;
  target: FocusTarget;
  mode: FocusMode;
  plannedMinutes: number;
}

interface FocusState {
  sessions: FocusSession[];
  active: ActiveFocus | null;
  /** 开始一次专注；已有在跑的会被直接替换（替换不写记录） */
  startFocus: (input: StartFocusInput) => void;
  /** 放弃这次专注：不写记录 */
  cancelFocus: () => void;
  /** 结束并写一条记录；当前没有在跑的专注时返回 null */
  finishFocus: (endedAt?: Date) => FocusSession | null;
  deleteSession: (id: string) => void;
  /** 标记时长是否已经回填成对应模块的流水，避免重复写入 */
  markPosted: (id: string, posted?: boolean) => void;
  replaceSessions: (sessions: FocusSession[]) => void;
}

const defaultState = { sessions: [] as FocusSession[], active: null as ActiveFocus | null };

export const useFocusStore = create<FocusState>()(
  persist(
    (set, get) => ({
      ...defaultState,
      startFocus: ({ entityId, title, target, mode, plannedMinutes }) =>
        set({
          active: {
            entityId,
            title,
            target,
            mode,
            plannedMinutes: focusMinutes(plannedMinutes),
            startedAt: new Date().toISOString(),
          },
        }),
      cancelFocus: () => set({ active: null }),
      finishFocus: (endedAt = new Date()) => {
        const active = get().active;
        if (!active) return null;

        const session: FocusSession = {
          id: createId(),
          // 跨零点的专注算在开始的那一天：用户说的是「昨晚那一轮」
          date: dayKeyOf(active.startedAt) ?? todayKey(),
          entityId: active.entityId,
          title: active.title,
          target: active.target,
          mode: active.mode,
          plannedMinutes: focusMinutes(active.plannedMinutes),
          minutes: focusMinutes(elapsedMinutes(active.startedAt, endedAt)),
          startedAt: active.startedAt,
          endedAt: endedAt.toISOString(),
          posted: false,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({ active: null, sessions: [...state.sessions, session] }));
        return session;
      },
      deleteSession: (id) =>
        set((state) => ({ sessions: state.sessions.filter((session) => session.id !== id) })),
      markPosted: (id, posted = true) =>
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === id ? { ...session, posted } : session,
          ),
        })),
      replaceSessions: (sessions) => set({ sessions }),
    }),
    persistOptions<FocusState, Pick<FocusState, 'sessions' | 'active'>>({
      name: STORAGE_KEYS.focus,
      partialize: (state) => ({ sessions: state.sessions, active: state.active }),
      // 进行中的专注也一起存：刷新页面后秒表接着走，不会因为一次 F5 丢掉这一轮
      normalize: (persisted) => {
        const raw = asRecord(persisted);
        const active = activeFocusSchema.safeParse(raw.active);
        return {
          sessions: normalizeArray(focusSessionSchema, raw.sessions),
          active: active.success ? active.data : null,
        };
      },
    }),
  ),
);

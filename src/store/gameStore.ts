import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Game, GamePlatform, GameSession, GameStatus } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { persistOptions } from './persist';
import { asRecord, normalizeArray } from './normalize';
import { gameSchema, gameSessionSchema } from '../services/schemas';
import { normalizeTags } from '../utils/tags';

interface GameState {
  games: Game[];
  /** 游玩流水，用来做「今年玩了多少小时」这类按时间的统计 */
  sessions: GameSession[];
  addGame: (name: string, platform: GamePlatform, tags?: string[]) => void;
  updateGame: (id: string, updates: Partial<Game>) => void;
  deleteGame: (id: string) => void;
  updateGameStatus: (id: string, status: GameStatus) => void;
  updateHoursPlayed: (id: string, hours: number) => void;
  addAchievement: (gameId: string, name: string, description: string) => void;
  toggleAchievement: (gameId: string, achievementId: string) => void;
  deleteAchievement: (gameId: string, achievementId: string) => void;
  /** 记一次游玩：写流水的同时把时长累加到游戏总时长上 */
  addSession: (gameId: string, date: string, hours: number, note: string) => void;
  deleteSession: (id: string) => void;
  replaceGames: (games: Game[]) => void;
  replaceSessions: (sessions: GameSession[]) => void;
}

const defaultState = { games: [] as Game[], sessions: [] as GameSession[] };

/** 总时长不允许为负，删流水时用得上 */
const clampHours = (hours: number): number => Math.max(0, Math.round(hours * 100) / 100);

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      ...defaultState,
      addGame: (name, platform, tags = []) =>
        set((state) => ({
          games: [
            ...state.games,
            {
              id: createId(),
              name,
              platform,
              status: 'playing' as GameStatus,
              hoursPlayed: 0,
              progress: 0,
              achievements: [],
              notes: '',
              tags: normalizeTags(tags),
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      updateGame: (id, updates) =>
        set((state) => ({
          games: state.games.map((g) => (g.id === id ? { ...g, ...updates } : g)),
        })),
      deleteGame: (id) => set((state) => ({ games: state.games.filter((g) => g.id !== id) })),
      updateGameStatus: (id, status) =>
        set((state) => ({
          games: state.games.map((g) => (g.id === id ? { ...g, status } : g)),
        })),
      updateHoursPlayed: (id, hours) =>
        set((state) => ({
          games: state.games.map((g) => (g.id === id ? { ...g, hoursPlayed: hours } : g)),
        })),
      addAchievement: (gameId, name, description) =>
        set((state) => ({
          games: state.games.map((g) =>
            g.id === gameId
              ? {
                  ...g,
                  achievements: [
                    ...g.achievements,
                    { id: createId(), name, description, unlocked: false },
                  ],
                }
              : g,
          ),
        })),
      toggleAchievement: (gameId, achievementId) =>
        set((state) => ({
          games: state.games.map((g) =>
            g.id === gameId
              ? {
                  ...g,
                  achievements: g.achievements.map((a) =>
                    a.id === achievementId ? { ...a, unlocked: !a.unlocked } : a,
                  ),
                }
              : g,
          ),
        })),
      deleteAchievement: (gameId, achievementId) =>
        set((state) => ({
          games: state.games.map((g) =>
            g.id === gameId
              ? { ...g, achievements: g.achievements.filter((a) => a.id !== achievementId) }
              : g,
          ),
        })),
      addSession: (gameId, date, hours, note) =>
        set((state) => ({
          sessions: [
            {
              id: createId(),
              gameId,
              date,
              hours: clampHours(hours),
              note,
              createdAt: new Date().toISOString(),
            },
            ...state.sessions,
          ],
          // 流水与总时长是一份数据，记一次就同步累加，避免两个数字互相打架
          games: state.games.map((g) =>
            g.id === gameId ? { ...g, hoursPlayed: clampHours(g.hoursPlayed + hours) } : g,
          ),
        })),
      deleteSession: (id) =>
        set((state) => {
          const target = state.sessions.find((session) => session.id === id);
          if (!target) return state;
          return {
            sessions: state.sessions.filter((session) => session.id !== id),
            games: state.games.map((g) =>
              g.id === target.gameId
                ? { ...g, hoursPlayed: clampHours(g.hoursPlayed - target.hours) }
                : g,
            ),
          };
        }),
      replaceGames: (games) => set({ games }),
      replaceSessions: (sessions) => set({ sessions }),
    }),
    persistOptions<GameState, Pick<GameState, 'games' | 'sessions'>>({
      name: STORAGE_KEYS.games,
      partialize: (state) => ({ games: state.games, sessions: state.sessions }),
      normalize: (persisted) => {
        const raw = asRecord(persisted);
        return {
          games: normalizeArray(gameSchema, raw.games),
          sessions: normalizeArray(gameSessionSchema, raw.sessions),
        };
      },
    }),
  ),
);

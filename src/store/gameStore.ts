import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Game, GamePlatform, GameStatus } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { STORE_VERSION, migrateState } from './persist';

interface GameState {
  games: Game[];
  addGame: (name: string, platform: GamePlatform) => void;
  updateGame: (id: string, updates: Partial<Game>) => void;
  deleteGame: (id: string) => void;
  updateGameStatus: (id: string, status: GameStatus) => void;
  updateHoursPlayed: (id: string, hours: number) => void;
  addAchievement: (gameId: string, name: string, description: string) => void;
  toggleAchievement: (gameId: string, achievementId: string) => void;
  deleteAchievement: (gameId: string, achievementId: string) => void;
  replaceGames: (games: Game[]) => void;
}

const defaultState = { games: [] as Game[] };

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      ...defaultState,
      addGame: (name, platform) =>
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
      replaceGames: (games) => set({ games }),
    }),
    {
      name: STORAGE_KEYS.games,
      version: STORE_VERSION,
      partialize: (state) => ({ games: state.games }),
      migrate: (persisted) => migrateState(persisted, defaultState),
    },
  ),
);

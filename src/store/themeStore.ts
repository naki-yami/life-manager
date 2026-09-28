import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { STORE_VERSION, migrateState } from './persist';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const defaultState: { theme: Theme } = { theme: 'light' };

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      ...defaultState,
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: STORAGE_KEYS.theme,
      version: STORE_VERSION,
      partialize: (state) => ({ theme: state.theme }),
      migrate: (persisted) => migrateState(persisted, defaultState),
    },
  ),
);

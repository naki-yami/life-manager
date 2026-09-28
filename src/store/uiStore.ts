import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { STORE_VERSION, migrateState } from './persist';

export type Density = 'comfortable' | 'compact';

interface UiState {
  /** 桌面端侧栏是否收起成图标条 */
  sidebarCollapsed: boolean;
  density: Density;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setDensity: (density: Density) => void;
  toggleDensity: () => void;
}

const defaultState: Pick<UiState, 'sidebarCollapsed' | 'density'> = {
  sidebarCollapsed: false,
  density: 'comfortable',
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...defaultState,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setDensity: (density) => set({ density }),
      toggleDensity: () =>
        set((state) => ({ density: state.density === 'compact' ? 'comfortable' : 'compact' })),
    }),
    {
      name: STORAGE_KEYS.ui,
      version: STORE_VERSION,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        density: state.density,
      }),
      migrate: (persisted) => migrateState(persisted, defaultState),
    },
  ),
);

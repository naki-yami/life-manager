import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { persistOptions } from './persist';
import { asRecord, pickBoolean, pickEnum } from './normalize';

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

const DENSITIES: readonly Density[] = ['comfortable', 'compact'];

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
    persistOptions<UiState, Pick<UiState, 'sidebarCollapsed' | 'density'>>({
      name: STORAGE_KEYS.ui,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        density: state.density,
      }),
      normalize: (persisted) => {
        const raw = asRecord(persisted);
        return {
          sidebarCollapsed: pickBoolean(raw.sidebarCollapsed, defaultState.sidebarCollapsed),
          density: pickEnum(raw.density, DENSITIES, defaultState.density),
        };
      },
    }),
  ),
);

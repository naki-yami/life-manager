import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { persistOptions } from './persist';
import { asRecord, pickBoolean, pickEnum } from './normalize';

export type Density = 'comfortable' | 'compact';

/**
 * 首页仪表盘上的卡片。id 是稳定标识，改标题、换布局都不会影响用户已经排好的顺序，
 * 所以这里只存 id + 尺寸 + 是否隐藏，具体渲染什么由 `components/dashboard` 决定。
 */
export type DashboardWidgetId =
  | 'stats'
  | 'timeline'
  | 'capture'
  | 'focus'
  | 'todos'
  | 'memos'
  | 'habits'
  | 'body'
  | 'goals'
  | 'activity'
  | 'modules';

/** 卡片宽度档位，对应 12 栏栅格里的 4 / 8 / 12 栏：小 + 中正好凑满一行 */
export type DashboardWidgetSize = 'sm' | 'md' | 'lg';

export interface DashboardWidget {
  id: DashboardWidgetId;
  size: DashboardWidgetSize;
  hidden: boolean;
}

export const DASHBOARD_WIDGET_IDS: readonly DashboardWidgetId[] = [
  'stats',
  'timeline',
  'capture',
  'focus',
  'todos',
  'memos',
  'habits',
  'body',
  'goals',
  'activity',
  'modules',
];

export const DASHBOARD_WIDGET_SIZES: readonly DashboardWidgetSize[] = ['sm', 'md', 'lg'];

/**
 * 默认排布：统计整行 → 今日时间轴整行（时间轴 + 专注计时）→ 快速添加 + 今日聚焦
 * → 待办 + 备忘 → 习惯 + 身体指标 → 目标达成 + 热力图 → 模块概览
 */
export const DEFAULT_DASHBOARD: readonly DashboardWidget[] = [
  { id: 'stats', size: 'lg', hidden: false },
  { id: 'timeline', size: 'lg', hidden: false },
  { id: 'capture', size: 'md', hidden: false },
  { id: 'focus', size: 'sm', hidden: false },
  { id: 'todos', size: 'md', hidden: false },
  { id: 'memos', size: 'sm', hidden: false },
  { id: 'habits', size: 'md', hidden: false },
  { id: 'body', size: 'sm', hidden: false },
  { id: 'goals', size: 'md', hidden: false },
  { id: 'activity', size: 'lg', hidden: false },
  { id: 'modules', size: 'lg', hidden: false },
];

const defaultSizeOf = (id: DashboardWidgetId): DashboardWidgetSize =>
  DEFAULT_DASHBOARD.find((item) => item.id === id)?.size ?? 'lg';

const isWidgetId = (value: unknown): value is DashboardWidgetId =>
  typeof value === 'string' && (DASHBOARD_WIDGET_IDS as readonly string[]).includes(value);

/**
 * 归一化仪表盘配置：丢掉认不出的 id 与重复项，再补上配置里缺失的卡片。
 *
 * 补全这一步是「以后新增卡片」的兼容路径 —— 老的持久化数据里没有新卡片，
 * 读出来也能自己长出来，而不是要用户手动点一次「恢复默认」。
 */
export function normalizeDashboard(value: unknown): DashboardWidget[] {
  const raw = Array.isArray(value) ? value : [];
  const result: DashboardWidget[] = [];
  const seen = new Set<DashboardWidgetId>();

  for (const entry of raw) {
    const item = asRecord(entry);
    if (!isWidgetId(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push({
      id: item.id,
      size: pickEnum(item.size, DASHBOARD_WIDGET_SIZES, defaultSizeOf(item.id)),
      hidden: pickBoolean(item.hidden, false),
    });
  }

  for (const id of DASHBOARD_WIDGET_IDS) {
    if (seen.has(id)) continue;
    result.push({ id, size: defaultSizeOf(id), hidden: false });
  }

  return result;
}

/** 把 activeId 挪到 overId 原来的位置；找不到任一项时原样返回 */
function moveWidget(
  widgets: readonly DashboardWidget[],
  activeId: DashboardWidgetId,
  overId: DashboardWidgetId,
): DashboardWidget[] {
  const from = widgets.findIndex((item) => item.id === activeId);
  const to = widgets.findIndex((item) => item.id === overId);
  if (from < 0 || to < 0 || from === to) return [...widgets];

  const next = [...widgets];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

interface UiState {
  /** 桌面端侧栏是否收起成图标条 */
  sidebarCollapsed: boolean;
  density: Density;
  /** 首页仪表盘的排布、尺寸与隐藏状态 */
  dashboard: DashboardWidget[];
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setDensity: (density: Density) => void;
  toggleDensity: () => void;
  moveDashboardWidget: (activeId: DashboardWidgetId, overId: DashboardWidgetId) => void;
  setWidgetSize: (id: DashboardWidgetId, size: DashboardWidgetSize) => void;
  setWidgetHidden: (id: DashboardWidgetId, hidden: boolean) => void;
  resetDashboard: () => void;
}

const defaultState: Pick<UiState, 'sidebarCollapsed' | 'density' | 'dashboard'> = {
  sidebarCollapsed: false,
  density: 'comfortable',
  dashboard: DEFAULT_DASHBOARD.map((item) => ({ ...item })),
};

const DENSITIES: readonly Density[] = ['comfortable', 'compact'];

const updateWidget = (
  widgets: readonly DashboardWidget[],
  id: DashboardWidgetId,
  patch: Partial<Omit<DashboardWidget, 'id'>>,
): DashboardWidget[] => widgets.map((item) => (item.id === id ? { ...item, ...patch } : item));

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...defaultState,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setDensity: (density) => set({ density }),
      toggleDensity: () =>
        set((state) => ({ density: state.density === 'compact' ? 'comfortable' : 'compact' })),
      moveDashboardWidget: (activeId, overId) =>
        set((state) => ({ dashboard: moveWidget(state.dashboard, activeId, overId) })),
      setWidgetSize: (id, size) =>
        set((state) => ({ dashboard: updateWidget(state.dashboard, id, { size }) })),
      setWidgetHidden: (id, hidden) =>
        set((state) => ({ dashboard: updateWidget(state.dashboard, id, { hidden }) })),
      resetDashboard: () => set({ dashboard: DEFAULT_DASHBOARD.map((item) => ({ ...item })) }),
    }),
    persistOptions<UiState, Pick<UiState, 'sidebarCollapsed' | 'density' | 'dashboard'>>({
      name: STORAGE_KEYS.ui,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        density: state.density,
        dashboard: state.dashboard,
      }),
      normalize: (persisted) => {
        const raw = asRecord(persisted);
        return {
          sidebarCollapsed: pickBoolean(raw.sidebarCollapsed, defaultState.sidebarCollapsed),
          density: pickEnum(raw.density, DENSITIES, defaultState.density),
          dashboard: normalizeDashboard(raw.dashboard),
        };
      },
    }),
  ),
);

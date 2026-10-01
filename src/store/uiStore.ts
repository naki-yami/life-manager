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
  | 'today'
  | 'focus'
  | 'memos'
  | 'habits'
  | 'journal'
  | 'goals'
  | 'body'
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
  'focus',
  'today',
  'memos',
  'habits',
  'journal',
  'goals',
  'body',
  'activity',
  'modules',
];

export const DASHBOARD_WIDGET_SIZES: readonly DashboardWidgetSize[] = ['sm', 'md', 'lg'];

/**
 * 默认排布：统计整行 → 底下一整段双列 ——
 * 主列（左，8 栏）今天是主角，往下是习惯、目标、近 30 天活动、模块概览；
 * 辅列（右，4 栏）专注、快速备忘、今日心情、身体指标。
 *
 * 只有统计条是通栏，其余全在这一段里：通栏卡会把两列「切断」，短的那一列
 * 只能空着等长的那一列排完，页面上就出现一块填不满的空白（老首页「一会儿左、
 * 一会儿右、中间还空一块」的观感就是这么来的）。整段一起排，两列各自堆叠、
 * 互不挤位，也就没有谁在等谁。
 */
export const DEFAULT_DASHBOARD: readonly DashboardWidget[] = [
  { id: 'stats', size: 'lg', hidden: false },
  { id: 'focus', size: 'sm', hidden: false },
  { id: 'today', size: 'md', hidden: false },
  { id: 'memos', size: 'sm', hidden: false },
  { id: 'habits', size: 'md', hidden: false },
  { id: 'journal', size: 'sm', hidden: false },
  { id: 'goals', size: 'md', hidden: false },
  { id: 'body', size: 'sm', hidden: false },
  { id: 'activity', size: 'md', hidden: false },
  { id: 'modules', size: 'md', hidden: false },
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
 *
 * 补进来的卡片落在**最后一个「默认排在它前面」的老卡片之后**，而不是一律甩到末尾：
 * 老数据里没有它，就没有「用户把它排在哪儿」这回事，按默认排布落座才符合直觉
 * （新增的「今天」应该贴在上头，而不是掉到模块概览后面去）；同时只在某张老卡片
 * **之后**插，不去挤用户特意拖到最前面的那几张。
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
    const rank = defaultRank(id);
    let at = 0;
    for (let index = result.length - 1; index >= 0; index -= 1) {
      if (defaultRank(result[index]!.id) < rank) {
        at = index + 1;
        break;
      }
    }
    result.splice(at, 0, { id, size: defaultSizeOf(id), hidden: false });
  }

  return result;
}

/** 卡片在默认排布里的位置；不在默认排布里的一律排到最后 */
function defaultRank(id: DashboardWidgetId): number {
  const index = DEFAULT_DASHBOARD.findIndex((item) => item.id === id);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
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

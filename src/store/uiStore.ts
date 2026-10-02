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

/** 卡片宽度档位：`lg` 通栏独占一段，`md` 进主列，`sm` 进辅列 */
export type DashboardWidgetSize = 'sm' | 'md' | 'lg';

export interface DashboardWidget {
  id: DashboardWidgetId;
  size: DashboardWidgetSize;
  hidden: boolean;
}

/**
 * 全部卡片 id。**顺序与 `DEFAULT_DASHBOARD` 一致** ——
 * 归一化时给老数据补缺的卡片就按这个顺序走，两处顺序不一致会补出乱的排布。
 */
export const DASHBOARD_WIDGET_IDS: readonly DashboardWidgetId[] = [
  'stats',
  'today',
  'habits',
  'activity',
  'modules',
  'focus',
  'memos',
  'journal',
  'goals',
  'body',
];

export const DASHBOARD_WIDGET_SIZES: readonly DashboardWidgetSize[] = ['sm', 'md', 'lg'];

/**
 * 默认排布，按样稿的两列来：统计整行 → 底下一整段双列。
 *
 * 主列（左，1.62fr）**今天 → 今日习惯 → 近 30 天活动 → 模块概览**；
 * 辅列（右，1fr）**专注 → 快速备忘 → 今日心情 → 目标达成 → 身体指标**。
 *
 * 两条规矩：
 * - **只有统计条通栏**，其余全在这一段里。通栏卡会把两列「切断」，短的那一列只能
 *   空着等长的那一列排完，页面上就出现一块填不满的空白。
 * - **目标达成在辅列**（`sm`）。它以前是 `md` 落在主列，于是右边那列排到「今日心情」
 *   就断了，左侧底部空出一大块 —— 样稿里「目标」是紧接在「今日心情」下面的。
 *
 * 数据缺哪张卡，那张就不渲染，但**列位不变**：习惯没数据时主列正好是
 * 「今天 / 近 30 天活动 / 模块概览」，和样稿一致。
 */
export const DEFAULT_DASHBOARD: readonly DashboardWidget[] = [
  { id: 'stats', size: 'lg', hidden: false },
  { id: 'today', size: 'md', hidden: false },
  { id: 'habits', size: 'md', hidden: false },
  { id: 'activity', size: 'md', hidden: false },
  { id: 'modules', size: 'md', hidden: false },
  { id: 'focus', size: 'sm', hidden: false },
  { id: 'memos', size: 'sm', hidden: false },
  { id: 'journal', size: 'sm', hidden: false },
  { id: 'goals', size: 'sm', hidden: false },
  { id: 'body', size: 'sm', hidden: false },
];

const defaultSizeOf = (id: DashboardWidgetId): DashboardWidgetSize =>
  DEFAULT_DASHBOARD.find((item) => item.id === id)?.size ?? 'lg';

/**
 * 默认排布的版本号。**改 `DEFAULT_DASHBOARD` 时必须 +1。**
 *
 * 存档里记着「用户是在第几版默认排布之上排的」：
 * - 号比当前小（含完全没有这个字段的老存档）→ 那份排布是照着旧默认摆的，
 *   整体换成新默认；
 * - 号等于当前 → 用户已经在这套默认之上动过手，原样保留他的排布。
 *
 * 为什么不再去「猜」用户有没有动过（曾经试过：等于旧默认、或带着已下线的卡片 id）：
 * 真实用户的存档两种都不匹配 —— 他动过一两张卡，于是两条规则全部落空，
 * 我改了三轮默认值，他看到的始终是旧排布，还得出「越改越远」的观感。
 * **判断依据要来自明确的版本标记，不能靠形状反推。**
 */
export const DASHBOARD_LAYOUT_REVISION = 2;

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
  /** `dashboard` 是照着第几版默认排布摆的；见 `DASHBOARD_LAYOUT_REVISION` */
  dashboardRevision: number;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setDensity: (density: Density) => void;
  toggleDensity: () => void;
  moveDashboardWidget: (activeId: DashboardWidgetId, overId: DashboardWidgetId) => void;
  setWidgetSize: (id: DashboardWidgetId, size: DashboardWidgetSize) => void;
  setWidgetHidden: (id: DashboardWidgetId, hidden: boolean) => void;
  resetDashboard: () => void;
}

const defaultState: Pick<
  UiState,
  'sidebarCollapsed' | 'density' | 'dashboard' | 'dashboardRevision'
> = {
  sidebarCollapsed: false,
  density: 'comfortable',
  dashboard: DEFAULT_DASHBOARD.map((item) => ({ ...item })),
  dashboardRevision: DASHBOARD_LAYOUT_REVISION,
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
        set((state) => ({
          dashboard: moveWidget(state.dashboard, activeId, overId),
          dashboardRevision: DASHBOARD_LAYOUT_REVISION,
        })),
      setWidgetSize: (id, size) =>
        set((state) => ({
          dashboard: updateWidget(state.dashboard, id, { size }),
          dashboardRevision: DASHBOARD_LAYOUT_REVISION,
        })),
      setWidgetHidden: (id, hidden) =>
        set((state) => ({
          dashboard: updateWidget(state.dashboard, id, { hidden }),
          dashboardRevision: DASHBOARD_LAYOUT_REVISION,
        })),
      resetDashboard: () =>
        set({
          dashboard: DEFAULT_DASHBOARD.map((item) => ({ ...item })),
          dashboardRevision: DASHBOARD_LAYOUT_REVISION,
        }),
    }),
    persistOptions<
      UiState,
      Pick<UiState, 'sidebarCollapsed' | 'density' | 'dashboard' | 'dashboardRevision'>
    >({
      name: STORAGE_KEYS.ui,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        density: state.density,
        dashboard: state.dashboard,
        dashboardRevision: state.dashboardRevision,
      }),
      normalize: (persisted) => {
        const raw = asRecord(persisted);
        // 版本对不上（含完全没有这个字段的老存档）→ 整体换成当前默认。
        // 用户自己排过的那份是照着更早的默认摆的，留着只会和样稿差得更远；
        // 而只要他在这套默认之上动过一次手，版本就会被写上，之后不再被覆盖。
        const keepUserLayout = Number(raw.dashboardRevision) === DASHBOARD_LAYOUT_REVISION;
        return {
          sidebarCollapsed: pickBoolean(raw.sidebarCollapsed, defaultState.sidebarCollapsed),
          density: pickEnum(raw.density, DENSITIES, defaultState.density),
          dashboard: keepUserLayout
            ? normalizeDashboard(raw.dashboard)
            : DEFAULT_DASHBOARD.map((item) => ({ ...item })),
          dashboardRevision: DASHBOARD_LAYOUT_REVISION,
        };
      },
    }),
  ),
);

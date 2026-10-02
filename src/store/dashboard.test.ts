import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../utils/storageKeys';
import {
  DASHBOARD_LAYOUT_REVISION,
  DASHBOARD_WIDGET_IDS,
  DEFAULT_DASHBOARD,
  normalizeDashboard,
  useUiStore,
  type DashboardWidget,
  type DashboardWidgetId,
  type DashboardWidgetSize,
} from './uiStore';

/** 只取 id 顺序，断言比整对象更好读 */
const idsOf = (widgets: readonly DashboardWidget[]): DashboardWidgetId[] =>
  widgets.map((widget) => widget.id);

const sizeOf = (
  widgets: readonly DashboardWidget[],
  id: DashboardWidgetId,
): DashboardWidgetSize | undefined => widgets.find((widget) => widget.id === id)?.size;

const hiddenOf = (
  widgets: readonly DashboardWidget[],
  id: DashboardWidgetId,
): boolean | undefined => widgets.find((widget) => widget.id === id)?.hidden;

const defaultDashboard = (): DashboardWidget[] => DEFAULT_DASHBOARD.map((item) => ({ ...item }));

const persistedDashboard = (): Array<Record<string, unknown>> => {
  const raw = localStorage.getItem(STORAGE_KEYS.ui);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as { state?: { dashboard?: Array<Record<string, unknown>> } };
  return parsed.state?.dashboard ?? [];
};

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEYS.ui);
  useUiStore.setState({ dashboard: defaultDashboard() });
});

describe('normalizeDashboard', () => {
  it('没有数据时给出一份完整的默认排布', () => {
    const widgets = normalizeDashboard(undefined);

    expect(idsOf(widgets)).toEqual([...DASHBOARD_WIDGET_IDS]);
    expect(widgets.every((widget) => widget.hidden === false)).toBe(true);
  });

  it('丢掉认不出的 id 与重复项', () => {
    const widgets = normalizeDashboard([
      { id: 'stats', size: 'lg', hidden: false },
      { id: '未来才有的卡片' },
      { id: 'stats', size: 'sm', hidden: true },
      'not-an-object',
      null,
    ]);

    expect(idsOf(widgets)).toEqual([...DASHBOARD_WIDGET_IDS]);
    // 重复项被丢掉，保留的是先出现的那条（尺寸没被后一条覆盖）
    expect(sizeOf(widgets, 'stats')).toBe('lg');
  });

  it('尺寸与隐藏标记坏了就退回默认值，不影响其它字段', () => {
    const widgets = normalizeDashboard([
      { id: 'stats', size: '巨大', hidden: 'yes' },
      { id: 'focus', size: 'sm', hidden: true },
    ]);

    expect(widgets.find((widget) => widget.id === 'stats')).toEqual({
      id: 'stats',
      size: 'lg',
      hidden: false,
    });
    expect(widgets.find((widget) => widget.id === 'focus')).toEqual({
      id: 'focus',
      size: 'sm',
      hidden: true,
    });
  });

  it('持久化数据里缺的卡片按默认排布补进来，不是一律甩到末尾', () => {
    const widgets = normalizeDashboard([{ id: 'today', size: 'md', hidden: false }]);

    expect(idsOf(widgets)).toEqual([...DASHBOARD_WIDGET_IDS]);
    // 补出来的卡片用默认档位，且默认可见
    expect(sizeOf(widgets, 'focus')).toBe('sm');
    expect(hiddenOf(widgets, 'focus')).toBe(false);
  });

  it('补卡片时不动用户自己挪过的先后', () => {
    // 老数据里用户把模块概览拖到了统计前面；「今天」默认排在统计之后
    const widgets = normalizeDashboard([
      { id: 'modules', size: 'lg', hidden: false },
      { id: 'stats', size: 'lg', hidden: false },
    ]);
    const ids = idsOf(widgets);

    expect(ids).toHaveLength(DASHBOARD_WIDGET_IDS.length);
    expect(ids.indexOf('modules')).toBeLessThan(ids.indexOf('stats'));
    // 补在最后一张「默认排在它前面」的卡片之后，而不是插到最前头去
    expect(ids.indexOf('today')).toBeGreaterThan(ids.indexOf('stats'));
  });

  it('归一化是幂等的：跑两次结果一致', () => {
    const once = normalizeDashboard([{ id: 'today', size: 'sm', hidden: true }, { id: '不认识' }]);

    expect(normalizeDashboard(once)).toEqual(once);
  });
});

/**
 * 排布版本号（`DASHBOARD_LAYOUT_REVISION`）。
 *
 * 这几条对应真实事故：用户报「首页和样稿差的越来越多」，查下来是 `lm:ui` 里存着
 * 一份旧排布（`focus`/`memos` 在主列、`modules` 通栏），而我一直在改默认值 ——
 * **他看到的始终是存档，所以越改越远**。
 *
 * 曾经试过靠形状反推「用户有没有动过」（等于旧默认 / 带已下线的卡片 id），
 * 两种都不匹配他那种「动过一两张卡」的存档。所以改成明确的版本标记：
 * 号对不上就换新默认，号对得上就说明用户是在这套默认之上排的，原样保留。
 */
describe('仪表盘排布版本号', () => {
  /** 造一份「用户在这套默认之上把模块概览拖到了最前」的存档 */
  const customLayout = (): DashboardWidget[] => [
    { id: 'modules', size: 'md', hidden: false },
    { id: 'stats', size: 'lg', hidden: false },
    ...DEFAULT_DASHBOARD.filter((item) => item.id !== 'modules' && item.id !== 'stats'),
  ];

  const seedUi = (state: Record<string, unknown>): void => {
    localStorage.setItem(STORAGE_KEYS.ui, JSON.stringify({ state, version: 12 }));
    vi.resetModules();
  };

  it('老存档没有版本号 → 整体换成当前默认（用户不再卡在旧排布上）', async () => {
    seedUi({
      sidebarCollapsed: false,
      density: 'comfortable',
      // 正是用户那种存档：专注 / 备忘在主列、模块概览通栏
      dashboard: [
        { id: 'stats', size: 'lg', hidden: false },
        { id: 'today', size: 'md', hidden: false },
        { id: 'focus', size: 'md', hidden: false },
        { id: 'memos', size: 'md', hidden: false },
        { id: 'journal', size: 'sm', hidden: false },
        { id: 'modules', size: 'lg', hidden: false },
      ],
    });

    const fresh = await import('./uiStore');

    expect(idsOf(fresh.useUiStore.getState().dashboard)).toEqual([...DASHBOARD_WIDGET_IDS]);
    // 关键：模块概览不再通栏，回到主列和「今天」同宽
    expect(sizeOf(fresh.useUiStore.getState().dashboard, 'modules')).toBe('md');
  });

  it('版本号对得上 → 用户自己排的那份原样保留', async () => {
    seedUi({
      sidebarCollapsed: false,
      density: 'comfortable',
      dashboardRevision: DASHBOARD_LAYOUT_REVISION,
      dashboard: customLayout(),
    });

    const fresh = await import('./uiStore');
    const dashboard = fresh.useUiStore.getState().dashboard;

    expect(idsOf(dashboard)[0]).toBe('modules');
    expect(idsOf(dashboard)).toHaveLength(DASHBOARD_WIDGET_IDS.length);
  });

  it('版本号比当前旧 → 一样换成当前默认', async () => {
    seedUi({
      sidebarCollapsed: false,
      density: 'comfortable',
      dashboardRevision: DASHBOARD_LAYOUT_REVISION - 1,
      dashboard: customLayout(),
    });

    const fresh = await import('./uiStore');

    expect(idsOf(fresh.useUiStore.getState().dashboard)).toEqual([...DASHBOARD_WIDGET_IDS]);
  });

  it('用户动过布局之后版本号会被写上，之后不再被默认值覆盖', () => {
    useUiStore.getState().moveDashboardWidget('modules', 'stats');

    expect(useUiStore.getState().dashboardRevision).toBe(DASHBOARD_LAYOUT_REVISION);
    expect(idsOf(useUiStore.getState().dashboard)[0]).toBe('modules');
  });
});

describe('uiStore 仪表盘', () => {
  it('默认排布就是 DEFAULT_DASHBOARD', () => {
    expect(useUiStore.getState().dashboard).toEqual(defaultDashboard());
  });

  /**
   * 这条对着样稿的两列构成钉住。
   *
   * 主列（`md`）今天 / 今日习惯 / 近 30 天活动 / 模块概览；
   * 辅列（`sm`）专注 / 快速备忘 / 今日心情 / 目标达成 / 身体指标。
   *
   * 最容易被打回去的是**目标达成**：它曾经是 `md` 落在主列，于是右边那列排到
   * 「今日心情」就断了，左下空出一大块 —— 样稿里「目标」是紧接「今日心情」下面的。
   */
  it('默认排布的列构成按样稿：目标达成在辅列，不在主列', () => {
    const of = (size: DashboardWidgetSize): DashboardWidgetId[] =>
      defaultDashboard()
        .filter((widget) => widget.size === size)
        .map((widget) => widget.id);

    expect(of('md')).toEqual(['today', 'habits', 'activity', 'modules']);
    expect(of('sm')).toEqual(['focus', 'memos', 'journal', 'goals', 'body']);
    // 通栏只有统计条一条
    expect(of('lg')).toEqual(['stats']);
  });

  it('moveDashboardWidget 把卡片挪到目标卡片的位置', () => {
    useUiStore.getState().moveDashboardWidget('modules', 'stats');

    expect(idsOf(useUiStore.getState().dashboard).slice(0, 2)).toEqual(['modules', 'stats']);
    expect(useUiStore.getState().dashboard).toHaveLength(DASHBOARD_WIDGET_IDS.length);
  });

  it('向后挪动时不会把别人一起挤走', () => {
    const before = idsOf(useUiStore.getState().dashboard);

    useUiStore.getState().moveDashboardWidget('stats', 'focus');

    const after = idsOf(useUiStore.getState().dashboard);
    // 只有 stats 换了位置，其余卡片的相对先后一个没动
    expect(after.filter((id) => id !== 'stats')).toEqual(before.filter((id) => id !== 'stats'));
    expect(after.indexOf('stats')).toBe(before.indexOf('focus'));
  });

  it('挪到自己身上、或 id 认不出时原样返回，不会崩', () => {
    const before = useUiStore.getState().dashboard;

    useUiStore.getState().moveDashboardWidget('stats', 'stats');
    useUiStore.getState().moveDashboardWidget('不存在' as unknown as DashboardWidgetId, 'stats');

    expect(useUiStore.getState().dashboard).toEqual(before);
  });

  it('setWidgetSize 与 setWidgetHidden 只动目标卡片', () => {
    useUiStore.getState().setWidgetSize('today', 'lg');
    useUiStore.getState().setWidgetHidden('memos', true);

    const dashboard = useUiStore.getState().dashboard;
    expect(sizeOf(dashboard, 'today')).toBe('lg');
    expect(hiddenOf(dashboard, 'memos')).toBe(true);
    expect(dashboard.find((widget) => widget.id === 'stats')).toEqual({
      id: 'stats',
      size: 'lg',
      hidden: false,
    });
  });

  it('resetDashboard 把顺序、尺寸、隐藏一起还原', () => {
    useUiStore.getState().setWidgetSize('stats', 'sm');
    useUiStore.getState().setWidgetHidden('stats', true);
    useUiStore.getState().moveDashboardWidget('modules', 'stats');

    useUiStore.getState().resetDashboard();

    expect(useUiStore.getState().dashboard).toEqual(defaultDashboard());
  });

  it('排布会跟着侧栏 / 密度一起写进 lm:ui', async () => {
    useUiStore.getState().setWidgetSize('focus', 'lg');
    useUiStore.getState().setWidgetHidden('goals', true);

    await vi.waitFor(() => {
      const persisted = persistedDashboard();
      expect(persisted.find((widget) => widget.id === 'focus')?.size).toBe('lg');
      expect(persisted.find((widget) => widget.id === 'goals')?.hidden).toBe(true);
    });
  });

  it('重新载入时把脏数据归一化成当前结构', async () => {
    localStorage.setItem(
      STORAGE_KEYS.ui,
      JSON.stringify({
        state: {
          sidebarCollapsed: true,
          density: 'compact',
          dashboard: [{ id: 'stats', size: 'xxl', hidden: 'yes' }, { id: '未知卡片' }],
        },
        version: 11,
      }),
    );
    vi.resetModules();

    const fresh = await import('./uiStore');
    const dashboard = fresh.useUiStore.getState().dashboard;

    expect(idsOf(dashboard)).toEqual([
      'stats',
      ...DASHBOARD_WIDGET_IDS.filter((id) => id !== 'stats'),
    ]);
    expect(dashboard[0]).toEqual({ id: 'stats', size: 'lg', hidden: false });
    // 同一次 rehydrate 里的其它字段照旧
    expect(fresh.useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(fresh.useUiStore.getState().density).toBe('compact');
  });

  it('完全没有仪表盘字段的老数据也能长出默认排布', async () => {
    localStorage.setItem(
      STORAGE_KEYS.ui,
      JSON.stringify({ state: { sidebarCollapsed: false, density: 'comfortable' }, version: 11 }),
    );
    vi.resetModules();

    const fresh = await import('./uiStore');
    expect(idsOf(fresh.useUiStore.getState().dashboard)).toEqual([...DASHBOARD_WIDGET_IDS]);
  });
});

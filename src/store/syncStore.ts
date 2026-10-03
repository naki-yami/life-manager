import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { asRecord, pickBoolean, pickNumber } from './normalize';
import { persistOptions } from './persist';

/**
 * 同步的元数据：`lm:sync`。
 *
 * 它是一份**与业务 store 平行的独立持久化单元**，不是任何一个数据模块的一部分。
 * 这样安排的唯一目的是那条红线：**令牌与设备标识绝不进备份、绝不进导出**。
 * 导出文件会落到同步盘、U 盘、聊天窗口里，令牌跟着走等于把钥匙一起寄出去；
 * 而备份模块是照 `DATA_STORAGE_KEYS`（`utils/storageKeys.ts`）取数的，
 * `lm:sync` 不在册，三条备份路径（导出、自动快照、崩溃兜底导出）就都看不到它。
 *
 * 因此本模块**绝不能**进 `src/services/appData.ts` 的 `readAllData()`，
 * 也绝不能把自己的 key 加进 `DATA_STORAGE_KEYS`。
 *
 * 关闭时应用是纯本地的：开关默认关闭，业务 store 不接触令牌，
 * 网络请求只在同步引擎里发（工单 04），而引擎开机时先看这个开关。
 */

/** 令牌的展示形式：只露头尾各 4 位，够用户认出「填的是哪一枚」，又不至于被肩窥抄走 */
export interface TokenHint {
  head: string;
  tail: string;
}

export interface SyncState {
  /** 同步总开关。**默认关闭**；关闭时不发任何请求，也不读写令牌 */
  enabled: boolean;
  /** 同步服务地址（例如 `http://127.0.0.1:8787`），空串表示还没填 */
  baseUrl: string;
  /** 设置页填一次的预共享令牌；空串表示还没填。**这是「能不能连」，不是身份** */
  token: string;
  /**
   * 设备标识：开启同步时生成一次，之后固定。
   *
   * 它回答的是「这条改动是哪台设备写的」，与令牌（回答「你能不能连」）是两件事。
   * 关闭开关并**不清除**它 —— 重开还是同一台设备，不会在服务端留下两个自己。
   */
  deviceId: string;
  /** 本机记的「拉到哪了」：服务端副本的 seq 游标。它**不是**记录版本 */
  lastSeq: number;
  /**
   * 内容哈希基线：模块名 → 条目 id → 内容哈希。
   *
   * 它是**可丢弃的派生物**，删掉只会让下次同步退化成全量比对 —— 按 spec 那张表，
   * 「基线里没有的 id 不产生 delete」，所以丢了它不会误删任何东西。
   */
  baseline: Record<string, Record<string, string>>;
  /** 最近一次同步里服务端判为冲突的条目（只留最近一次） */
  conflicts: SyncConflict[];
  /** 导入 / 回滚 / 清除数据之后置位：id 集合与内容大改，要用户点一下才重新对账 */
  needsReconcile: boolean;
  /** 打开开关：首次开启时顺带把设备标识定下来 */
  setEnabled: (enabled: boolean) => void;
  /** 设置页填服务地址；顺手去掉首尾空白与结尾的 `/`，免得拼出 `//v1/health` */
  setBaseUrl: (baseUrl: string) => void;
  /** 设置页填令牌 */
  setToken: (token: string) => void;
  /** 清除令牌（设置页的「清除」按钮），不清设备标识 */
  clearToken: () => void;
  /** 本机是否已经具备同步的准入条件：地址与令牌都填了 */
  isConfigured: () => boolean;
  /** 令牌的展示形式；没填令牌时为空串，界面据此决定是否渲染那一行 */
  tokenHint: () => string;
  /** 整块换基线（一轮同步全部成功之后才调用） */
  setBaseline: (baseline: Record<string, Record<string, string>>) => void;
  /** 删掉基线，下次同步退化成全量比对（不会产生任何 delete） */
  clearBaseline: () => void;
  /**
   * 推进 `lastSeq` 与基线。
   *
   * **只在一轮同步全部成功之后调用** —— 任何一步失败都不该动它们，
   * 否则失败的那一轮会把没落库的改动记成「已经拉过了」，下一轮就不再拉。
   */
  commitSync: (lastSeq: number, baseline: Record<string, Record<string, string>>) => void;
  /** 记下最近一次同步的冲突（整块替换，只留这一次） */
  setConflicts: (conflicts: SyncConflict[]) => void;
  /** 导入 / 回滚 / 清除数据之后置位，设置卡据此显示「需要重新对账」 */
  markNeedsReconcile: () => void;
  /** 用户点过「重新对账」之后复位 */
  clearNeedsReconcile: () => void;
}

/** 一条冲突：模块 + 条目标题 + 服务端那一份的时间（界面上给一行提示用） */
export interface SyncConflict {
  module: string;
  key: string;
  title: string;
  /** 服务端那份记录的时间；服务端没给就是空串 */
  serverUpdatedAt: string;
}

const defaultState = {
  enabled: false,
  baseUrl: '',
  token: '',
  deviceId: '',
  lastSeq: 0,
  baseline: {} as Record<string, Record<string, string>>,
  conflicts: [] as SyncConflict[],
  needsReconcile: false,
};

/** 服务地址落库前规范化：去空白、去结尾的 `/`，免得拼出 `//v1/health` */
function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/**
 * 归一化内容哈希基线。
 *
 * 形状是两层「字符串 → 字符串」的映射；层数不对或值不是字符串的条目直接剔掉，
 * 因为基线是可丢弃的派生物 —— 丢几个条目只会让那几条退化成「新增」，
 * 而留一条脏值会让 diff 算出无意义的结论。
 */
function normalizeBaseline(raw: unknown): Record<string, Record<string, string>> {
  const modules = asRecord(raw);
  const result: Record<string, Record<string, string>> = {};

  for (const [moduleName, rawEntries] of Object.entries(modules)) {
    const entries: Record<string, string> = {};
    for (const [key, hash] of Object.entries(asRecord(rawEntries))) {
      if (typeof hash === 'string' && key !== '' && hash !== '') entries[key] = hash;
    }
    result[moduleName] = entries;
  }
  return result;
}

/** 归一化冲突列表；条目缺字段的按空串补齐，坏到不是对象的丢掉 */
function normalizeConflicts(raw: unknown): SyncConflict[] {
  if (!Array.isArray(raw)) return [];

  const conflicts: SyncConflict[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const record = asRecord(entry);
    if (typeof record.module !== 'string' || typeof record.key !== 'string') continue;
    conflicts.push({
      module: record.module,
      key: record.key,
      title: typeof record.title === 'string' ? record.title : '',
      serverUpdatedAt: typeof record.serverUpdatedAt === 'string' ? record.serverUpdatedAt : '',
    });
  }
  return conflicts;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set, get) => ({
      ...defaultState,
      /*
       * 设备标识只在这里生成。
       *
       * 非空就原样留用 —— 「生成一次、之后固定」这条不能靠调用方自觉：
       * 每次开开关换一个标识，服务端就会把同一台设备认成两台，冲突判定跟着糊掉。
       */
      setEnabled: (enabled) =>
        set((state) => ({
          enabled,
          deviceId: enabled && state.deviceId === '' ? createId() : state.deviceId,
        })),
      setBaseUrl: (baseUrl) => set({ baseUrl: normalizeBaseUrl(baseUrl) }),
      setToken: (token) => set({ token }),
      clearToken: () => set({ token: '' }),
      isConfigured: () => {
        const state = get();
        return state.baseUrl !== '' && state.token !== '';
      },
      tokenHint: () => {
        const { token } = get();
        if (token === '') return '';
        if (token.length <= 8) return '••••';
        return `${token.slice(0, 4)}••••${token.slice(-4)}`;
      },
      setBaseline: (baseline) => set({ baseline }),
      clearBaseline: () => set({ baseline: {} }),
      commitSync: (lastSeq, baseline) => set({ lastSeq, baseline }),
      setConflicts: (conflicts) => set({ conflicts }),
      markNeedsReconcile: () => set({ needsReconcile: true }),
      clearNeedsReconcile: () => set({ needsReconcile: false }),
    }),
    persistOptions<SyncState, typeof defaultState>({
      name: STORAGE_KEYS.sync,
      partialize: (state) => ({
        enabled: state.enabled,
        baseUrl: state.baseUrl,
        token: state.token,
        deviceId: state.deviceId,
        lastSeq: state.lastSeq,
        baseline: state.baseline,
        conflicts: state.conflicts,
        needsReconcile: state.needsReconcile,
      }),
      // 缺字段回默认值、脏值挡回，老存档（还没有这张卡的时候）读出来就是「关闭 + 没填」
      normalize: (persisted) => {
        const raw = asRecord(persisted);
        return {
          enabled: pickBoolean(raw.enabled, defaultState.enabled),
          baseUrl: typeof raw.baseUrl === 'string' ? normalizeBaseUrl(raw.baseUrl) : '',
          token: typeof raw.token === 'string' ? raw.token : '',
          deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : '',
          lastSeq: pickNumber(raw.lastSeq, defaultState.lastSeq),
          baseline: normalizeBaseline(raw.baseline),
          conflicts: normalizeConflicts(raw.conflicts),
          needsReconcile: pickBoolean(raw.needsReconcile, defaultState.needsReconcile),
        };
      },
    }),
  ),
);

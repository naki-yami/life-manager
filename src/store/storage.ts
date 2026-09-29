import type { PersistStorage, StorageValue } from 'zustand/middleware';
import {
  BACKUP_KEY_PREFIX,
  LM_PREFIX,
  STORAGE_WARN_BYTES,
  appStorageKeys,
} from '../utils/storageKeys';
import {
  backendFor,
  localStorageStore,
  resolveStoreBackend,
  safeLocalStorage,
  type StoreKind,
} from './kv';
import {
  clearStorageFailure,
  getStorageFailure,
  isQuotaExceededError,
  reportStorageFailure,
  subscribeStorageFailure,
  type StorageFailure,
} from './storageFailure';

/**
 * 应用的存储层：zustand 的持久化后端 + 给备份 / 设置页用的读写入口。
 *
 * 数据落在哪：IndexedDB（可用时）或 localStorage（兜底）。判断与适配在 kv.ts，
 * 这里只管三件事 —— 「写失败要说出来」「首启把老数据搬过去」「两个后端一起读」。
 *
 * 这一层存在的理由（V2.0 就有了，V2.1 把它扩到两个后端）：
 * 1. **写入失败要能被用户看见**。存储写不进去时原生 API 会抛异常，异常从 store 的
 *    action 里冒出去，轻则这次改动没保存、重则整棵组件树崩掉，而用户完全不知情。
 *    这里统一吞掉异常并记录，应用继续以内存态运行，由 StorageAlert 提示「立刻导出备份」。
 * 2. **换存储后端只改一个文件**。从 localStorage 换到 IndexedDB 时，9 个 store 一行没动。
 */

// ------------------------------------------------------------------ 读写

/**
 * 每个 key 首次读取的 promise，读完就删。
 *
 * zustand 的持久化是异步的：反序列化还没跑完时如果先来了一次写入，
 * 写的会是「默认值 + 这次改动」，等老数据读回来就晚了 —— 老数据已经被盖掉。
 * 所以写入前先等首次读取落地；读完即从表里移除，免得后来读到的是过期快照。
 */
const hydrations = new Map<string, Promise<string | null>>();

function readOnce(key: string): Promise<string | null> {
  const running = hydrations.get(key);
  if (running) return running;

  const task = readAppValue(key).finally(() => {
    hydrations.delete(key);
  });
  hydrations.set(key, task);
  return task;
}

/**
 * 读一个应用数据 key。
 *
 * IndexedDB 生效而里面没有这条记录时，会把 localStorage 里的老数据**一次性搬过去**：
 * 只写不删 —— localStorage 里那份原样留着，是迁移出问题时的回溯副本，
 * 也是「IndexedDB 后来不可用」时的兜底（那时整条链路会退回 localStorage）。
 */
export async function readAppValue(key: string): Promise<string | null> {
  const backend = await backendFor(key);

  let stored: string | null;
  try {
    stored = await backend.store.get(key);
  } catch {
    // 读不出来按「没有存过」处理：宁可回默认值，也不要让应用起不来
    return null;
  }

  if (stored !== null || backend.kind === 'localstorage') return stored;

  const legacy = safeLocalStorage()?.getItem(key) ?? null;
  if (legacy === null) return null;

  try {
    await backend.store.set(key, legacy);
  } catch {
    // 搬不过去也不影响这次读取，值已经拿到了；下次启动再试
  }
  return legacy;
}

export async function writeAppValue(key: string, value: string): Promise<void> {
  const backend = await backendFor(key);
  await backend.store.set(key, value);
}

export async function removeAppValue(key: string): Promise<void> {
  const backend = await backendFor(key);
  try {
    await backend.store.remove(key);
  } catch {
    // 删除失败不影响后续流程（回滚等场景会再写一次）
  }
}

// ------------------------------------------------------------------ zustand 后端

export const persistStorage: PersistStorage<unknown> = {
  getItem: async (name) => {
    const raw = await readOnce(name);
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as StorageValue<unknown>;
    } catch {
      // 存的内容坏了：当作没存过，让 store 用默认值起来。
      // 但要说出来 —— 静默把用户数据换成默认值是最不该发生的那种「安静」。
      console.error(`[Life Manager] 本地存储里的「${name}」不是合法 JSON，已按空数据处理。`);
      reportStorageFailure(name, new Error('本地存储里的内容不是合法 JSON'), 'read');
      return null;
    }
  },

  /*
   * 故意不返回 promise。
   *
   * zustand 的 persist 用 `(...args) => { set(...args); return setItem(); }` 包住 set，
   * 也就是说**这个返回值会原样变成每个 action 的返回值**。异步后端一旦把 promise 透出去，
   * 所有 action 都成了「返回 promise 的 action」—— React 的 act() 会把它们当异步动作，
   * 时序全部错位（测试里表现为 act 不再同步 flush）。
   *
   * 而写入本来也没人 await：失败已经由 reportStorageFailure 接手，界面会弹 StorageAlert。
   */
  setItem: (name, value) => {
    void writePersisted(name, value);
  },

  removeItem: (name) => {
    void removeAppValue(name);
  },
};

/** 写入前先等首次读取落地（见上面 hydrations 的说明），失败只记录不抛 */
async function writePersisted(name: string, value: unknown): Promise<void> {
  const pending = hydrations.get(name);
  if (pending) await pending.catch(() => undefined);

  try {
    // JSON.stringify 也可能抛（循环引用），一并兜住，别留成未处理的 rejection
    await writeAppValue(name, JSON.stringify(value));
    clearStorageFailure(name);
  } catch (error) {
    reportStorageFailure(name, error);
  }
}

// ------------------------------------------------------------------ 备份与统计

/**
 * 读出两个后端里以 prefix 开头的键值对：主后端优先，localStorage 补齐。
 *
 * 为什么要合并两份：IndexedDB 是 V2.1 才启用的，升上来的用户数据（以及自动快照）
 * 还留在 localStorage 里 —— 只读 IndexedDB 会让它们凭空消失。
 */
export async function readStoredEntries(prefix: string): Promise<Array<[string, string]>> {
  const backend = await resolveStoreBackend();
  const primary = await backend.store.entries(prefix);
  if (backend.kind === 'localstorage') return primary;

  const merged = new Map(primary);
  for (const [key, value] of await localStorageStore.entries(prefix)) {
    if (!merged.has(key)) merged.set(key, value);
  }
  return [...merged];
}

/** 读出全部「模块状态」键值（不含快照），供自动快照使用 */
export async function readAppStateEntries(): Promise<Array<[string, string]>> {
  const wanted = new Set(appStorageKeys());
  const entries = await readStoredEntries(LM_PREFIX);
  return entries.filter(([key]) => wanted.has(key));
}

export interface AppStorageUsage {
  bytes: number;
  level: 'ok' | 'warning';
  /** 数据实际落在哪：IndexedDB（origin 配额，起步几百 MB）还是 localStorage（约 5MB） */
  backend: StoreKind;
}

/** 键值对占用的字节数；localStorage 与 IndexedDB 都是 UTF-16 存字符串，每字符 2 字节 */
function bytesOf(entries: ReadonlyArray<readonly [string, string]>): number {
  return entries.reduce((sum, [key, value]) => sum + (key.length + value.length) * 2, 0);
}

/**
 * IndexedDB 用的是 origin 配额（和 Cache Storage 共用），
 * 所以这里问浏览器「用了多少 / 一共多少」才有意义 —— 对 localStorage 的 5MB 上限没参考价值。
 */
async function indexedDbIsTight(): Promise<boolean> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    const quota = estimate?.quota ?? 0;
    return quota > 0 && (estimate?.usage ?? 0) / quota >= 0.7;
  } catch {
    return false;
  }
}

/**
 * 存储占用与告警级别。
 *
 * 只统计主后端：localStorage 里那份是迁移后留下的历史副本（见 readAppValue），
 * 把它算进来会让「占用」平白翻倍，也会让用户对着一个自己已经搬走的老数字发愁。
 */
export async function measureAppStorage(): Promise<AppStorageUsage> {
  const backend = await resolveStoreBackend();
  const bytes = bytesOf(await backend.store.entries(LM_PREFIX));

  let level: AppStorageUsage['level'] = 'ok';
  if (backend.kind === 'indexeddb') {
    level = (await indexedDbIsTight()) ? 'warning' : 'ok';
  } else if (bytes >= STORAGE_WARN_BYTES) {
    level = 'warning';
  }

  return { bytes, level, backend: backend.kind };
}

/**
 * 清空本应用的数据（默认保留自动备份快照），返回被删掉的 key。
 *
 * 两个后端都要清：IndexedDB 里是当前数据，localStorage 里还留着迁移前的老副本 ——
 * 只清一边的话，换个环境（或 IndexedDB 变得不可用）数据就会「死而复生」，
 * 而用户刚刚才点了「清除所有数据」。
 *
 * 快照默认保留：它是「清除之后还能回滚」的唯一依靠。
 * 删除失败会把异常抛出去 —— 「以为清了其实没清」比报错更危险，交给调用方提示用户。
 */
export async function clearAppData({ keepBackups = true } = {}): Promise<string[]> {
  const removed: string[] = [];
  const shouldKeep = (key: string): boolean => keepBackups && key.startsWith(BACKUP_KEY_PREFIX);
  const backend = await resolveStoreBackend();

  if (backend.kind === 'indexeddb') {
    for (const [key] of await backend.store.entries(LM_PREFIX)) {
      if (shouldKeep(key)) continue;
      await backend.store.remove(key);
      removed.push(key);
    }
  }
  for (const [key] of await localStorageStore.entries(LM_PREFIX)) {
    if (shouldKeep(key)) continue;
    await localStorageStore.remove(key);
    removed.push(key);
  }
  return removed;
}

/*
 * 失败记录与容量告警原先都定义在本模块里，V2.1 拆到 storageFailure.ts（断开依赖环）。
 * 旧调用方仍从这里 import，所以原样转出去。
 */
export {
  clearStorageFailure,
  getStorageFailure,
  isQuotaExceededError,
  reportStorageFailure,
  subscribeStorageFailure,
};
export type { StorageFailure };

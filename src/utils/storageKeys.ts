/**
 * 应用内所有 localStorage key 的统一定义。
 *
 * 全部使用 `lm:` 前缀，好处：
 * 1. "清除数据" 可以精确地只删除本应用的 key，不会误伤同源下的其他项目；
 * 2. 统计存储占用时可以按前缀扫描。
 */
export const LM_PREFIX = 'lm:';

export const STORAGE_KEYS = {
  tasks: 'lm:tasks',
  books: 'lm:books',
  dev: 'lm:dev',
  writing: 'lm:writing',
  fitness: 'lm:fitness',
  diet: 'lm:diet',
  games: 'lm:games',
  theme: 'lm:theme',
  ui: 'lm:ui',
} as const;

export type StorageKeyName = keyof typeof STORAGE_KEYS;

/** 旧版本（v1）使用的无前缀 key，迁移后保留不删除，作为兜底 */
export const LEGACY_STORAGE_KEYS: Record<string, string> = {
  'tasks-storage': STORAGE_KEYS.tasks,
  'books-storage': STORAGE_KEYS.books,
  'dev-storage': STORAGE_KEYS.dev,
  'writing-storage': STORAGE_KEYS.writing,
  'fitness-storage': STORAGE_KEYS.fitness,
  'diet-storage': STORAGE_KEYS.diet,
  'games-storage': STORAGE_KEYS.games,
  'theme-storage': STORAGE_KEYS.theme,
};

export function appStorageKeys(): string[] {
  return Object.values(STORAGE_KEYS);
}

/** 自动备份快照的 key 前缀，例如 lm:backup:auto:1759000000000 */
export const BACKUP_KEY_PREFIX = 'lm:backup:auto:';
export const MAX_AUTO_BACKUPS = 10;

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * 把旧 key 的数据搬到新 key。
 * 只在「新 key 不存在」且「旧 key 存在」时搬迁，并且保留旧 key 不删除，
 * 这样即使搬迁逻辑有问题，用户原始数据也还在。
 */
export function migrateLegacyStorageKeys(): string[] {
  const storage = safeLocalStorage();
  if (!storage) return [];

  const migrated: string[] = [];
  for (const [legacyKey, newKey] of Object.entries(LEGACY_STORAGE_KEYS)) {
    const legacyValue = storage.getItem(legacyKey);
    if (legacyValue === null) continue;
    if (storage.getItem(newKey) !== null) continue;
    storage.setItem(newKey, legacyValue);
    migrated.push(newKey);
  }
  return migrated;
}

/** 估算本应用占用的 localStorage 字节数（UTF-16，每字符 2 字节） */
export function estimateStorageBytes(): number {
  const storage = safeLocalStorage();
  if (!storage) return 0;
  let bytes = 0;
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key === null || !isAppStorageKey(key)) continue;
    bytes += (key.length + (storage.getItem(key)?.length ?? 0)) * 2;
  }
  return bytes;
}

export function isAppStorageKey(key: string): boolean {
  return key.startsWith(LM_PREFIX);
}

/** 只清空本应用的数据，绝不使用 localStorage.clear() */
export function clearAppStorage(): string[] {
  const storage = safeLocalStorage();
  if (!storage) return [];
  const removed: string[] = [];
  for (let i = storage.length - 1; i >= 0; i -= 1) {
    const key = storage.key(i);
    if (key === null || !isAppStorageKey(key)) continue;
    storage.removeItem(key);
    removed.push(key);
  }
  return removed;
}

/*
 * 模块求值时立刻执行一次旧 key 迁移。
 *
 * 为什么放在这里而不是 main.tsx：ESM 会按依赖顺序求值，
 * 而所有 store 都 import 了本模块，因此这段代码必然在
 * zustand persist 反序列化之前跑完 —— 放在 main.tsx 里反而太晚
 * （App -> pages -> store 的依赖图会先被求值，旧数据要等下次刷新才生效）。
 *
 * 迁移是幂等的，重复执行安全。
 */
migrateLegacyStorageKeys();

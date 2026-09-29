import { createJSONStorage, type PersistStorage, type StateStorage } from 'zustand/middleware';

/**
 * 持久化的写入后端。
 *
 * 这一层存在的理由有两个：
 * 1. **写入失败要能被用户看见**。localStorage 写满（约 5MB）或在隐私模式下被拒绝时，
 *    原生 setItem 会抛异常；异常会从 store 的 action 里冒出去，轻则这次改动没保存、
 *    重则整棵组件树崩掉，而用户完全不知道发生了什么。这里统一吞掉异常并记录，
 *    应用继续以内存态运行，同时由 StorageAlert 提示「立刻导出备份」。
 * 2. **换存储后端只改一个文件**。将来把数据搬到 IndexedDB 时，只需要替换本模块导出的
 *    persistStorage，各 store 不用动。
 */

export interface StorageFailure {
  key: string;
  at: string;
  /** 是否为「空间不足」，决定提示文案是「该清理了」还是「浏览器拒绝写入」 */
  quotaExceeded: boolean;
  message: string;
}

type StorageFailureListener = (failure: StorageFailure | null) => void;

const listeners = new Set<StorageFailureListener>();
let currentFailure: StorageFailure | null = null;

/**
 * 各浏览器对配额错误的表达不一致：标准是 QuotaExceededError，
 * 老 Firefox 用 NS_ERROR_DOM_QUOTA_REACHED，Safari 有时只给 code 22。
 */
export function isQuotaExceededError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { name?: string; code?: number };
  if (candidate.name === 'QuotaExceededError') return true;
  if (candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  return candidate.code === 22 || candidate.code === 1014;
}

export function getStorageFailure(): StorageFailure | null {
  return currentFailure;
}

export function subscribeStorageFailure(listener: StorageFailureListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener(currentFailure);
}

export function reportStorageFailure(key: string, error: unknown): void {
  currentFailure = {
    key,
    at: new Date().toISOString(),
    quotaExceeded: isQuotaExceededError(error),
    message: error instanceof Error ? error.message : String(error),
  };
  emit();
}

/** 同一个 key 恢复正常写入后清掉告警，避免旧告警一直挂在界面上 */
export function clearStorageFailure(key?: string): void {
  if (currentFailure === null) return;
  if (key !== undefined && currentFailure.key !== key) return;
  currentFailure = null;
  emit();
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const safeStateStorage: StateStorage = {
  getItem: (name) => {
    const storage = safeLocalStorage();
    if (!storage) return null;
    try {
      return storage.getItem(name);
    } catch {
      // 读不出来时按「没有存过」处理：宁可走默认值，也不要让应用起不来
      return null;
    }
  },
  setItem: (name, value) => {
    const storage = safeLocalStorage();
    if (!storage) {
      reportStorageFailure(name, new Error('当前环境不允许写入本地存储'));
      return;
    }
    try {
      storage.setItem(name, value);
      clearStorageFailure(name);
    } catch (error) {
      reportStorageFailure(name, error);
    }
  },
  removeItem: (name) => {
    const storage = safeLocalStorage();
    if (!storage) return;
    try {
      storage.removeItem(name);
    } catch {
      // 删除失败不影响后续流程（快照回滚等场景会再写一次）
    }
  },
};

export const persistStorage = createJSONStorage(() => safeStateStorage) as PersistStorage<unknown>;

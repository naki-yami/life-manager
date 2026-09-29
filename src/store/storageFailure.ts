/**
 * 本地存储的失败记录。
 *
 * 单独拆一个模块是为了断开依赖环：底层存储（kv.ts）只负责抛错，
 * 「谁把错误记下来、怎么提示用户」由上层决定，而 kv / storage / backup 三处都要用到这套类型。
 */

export interface StorageFailure {
  key: string;
  at: string;
  /** 读失败（数据本身坏了）还是写失败（存不进去），提示文案完全不同 */
  kind: 'read' | 'write';
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

export function reportStorageFailure(
  key: string,
  error: unknown,
  kind: StorageFailure['kind'] = 'write',
): void {
  currentFailure = {
    key,
    at: new Date().toISOString(),
    kind,
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

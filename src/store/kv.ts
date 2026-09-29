import { STORAGE_KEYS } from '../utils/storageKeys';

/**
 * 异步键值存储层：IndexedDB 为主，localStorage 兜底。
 *
 * 为什么手写、不引 idb-keyval / Dexie：这一层总共一百多行，而我们要的语义
 * （拿不到 IndexedDB 就整条链路退回 localStorage、首启把老数据搬过去）本身就得自己写，
 * 引进来反而多一层要读的代码。依赖准则和自绘图表、自写 PNG 编码器是同一套。
 *
 * 分工：
 *   - 这里只做「存取」，写失败就把异常抛出去，由 storage.ts 决定怎么记、怎么提示；
 *   - 「哪个 key 放哪个后端」的规则也在这里（见 backendFor）。
 *
 * 刷新时机：`resolveStoreBackend()` 每个会话只判定一次。中途 IndexedDB 变得不可用
 * 属于极端情况，那时表现为写入报错 + 界面提示导出备份，而不是悄悄换后端写到另一个地方。
 */

export interface AsyncKeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** 一次读出所有以 prefix 开头的键值对 */
  entries(prefix: string): Promise<Array<[string, string]>>;
}

export type StoreKind = 'indexeddb' | 'localstorage';

export interface StoreBackend {
  store: AsyncKeyValueStore;
  kind: StoreKind;
}

export function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // 隐私模式下访问 localStorage 本身就可能抛异常
    return null;
  }
}

const localStorageStore: AsyncKeyValueStore = {
  async get(key) {
    return safeLocalStorage()?.getItem(key) ?? null;
  },
  async set(key, value) {
    const storage = safeLocalStorage();
    if (!storage) throw new Error('当前环境不允许写入本地存储');
    storage.setItem(key, value);
  },
  async remove(key) {
    safeLocalStorage()?.removeItem(key);
  },
  async entries(prefix) {
    const storage = safeLocalStorage();
    if (!storage) return [];
    const result: Array<[string, string]> = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key === null || !key.startsWith(prefix)) continue;
      const value = storage.getItem(key);
      if (value !== null) result.push([key, value]);
    }
    return result;
  },
};

const localStorageBackend: StoreBackend = { store: localStorageStore, kind: 'localstorage' };

const DB_NAME = 'life-manager';
/** 建库版本；改动 object store 结构时才需要 +1 */
const DB_VERSION = 1;
const OBJECT_STORE = 'kv';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OBJECT_STORE)) db.createObjectStore(OBJECT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('打不开 IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB 被其它标签页占用'));
  });
}

/** 等一个 readwrite 事务真正落盘再 resolve，这样「写完了」是可信的 */
function runTransaction(db: IDBDatabase, run: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(OBJECT_STORE, 'readwrite');
    run(transaction.objectStore(OBJECT_STORE));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 写入失败'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 写入被中断'));
  });
}

function request<T>(source: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () => reject(source.error ?? new Error('IndexedDB 读取失败'));
  });
}

/**
 * 打开 IndexedDB 后端；拿不到就返回 null，调用方整条退回 localStorage。
 * 只在模块级调用一次，结果由 resolveStoreBackend() 缓存。
 */
export async function createIndexedDbStore(): Promise<AsyncKeyValueStore | null> {
  if (typeof indexedDB === 'undefined') return null;

  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch {
    // 打不开（隐私模式、被其它标签页占着、磁盘配额）就当作没有 IndexedDB，
    // 行为与 V2.0 完全一致，而不是让应用起不来
    return null;
  }

  return {
    async get(key) {
      const store = db.transaction(OBJECT_STORE, 'readonly').objectStore(OBJECT_STORE);
      const value = await request<unknown>(store.get(key));
      return typeof value === 'string' ? value : null;
    },
    async set(key, value) {
      await runTransaction(db, (store) => store.put(value, key));
    },
    async remove(key) {
      await runTransaction(db, (store) => store.delete(key));
    },
    async entries(prefix) {
      const store = db.transaction(OBJECT_STORE, 'readonly').objectStore(OBJECT_STORE);
      // 两个请求在同一个事务、同一个任务里发出，所以下标天然一一对应
      const [keys, values] = await Promise.all([
        request<IDBValidKey[]>(store.getAllKeys()),
        request<unknown[]>(store.getAll()),
      ]);
      const result: Array<[string, string]> = [];
      keys.forEach((key, index) => {
        const value = values[index];
        if (typeof key === 'string' && key.startsWith(prefix) && typeof value === 'string') {
          result.push([key, value]);
        }
      });
      return result;
    },
  };
}

/**
 * 只留在 localStorage 的设置项：主题与密度。
 *
 * 首屏的防闪烁脚本是 <head> 里的同步内联代码，读不到 IndexedDB；
 * 而且它们只有几十字节，没有理由为了「统一」把首屏体验搭进去。
 */
const SYNC_KEYS: readonly string[] = [STORAGE_KEYS.theme, STORAGE_KEYS.ui];

export function isSyncStorageKey(key: string): boolean {
  return SYNC_KEYS.includes(key);
}

let injectedBackend: StoreBackend | null = null;
let resolvedBackend: Promise<StoreBackend> | null = null;

/** 测试用：注入一个假后端（传 null 恢复自动选择） */
export function setStoreBackend(backend: StoreBackend | null): void {
  injectedBackend = backend;
  resolvedBackend = null;
}

export async function resolveStoreBackend(): Promise<StoreBackend> {
  if (injectedBackend !== null) return injectedBackend;
  if (resolvedBackend === null) {
    resolvedBackend = createIndexedDbStore().then((store): StoreBackend =>
      store === null ? localStorageBackend : { store, kind: 'indexeddb' },
    );
  }
  return resolvedBackend;
}

/** 某个 key 该用哪个后端：设置项走 localStorage，数据走主后端 */
export async function backendFor(key: string): Promise<StoreBackend> {
  if (isSyncStorageKey(key)) return localStorageBackend;
  return resolveStoreBackend();
}

export { localStorageBackend, localStorageStore };

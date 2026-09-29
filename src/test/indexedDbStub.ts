import { vi } from 'vitest';

/*
 * 极简 IndexedDB 替身。
 *
 * jsdom 里没有实现 indexedDB，而「IndexedDB 可用」恰恰是存储层最要紧的那条分支，
 * 不能只测兜底路径。这个替身只实现 kv.ts / folderSync.ts 真正用到的那几个方法，
 * 回调一律按微任务异步派发，与真 IDB「异步 + 事务完成后回调」的时序一致。
 */

interface StubRequest {
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded: (() => void) | null;
  result: unknown;
  error: Error | null;
}

export interface IndexedDbStub {
  /** object store 名 -> （key -> value）；断言时直接看这里 */
  stores: Map<string, Map<string, unknown>>;
  /** 取某个 object store 的内容（没有就建一个空的） */
  store(name: string): Map<string, unknown>;
}

function newRequest(): StubRequest {
  return { onsuccess: null, onerror: null, onupgradeneeded: null, result: undefined, error: null };
}

/** 装到 globalThis.indexedDB 上；用完记得 vi.unstubAllGlobals() */
export function installIndexedDbStub(): IndexedDbStub {
  const stores = new Map<string, Map<string, unknown>>();
  const storeFor = (name: string): Map<string, unknown> => {
    let map = stores.get(name);
    if (map === undefined) {
      map = new Map<string, unknown>();
      stores.set(name, map);
    }
    return map;
  };

  const succeed = (request: StubRequest, value: unknown): StubRequest => {
    queueMicrotask(() => {
      request.result = value;
      request.onsuccess?.();
    });
    return request;
  };

  const buildDatabase = () => ({
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: (name: string) => storeFor(name),
    transaction: (name: string) => {
      const data = storeFor(name);
      const transaction = {
        error: null as Error | null,
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        objectStore: () => ({
          put: (value: unknown, key: string) => {
            data.set(key, value);
            return succeed(newRequest(), undefined);
          },
          get: (key: string) => succeed(newRequest(), data.get(key)),
          delete: (key: string) => {
            data.delete(key);
            return succeed(newRequest(), undefined);
          },
          getAll: () => succeed(newRequest(), [...data.values()]),
          getAllKeys: () => succeed(newRequest(), [...data.keys()]),
        }),
      };
      // 事务完成排在本次操作的微任务之后，读请求总是先拿到值
      queueMicrotask(() => transaction.oncomplete?.());
      return transaction;
    },
  });

  vi.stubGlobal('indexedDB', {
    open: () => {
      const request = newRequest();
      queueMicrotask(() => {
        // 真 IDB 在 upgradeneeded 里就能拿到 request.result
        request.result = buildDatabase();
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  });

  return { stores, store: storeFor };
}

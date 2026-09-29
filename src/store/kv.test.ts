import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backendFor,
  createIndexedDbStore,
  isSyncStorageKey,
  resolveStoreBackend,
  setStoreBackend,
  type AsyncKeyValueStore,
} from './kv';
import {
  persistStorage,
  readAppStateEntries,
  readAppValue,
  removeAppValue,
  writeAppValue,
} from './storage';
import { STORAGE_KEYS } from '../utils/storageKeys';

afterEach(() => {
  // 注入是全局的，用完必须还原，否则会串到下一个用例
  setStoreBackend(null);
  vi.unstubAllGlobals();
});

/** 内存假后端：这一层要验的是「路由与迁移」，不是 IndexedDB 本身 */
function memoryStore(seed: Record<string, string> = {}): {
  store: AsyncKeyValueStore;
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(seed));
  return {
    data,
    store: {
      get: async (key) => data.get(key) ?? null,
      set: async (key, value) => {
        data.set(key, value);
      },
      remove: async (key) => {
        data.delete(key);
      },
      entries: async (prefix) => [...data].filter(([key]) => key.startsWith(prefix)),
    },
  };
}

/** 极简 IndexedDB 替身：只实现 kv.ts 用到的那几个方法，回调一律按微任务异步派发 */
function stubIndexedDb(): Map<string, string> {
  const data = new Map<string, string>();

  class Request<T> {
    onsuccess: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onupgradeneeded: (() => void) | null = null;
    result: T | undefined;
    error: Error | null = null;
  }

  const succeed = <T>(request: Request<T>, value: T): Request<T> => {
    queueMicrotask(() => {
      request.result = value;
      request.onsuccess?.();
    });
    return request;
  };

  const open = (): Request<unknown> => {
    const request = new Request<unknown>();
    const db = {
      objectStoreNames: { contains: (name: string) => name === 'kv' },
      createObjectStore: () => undefined,
      transaction: () => {
        const transaction = {
          error: null as Error | null,
          oncomplete: null as (() => void) | null,
          onerror: null as (() => void) | null,
          onabort: null as (() => void) | null,
          objectStore: () => ({
            put: (value: string, key: string) => {
              data.set(key, value);
              return succeed(new Request<void>(), undefined);
            },
            get: (key: string) => succeed(new Request<string | undefined>(), data.get(key)),
            delete: (key: string) => {
              data.delete(key);
              return succeed(new Request<void>(), undefined);
            },
            getAll: () => succeed(new Request<string[]>(), [...data.values()]),
            getAllKeys: () => succeed(new Request<string[]>(), [...data.keys()]),
          }),
        };
        // 事务完成排在本次操作的微任务之后，读请求总是先拿到值
        queueMicrotask(() => transaction.oncomplete?.());
        return transaction;
      },
    };

    queueMicrotask(() => {
      // 真 IDB 在 upgradeneeded 里就能拿到 request.result
      request.result = db;
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  };

  vi.stubGlobal('indexedDB', { open });
  return data;
}

describe('key 到后端的路由', () => {
  it('主题与界面偏好留在 localStorage，数据走主后端', async () => {
    const fake = memoryStore();
    setStoreBackend({ store: fake.store, kind: 'indexeddb' });

    // 首屏的防闪烁脚本是同步内联代码，读不到 IndexedDB，只能留在 localStorage
    expect(isSyncStorageKey(STORAGE_KEYS.theme)).toBe(true);
    expect(isSyncStorageKey(STORAGE_KEYS.ui)).toBe(true);
    expect(isSyncStorageKey(STORAGE_KEYS.tasks)).toBe(false);

    expect((await backendFor(STORAGE_KEYS.theme)).kind).toBe('localstorage');
    expect((await backendFor(STORAGE_KEYS.ui)).kind).toBe('localstorage');
    expect((await backendFor(STORAGE_KEYS.tasks)).kind).toBe('indexeddb');
  });

  it('拿不到 IndexedDB 时整条链路退回 localStorage', async () => {
    // jsdom 里没有 indexedDB，正好就是「隐私模式 / 不支持」的样子
    expect(await createIndexedDbStore()).toBeNull();
    expect((await resolveStoreBackend()).kind).toBe('localstorage');
  });
});

describe('首启迁移', () => {
  it('主后端没有这条记录时，把 localStorage 里的老数据搬过去，且原样保留', async () => {
    const fake = memoryStore();
    setStoreBackend({ store: fake.store, kind: 'indexeddb' });
    localStorage.setItem(STORAGE_KEYS.tasks, '老数据');

    expect(await readAppValue(STORAGE_KEYS.tasks)).toBe('老数据');

    expect(fake.data.get(STORAGE_KEYS.tasks)).toBe('老数据');
    // 只写不删：localStorage 里那份是迁移出问题时的回溯副本
    expect(localStorage.getItem(STORAGE_KEYS.tasks)).toBe('老数据');
  });

  it('主后端已有这条记录时以它为准，不被老数据盖掉', async () => {
    const fake = memoryStore({ [STORAGE_KEYS.tasks]: '新数据' });
    setStoreBackend({ store: fake.store, kind: 'indexeddb' });
    localStorage.setItem(STORAGE_KEYS.tasks, '老数据');

    expect(await readAppValue(STORAGE_KEYS.tasks)).toBe('新数据');
  });

  it('两边都没有时返回空，不写任何东西', async () => {
    const fake = memoryStore();
    setStoreBackend({ store: fake.store, kind: 'indexeddb' });

    expect(await readAppValue(STORAGE_KEYS.tasks)).toBeNull();
    expect(fake.data.size).toBe(0);
  });

  it('搬迁失败也只是这次读不到，不会把异常抛给调用方', async () => {
    const fake = memoryStore();
    setStoreBackend({
      store: {
        ...fake.store,
        set: async () => {
          throw new Error('配额用尽');
        },
      },
      kind: 'indexeddb',
    });
    localStorage.setItem(STORAGE_KEYS.tasks, '老数据');

    expect(await readAppValue(STORAGE_KEYS.tasks)).toBe('老数据');
  });

  it('主后端本身就是 localStorage 时直接读它，不再去找「第二份」', async () => {
    // 没有注入时 jsdom 会解析到 localStorage 后端
    expect((await resolveStoreBackend()).kind).toBe('localstorage');
    localStorage.setItem(STORAGE_KEYS.tasks, '本地数据');

    expect(await readAppValue(STORAGE_KEYS.tasks)).toBe('本地数据');
    expect(localStorage.getItem(STORAGE_KEYS.tasks)).toBe('本地数据');
  });
});

describe('两个后端的合并读取', () => {
  it('主后端优先，localStorage 补齐它没有的 key', async () => {
    const fake = memoryStore({ [STORAGE_KEYS.tasks]: '主后端' });
    setStoreBackend({ store: fake.store, kind: 'indexeddb' });
    localStorage.setItem(STORAGE_KEYS.tasks, 'localStorage 老副本');
    localStorage.setItem(STORAGE_KEYS.books, '只留在 localStorage');

    const entries = new Map(await readAppStateEntries());

    expect(entries.get(STORAGE_KEYS.tasks)).toBe('主后端');
    expect(entries.get(STORAGE_KEYS.books)).toBe('只留在 localStorage');
  });
});

describe('读写往返', () => {
  it('写进去能读出来，删掉之后读到空', async () => {
    const fake = memoryStore();
    setStoreBackend({ store: fake.store, kind: 'indexeddb' });

    await writeAppValue(STORAGE_KEYS.tasks, 'v');
    expect(await readAppValue(STORAGE_KEYS.tasks)).toBe('v');

    await removeAppValue(STORAGE_KEYS.tasks);
    expect(await readAppValue(STORAGE_KEYS.tasks)).toBeNull();
  });
});

describe('写入前先等首次读取落地', () => {
  it('读取还没回来时来的写入会排队，不会用默认值盖掉老数据', async () => {
    const steps: string[] = [];
    let release: (value: string | null) => void = () => undefined;
    const slow: AsyncKeyValueStore = {
      get: () => {
        steps.push('get');
        return new Promise<string | null>((resolve) => {
          release = resolve;
        });
      },
      set: async (_key, value) => {
        steps.push(`set:${value}`);
      },
      remove: async () => undefined,
      entries: async () => [],
    };
    setStoreBackend({ store: slow, kind: 'indexeddb' });

    const read = persistStorage.getItem('lm:tasks');
    persistStorage.setItem('lm:tasks', { state: { tasks: [] }, version: 11 });

    // 读取还挂着的时候，写入必须一步都不能走（这里已经跨过了一个宏任务）
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(steps).toEqual(['get']);

    release('{"state":{"tasks":["老"]},"version":11}');
    expect(await read).toEqual({ state: { tasks: ['老'] }, version: 11 });

    await vi.waitFor(() => {
      expect(steps).toEqual(['get', 'set:{"state":{"tasks":[]},"version":11}']);
    });
  });
});

describe('IndexedDB 后端', () => {
  it('读写删与按前缀遍历都按异步语义工作', async () => {
    const data = stubIndexedDb();
    const store = await createIndexedDbStore();
    expect(store).not.toBeNull();

    await store!.set('lm:tasks', 'A');
    await store!.set('lm:books', 'B');

    expect(await store!.get('lm:tasks')).toBe('A');
    expect(await store!.entries('lm:')).toEqual([
      ['lm:tasks', 'A'],
      ['lm:books', 'B'],
    ]);
    expect(await store!.entries('lm:b')).toEqual([['lm:books', 'B']]);

    await store!.remove('lm:tasks');
    expect(await store!.get('lm:tasks')).toBeNull();
    expect(data.has('lm:tasks')).toBe(false);
  });

  it('打不开时返回 null，让调用方整条退回 localStorage', async () => {
    const failing: {
      onsuccess: (() => void) | null;
      onerror: (() => void) | null;
      error: Error | null;
    } = { onsuccess: null, onerror: null, error: null };
    vi.stubGlobal('indexedDB', {
      open: () => {
        queueMicrotask(() => failing.onerror?.());
        return failing;
      },
    });

    expect(await createIndexedDbStore()).toBeNull();
  });
});

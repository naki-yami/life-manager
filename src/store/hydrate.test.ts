import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hydrateAllStores', () => {
  it('所有 store 都读完时立刻 resolve', async () => {
    const { hydrateAllStores } = await import('./hydrate');

    await expect(hydrateAllStores()).resolves.toBeUndefined();
  });

  it('还有 store 挂在读取上时不 resolve', async () => {
    // 换一套全新的模块图，好在 store 反序列化之前把慢后端塞进去
    vi.resetModules();
    const kv = await import('./kv');
    // 每个 store 都会来读一次，所以收集全部 resolver，等会儿一起放行
    const releases: Array<(value: string | null) => void> = [];
    kv.setStoreBackend({
      kind: 'indexeddb',
      store: {
        get: () =>
          new Promise<string | null>((resolve) => {
            releases.push(resolve);
          }),
        set: async () => undefined,
        remove: async () => undefined,
        entries: async () => [],
      },
    });

    const { hydrateAllStores } = await import('./hydrate');
    const { useTaskStore } = await import('./taskStore');

    let hydrated = false;
    const boot = hydrateAllStores().then(() => {
      hydrated = true;
    });

    // 读取还挂着，首屏就不能往下走
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hydrated).toBe(false);

    releases.forEach((release) => release(null));
    await boot;

    expect(useTaskStore.persist.hasHydrated()).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * 开机路径。这条最要紧的是 ADR-0002 的产品承诺：
 * **关闭开关时整轮操作零网络请求**（这里是开机那一轮）。
 *
 * 断言分两层，缺一不可：
 * 1. `fetch` 没被调用（网络层）；
 * 2. **引擎的 `runSync` 根本没被调用**（`./engine` 的 import 没发生）。
 *
 * 只断言第 1 层是不够的：`runSync` 自己也会先看开关再返回，所以哪怕开机路径漏掉了
 * 开关检查，`fetch` 依然不会被调用 —— 断言会「因为错误的原因」而通过。
 * 实测过：去掉 `bootSync` 里的开关检查，只断言 fetch 的版本全绿。
 *
 * 第 2 层必须断言**`runSync` 被调用与否**，而不是「mock 工厂跑没跑」：
 * 工厂在第一次 import 时就执行一次，之后就缓存了，用它做判据同样是恒真断言
 * （这一版我写错过一次，变异测试抓出来了）。
 */
const runSyncMock = vi.fn(async () => ({
  ok: true,
  reason: '',
  pushed: 0,
  pulled: 0,
  conflicts: 0,
  lastSeq: 0,
}));

vi.mock('./engine', () => ({ runSync: runSyncMock }));

const { useSyncStore } = await import('../../store/syncStore');
const { syncOnBoot } = await import('./bootSync');

const emptySync = {
  enabled: false,
  baseUrl: '',
  token: '',
  deviceId: '',
  lastSeq: 0,
  baseline: {},
  revs: {},
  conflicts: [],
  needsReconcile: false,
};

beforeEach(() => {
  localStorage.clear();
  useSyncStore.setState({ ...emptySync });
  runSyncMock.mockClear();
  vi.unstubAllGlobals();
});

describe('开机同步', () => {
  it('开关关着时零网络请求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await syncOnBoot();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('开关关着时连同步引擎都不加载（chunk 不下载）', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    /*
     * **地址与令牌都填好，只有开关是关的。**
     *
     * 这是关键：若这里留空地址，那个「没填地址就 return」的分支会先命中，
     * 于是即使开关检查被删掉，用例照样绿（实测确认过）。
     * 填好地址之后，唯一能拦住它的就只剩开关检查 —— 这条断言才真的在承重。
     */
    useSyncStore.setState({
      enabled: false,
      baseUrl: 'http://127.0.0.1:8787',
      token: 's3cret-token',
      deviceId: 'dev-1',
    });

    await syncOnBoot();

    // 这一条才锁得住「关闭 = 纯本地」：引擎压根没被加载/调用
    expect(runSyncMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('开着但没填地址或令牌时也不发请求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    useSyncStore.setState({ enabled: true, baseUrl: '', token: '' });

    await syncOnBoot();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('开着且配置齐全时会去跑一轮同步（引擎被调用）', async () => {
    useSyncStore.setState({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8787',
      token: 's3cret-token',
      deviceId: 'dev-1',
    });

    await syncOnBoot();

    expect(runSyncMock).toHaveBeenCalledTimes(1);
  });

  /*
   * 「开了之后真的发请求、且先探活」这条**不在这里测** —— 这个文件把 `./engine`
   * mock 掉了，用它断言请求顺序等于测桩自己。
   * 真链路在 `engine.test.ts` / `engine-server.test.ts`（真 fetch 桩 + 真服务端）。
   */

  it('同步失败（离线）不抛错 —— 开机流程不受影响', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    useSyncStore.setState({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8787',
      token: 's3cret-token',
      deviceId: 'dev-1',
    });

    // 离线是正常状态，不该让开机抛异常
    await expect(syncOnBoot()).resolves.toBeUndefined();
  });
});

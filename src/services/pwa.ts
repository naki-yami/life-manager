/** Service Worker 只需要这一个方法，用结构化类型就够，不必依赖具体的浏览器实现 */
export interface ServiceWorkerLike {
  register(url: string): Promise<unknown>;
}

export interface OfflineShellHost {
  /** 只有生产构建才注册：开发时 SW 会把 Vite 的 HMR 请求也拦下来 */
  isProduction: boolean;
  serviceWorker?: ServiceWorkerLike | undefined;
  /** 注册路径，抽出来是为了测试能断言；正常不用传 */
  url?: string;
}

/**
 * 注册离线壳（PWA）。
 *
 * 失败一律吞掉：这个应用的数据本来就落在 localStorage 里，
 * 离线壳只是「断网也能打开」的加分项，装不上不该影响任何功能，也不该弹错误。
 */
export async function registerOfflineShell(host: OfflineShellHost): Promise<void> {
  if (!host.isProduction) return;
  if (!host.serviceWorker) return;

  try {
    await host.serviceWorker.register(host.url ?? '/sw.js');
  } catch {
    // 忽略：注册失败不影响使用
  }
}

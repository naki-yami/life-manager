import { useSyncStore } from '../../store/syncStore';

/**
 * 开机同步一次。
 *
 * 接在 `main.tsx` 的 `syncFolderBackup()` 旁边，同样**动态 import** —— 同步引擎会拉进
 * HTTP 与哈希代码，不该进首屏包（首屏预算 300 KB）。
 *
 * ## 关闭开关时零网络请求（这条最要紧）
 *
 * ADR-0002 把这个当产品承诺写死：「关掉开关即回到纯本地、零网络请求」。
 * 所以这里**先看开关再决定要不要加载引擎** —— 关着时连 `import()` 都不发生。
 * 虽然 `runSync` 自己也会先看开关并直接返回，但：
 * 1. 不加载 = 不下载那几十 KB 的 chunk，省流量也省电；
 * 2. 「零请求」因此能在**网络层**被断言（测试在 fetch 上打桩，一次调用都不该出现），
 *    而不是只依赖引擎内部那个分支。
 *
 * 出错不打扰用户：同步失败会在设置卡上显示，不该在开机时报一个弹窗。
 */
export async function syncOnBoot(): Promise<void> {
  // 开关关着 = 纯本地。连引擎都不加载，更不会发请求
  if (!useSyncStore.getState().enabled) return;

  // 地址或令牌没填也算「没开成」：没有可发的请求
  const { baseUrl, token } = useSyncStore.getState();
  if (baseUrl === '' || token === '') return;

  try {
    const { runSync } = await import('./engine');
    await runSync();
  } catch {
    // 开机同步失败是正常状态（离线、服务没跑）；设置卡上会显示失败原因
  }
}

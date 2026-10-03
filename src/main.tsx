import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ui';
import { registerOfflineShell } from './services/pwa';
import { hydrateAllStores } from './store/hydrate';
import './styles/index.css';

/**
 * 先把本地数据读回内存，再渲染第一次。
 *
 * 数据现在可能在 IndexedDB 里，读取是异步的；不等的话首屏会先画一帧「空数据」，
 * 几十毫秒后才被真数据替换（详见 store/hydrate.ts）。读取超时也会照常渲染，
 * 不会把用户挡在白屏上。
 */
async function boot(): Promise<void> {
  await hydrateAllStores();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );

  // 首屏已经画出来了，再去做备份到文件夹这件事：要读全量数据 + 写文件，不该挡渲染
  void syncFolderBackup();

  // 开机同步一次（跨设备同步）。**同样是动态 import** —— 引擎会拉进 HTTP 与哈希代码，
  // 不该进首屏包；开关关着时连加载都不会发生，所以这条路径上零网络请求。
  void import('./services/sync/bootSync').then(({ syncOnBoot }) => void syncOnBoot());
}

/*
 * 「备份到文件夹」（D3②）：用户授权过目标文件夹的话，每次打开静默更新一份。
 *
 * 必须在数据水合完成之后再读数据 —— 水合前 `readAllData()` 拿到的是空 store，
 * 这时候写出去就把上一个好备份覆盖成一个空文件了。
 * 动态 import：这条链路会拉进整棵备份 schema，不该进首屏包。
 */
async function syncFolderBackup(): Promise<void> {
  const { syncFolderBackupAfterBoot } = await import('./services/appData');
  await syncFolderBackupAfterBoot();
}

void boot();

/*
 * 注册离线壳：装成 PWA 之后断网也能打开。
 * 静态导入，不用动态 import —— 这只有一个几十字节的判断，
 * 而离线能力本身是首屏就要生效的。
 */
void registerOfflineShell({
  isProduction: import.meta.env.PROD,
  serviceWorker: typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
});

/*
 * 每天第一次打开时自动留一份快照（D3）。
 * 动态 import：备份模块不该进首屏包，和 Header 的手动保存同一策略。
 * 出错不打扰用户 —— 真的写不进去时，StorageAlert 会给出提示。
 */
void import('./services/backup').then(({ ensureDailySnapshot }) => {
  void ensureDailySnapshot();
});

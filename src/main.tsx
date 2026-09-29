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

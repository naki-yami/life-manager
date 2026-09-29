import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ui';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

/*
 * 每天第一次打开时自动留一份快照（D3）。
 * 动态 import：备份模块不该进首屏包，和 Header 的手动保存同一策略。
 * 出错不打扰用户 —— 真的写不进去时，StorageAlert 会给出提示。
 */
void import('./services/backup').then(({ ensureDailySnapshot }) => {
  ensureDailySnapshot();
});

import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout, PageSkeleton } from './components/layout';

/*
 * 按路由分包：首屏只需要外壳 + 首页，其余页面访问到时再下载。
 * 各页面用的是具名导出，所以这里做一次 default 映射。
 */
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const TasksPage = lazy(() => import('./pages/TasksPage').then((m) => ({ default: m.TasksPage })));
const BooksPage = lazy(() => import('./pages/BooksPage').then((m) => ({ default: m.BooksPage })));
const DevPage = lazy(() => import('./pages/DevPage').then((m) => ({ default: m.DevPage })));
const DevProjectPage = lazy(() =>
  import('./pages/DevProjectPage').then((m) => ({ default: m.DevProjectPage })),
);
const WritingPage = lazy(() =>
  import('./pages/WritingPage').then((m) => ({ default: m.WritingPage })),
);
const FitnessPage = lazy(() =>
  import('./pages/FitnessPage').then((m) => ({ default: m.FitnessPage })),
);
const DietPage = lazy(() => import('./pages/DietPage').then((m) => ({ default: m.DietPage })));
const GamesPage = lazy(() => import('./pages/GamesPage').then((m) => ({ default: m.GamesPage })));
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })));
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const UiPage = lazy(() => import('./pages/UiPage').then((m) => ({ default: m.UiPage })));
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Layout>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/dev" element={<DevPage />} />
            <Route path="/dev/:id" element={<DevProjectPage />} />
            <Route path="/writing" element={<WritingPage />} />
            <Route path="/fitness" element={<FitnessPage />} />
            <Route path="/diet" element={<DietPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/ui" element={<UiPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
};

export default App;

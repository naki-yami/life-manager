import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, PageSkeleton, ModuleHost } from './components/layout';

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
const HabitsPage = lazy(() =>
  import('./pages/HabitsPage').then((m) => ({ default: m.HabitsPage })),
);
const ReviewPage = lazy(() =>
  import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })),
);
const GoalsPage = lazy(() => import('./pages/GoalsPage').then((m) => ({ default: m.GoalsPage })));
const JournalPage = lazy(() =>
  import('./pages/JournalPage').then((m) => ({ default: m.JournalPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const UiPage = lazy(() => import('./pages/UiPage').then((m) => ({ default: m.UiPage })));
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

const App: React.FC = () => {
  return (
    <BrowserRouter
      // 提前开启 v7 行为，消掉控制台的 future flag 警告（真机验证记录里的待办）
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Layout>
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/tasks" element={<TasksPage />} />
            {/* 书房：读书 + 写作共用一个宿主壳，壳里出子页签条（见 MODULE_TABS） */}
            <Route path="/study" element={<ModuleHost host="/study" />}>
              <Route index element={<Navigate to="books" replace />} />
              <Route path="books" element={<BooksPage />} />
              <Route path="writing" element={<WritingPage />} />
            </Route>
            {/* 健康：健身 + 饮食同一个模式，只有 host 不同 */}
            <Route path="/health" element={<ModuleHost host="/health" />}>
              <Route index element={<Navigate to="fitness" replace />} />
              <Route path="fitness" element={<FitnessPage />} />
              <Route path="diet" element={<DietPage />} />
            </Route>
            {/* 统计与复盘 */}
            <Route path="/insight" element={<ModuleHost host="/insight" />}>
              <Route index element={<Navigate to="stats" replace />} />
              <Route path="stats" element={<StatsPage />} />
              <Route path="review" element={<ReviewPage />} />
            </Route>
            {/* 旧路径永久保留，书签 / 外部链接 / 历史记录都不碎（决策 #3） */}
            <Route path="/books" element={<Navigate to="/study/books" replace />} />
            <Route path="/dev" element={<DevPage />} />
            <Route path="/dev/:id" element={<DevProjectPage />} />
            <Route path="/writing" element={<Navigate to="/study/writing" replace />} />
            <Route path="/fitness" element={<Navigate to="/health/fitness" replace />} />
            <Route path="/diet" element={<Navigate to="/health/diet" replace />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/stats" element={<Navigate to="/insight/stats" replace />} />
            <Route path="/habits" element={<HabitsPage />} />
            <Route path="/review" element={<Navigate to="/insight/review" replace />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/journal" element={<JournalPage />} />
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

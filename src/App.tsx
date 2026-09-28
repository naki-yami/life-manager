import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout';
import { HomePage } from './pages/HomePage';
import { TasksPage } from './pages/TasksPage';
import { BooksPage } from './pages/BooksPage';
import { DevPage } from './pages/DevPage';
import { WritingPage } from './pages/WritingPage';
import { FitnessPage } from './pages/FitnessPage';
import { DietPage } from './pages/DietPage';
import { GamesPage } from './pages/GamesPage';
import { SettingsPage } from './pages/SettingsPage';
import { UiPage } from './pages/UiPage';

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/dev" element={<DevPage />} />
          <Route path="/writing" element={<WritingPage />} />
          <Route path="/fitness" element={<FitnessPage />} />
          <Route path="/diet" element={<DietPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/ui" element={<UiPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
};

export default App;

import React from 'react';
import { AlertTriangle, RefreshCw, Download } from 'lucide-react';
import { Button } from './ui';
import { downloadBackup } from '../services/backup';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useGameStore } from '../store/gameStore';
import { useThemeStore } from '../store/themeStore';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 顶层错误边界。
 * 单个组件崩溃时不再整页白屏，并且提供「导出数据抢救」入口，
 * 保证用户在任何异常下都能把数据取出来。
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[Life Manager] 渲染出错：', error, info.componentStack);
  }

  private handleRescue = (): void => {
    try {
      downloadBackup({
        tasks: useTaskStore.getState().tasks,
        memos: useTaskStore.getState().memos,
        books: useBookStore.getState().books,
        devProjects: useDevStore.getState().projects,
        writingProjects: useWritingStore.getState().projects,
        fitnessPlans: useFitnessStore.getState().plans,
        fitnessRecords: useFitnessStore.getState().records,
        dietRecords: useDietStore.getState().records,
        games: useGameStore.getState().games,
        settings: { theme: useThemeStore.getState().theme },
      });
    } catch (error) {
      console.error('[Life Manager] 数据导出失败：', error);
      window.alert('自动导出失败。请勿清除浏览器数据，先手动排查。');
    }
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-red-500 shrink-0" size={24} />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">页面出错了</h1>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            应用遇到了一个未预期的错误。你的数据仍然保存在浏览器本地，没有丢失。
          </p>
          <pre className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 overflow-auto max-h-40 whitespace-pre-wrap">
            {error.message}
          </pre>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="secondary" onClick={this.handleRescue}>
              <Download size={16} className="mr-2" /> 导出数据抢救
            </Button>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw size={16} className="mr-2" /> 重新加载
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

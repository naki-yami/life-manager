import React from 'react';
import { AlertTriangle, RefreshCw, Download } from 'lucide-react';
import { Button } from './ui';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useGameStore } from '../store/gameStore';
import { useThemeStore } from '../store/themeStore';
import { useUiStore } from '../store/uiStore';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * 单个模块读取失败时不要让整次抢救导出失败 —— 能救多少算多少。
 */
function safeRead<T>(read: () => T, fallback: T, label: string): T {
  try {
    return read();
  } catch (error) {
    console.error(`[Life Manager] 读取「${label}」失败，导出时先跳过：`, error);
    return fallback;
  }
}

/**
 * 顶层错误边界。
 *
 * 两个硬性要求：
 * 1. 单个组件崩溃时不能整页白屏；
 * 2. 任何异常下都要留一条「把数据导出走」的通道。
 *
 * 备份模块（含 zod 校验）用动态 import 载入，这样它不会进入首屏包，
 * 崩溃时再按需加载；加载失败也还有明确的提示，不会静默失败。
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[Life Manager] 渲染出错：', error, info.componentStack);
  }

  private handleRescue = async (): Promise<void> => {
    try {
      const { downloadBackup } = await import('../services/backup');
      downloadBackup({
        tasks: safeRead(() => useTaskStore.getState().tasks, [], '任务'),
        memos: safeRead(() => useTaskStore.getState().memos, [], '备忘录'),
        books: safeRead(() => useBookStore.getState().books, [], '读书'),
        devProjects: safeRead(() => useDevStore.getState().projects, [], '开发'),
        writingProjects: safeRead(() => useWritingStore.getState().projects, [], '写作'),
        fitnessPlans: safeRead(() => useFitnessStore.getState().plans, [], '健身计划'),
        fitnessRecords: safeRead(() => useFitnessStore.getState().records, [], '健身记录'),
        dietRecords: safeRead(() => useDietStore.getState().records, [], '饮食'),
        games: safeRead(() => useGameStore.getState().games, [], '游戏'),
        settings: {
          themeMode: safeRead(() => useThemeStore.getState().themeMode, 'system' as const, '主题'),
          density: safeRead(() => useUiStore.getState().density, 'comfortable' as const, '密度'),
          sidebarCollapsed: safeRead(
            () => useUiStore.getState().sidebarCollapsed,
            false,
            '侧栏状态',
          ),
        },
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
      <div className="flex min-h-screen items-center justify-center bg-canvas p-page text-content">
        <div className="w-full max-w-lg space-y-4 rounded-xl border border-line-subtle bg-surface p-6 shadow-lg">
          <div className="flex items-center gap-3">
            <AlertTriangle className="shrink-0 text-danger" size={24} aria-hidden />
            <h1 className="text-lg font-semibold text-content">页面出错了</h1>
          </div>
          <p className="text-sm text-content-secondary">
            应用遇到了一个未预期的错误。你的数据仍然保存在浏览器本地，没有丢失。
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-danger-soft p-3 text-xs text-danger">
            {error.message}
          </pre>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={this.handleRescue}>
              <Download size={16} className="mr-2" aria-hidden /> 导出数据抢救
            </Button>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw size={16} className="mr-2" aria-hidden /> 重新加载
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

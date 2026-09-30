import type { BackupData } from './schemas';
import { syncFolderBackupOnBoot } from './folderSync';
import { useBookStore } from '../store/bookStore';
import { useBodyStore } from '../store/bodyStore';
import { useDevStore } from '../store/devStore';
import { useDietStore } from '../store/dietStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useFocusStore } from '../store/focusStore';
import { useGameStore } from '../store/gameStore';
import { useGoalStore } from '../store/goalStore';
import { useHabitStore } from '../store/habitStore';
import { useJournalStore } from '../store/journalStore';
import { useLibraryStore } from '../store/libraryStore';
import { useReviewStore } from '../store/reviewStore';
import { useTaskStore } from '../store/taskStore';
import { useThemeStore } from '../store/themeStore';
import { useUiStore } from '../store/uiStore';
import { useWritingStore } from '../store/writingStore';

/**
 * 从各 store 读出当前全量数据（导出、导入预览、备份到文件夹都走这一份）。
 *
 * 用 `getState()` 取值而不是订阅：这些都是「按下按钮才发生」的一次性动作，
 * 订阅只会让调用方跟着每次改动重渲染；`getState()` 也天然避开了闭包过期。
 */
export function readAllData(): BackupData {
  const taskState = useTaskStore.getState();
  return {
    tasks: taskState.tasks,
    memos: taskState.memos,
    books: useBookStore.getState().books,
    devProjects: useDevStore.getState().projects,
    workSessions: useDevStore.getState().sessions,
    writingProjects: useWritingStore.getState().projects,
    fitnessPlans: useFitnessStore.getState().plans,
    fitnessRecords: useFitnessStore.getState().records,
    bodyMetrics: useBodyStore.getState().records,
    dietRecords: useDietStore.getState().records,
    mealTemplates: useDietStore.getState().templates,
    games: useGameStore.getState().games,
    gameSessions: useGameStore.getState().sessions,
    readingSessions: useBookStore.getState().sessions,
    habits: useHabitStore.getState().habits,
    focusSessions: useFocusStore.getState().sessions,
    reviews: useReviewStore.getState().reviews,
    journal: useJournalStore.getState().entries,
    goals: useGoalStore.getState().goals,
    customFoods: useLibraryStore.getState().customFoods,
    customExercises: useLibraryStore.getState().customExercises,
    settings: {
      themeMode: useThemeStore.getState().themeMode,
      density: useUiStore.getState().density,
      sidebarCollapsed: useUiStore.getState().sidebarCollapsed,
    },
  };
}

/**
 * 开机后把最新数据静默写一份到用户授权过的文件夹（D3②）。
 *
 * 必须在数据水合完成之后调用：水合前 `readAllData()` 拿到的是一份空数据，
 * 这时候写出去就把上一个好备份覆盖成空文件了。
 * 写失败已经在 folderSync 里吞掉 —— 「备份没更新」不该升级成「应用打不开」。
 */
export async function syncFolderBackupAfterBoot(now: Date = new Date()): Promise<void> {
  await syncFolderBackupOnBoot(readAllData(), now);
}

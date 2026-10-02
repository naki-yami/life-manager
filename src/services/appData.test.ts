import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readAllData, syncFolderBackupAfterBoot } from './appData';
import { FOLDER_BACKUP_FILE, chooseFolderBackupFolder, resetFolderBackupStore } from './folderSync';
import { installIndexedDbStub } from '../test/indexedDbStub';
import { fakeFolder, stubDirectoryPicker } from '../test/fakeFolder';
import { useTaskStore } from '../store/taskStore';
import { useDietStore } from '../store/dietStore';
import { useHabitStore } from '../store/habitStore';
import { useThemeStore } from '../store/themeStore';
import { useUiStore } from '../store/uiStore';
import { DEFAULT_DIET_GOALS } from '../utils/diet';

const NOW = new Date(2026, 8, 29, 9, 0, 0);

beforeEach(() => {
  useTaskStore.setState({ tasks: [], memos: [] });
  useDietStore.setState({
    records: [],
    templates: [],
    goals: { ...DEFAULT_DIET_GOALS },
    water: {},
  });
  useHabitStore.setState({ habits: [] });
  useThemeStore.setState({ themeMode: 'system' });
  useUiStore.setState({ density: 'comfortable', sidebarCollapsed: false });
});

afterEach(() => {
  resetFolderBackupStore();
  vi.unstubAllGlobals();
});

describe('readAllData', () => {
  it('把各模块的数据拼成备份结构，设置项一起带上', () => {
    useTaskStore.getState().addTask('写周报', '', 'medium', '2026-09-29');
    useHabitStore.getState().addHabit({ name: '晨跑' });
    useThemeStore.getState().setThemeMode('dark');
    useThemeStore.getState().setAppearance('paper');
    useThemeStore.getState().setAccent('teal');
    useUiStore.getState().setDensity('compact');
    useDietStore.getState().setGoals({ calories: 2300, protein: 110 });
    useDietStore.getState().setWater('2026-09-29', 7);

    const data = readAllData();

    expect(data.tasks.map((task) => task.title)).toEqual(['写周报']);
    expect(data.habits.map((habit) => habit.name)).toEqual(['晨跑']);
    expect(data.books).toEqual([]);
    // 饮食的目标与饮水也是用户数据，必须一起进备份（以前这两样会静默丢失）
    expect(data.dietGoals).toEqual({ calories: 2300, protein: 110 });
    expect(data.dietWater).toEqual({ '2026-09-29': 7 });
    expect(data.settings).toEqual({
      themeMode: 'dark',
      appearance: 'paper',
      accent: 'teal',
      density: 'compact',
      sidebarCollapsed: false,
    });
  });
});

describe('开机时的文件夹备份', () => {
  it('没授权过文件夹时安静返回，不抛错', async () => {
    installIndexedDbStub();
    await expect(syncFolderBackupAfterBoot(NOW)).resolves.toBeUndefined();
  });

  it('授权过文件夹时写一份「当前内存里的数据」', async () => {
    installIndexedDbStub();
    const folder = fakeFolder('生活备份');
    stubDirectoryPicker(folder.handle);
    await chooseFolderBackupFolder(readAllData(), NOW);

    // 先选文件夹、再录数据：写出去的必须是水合后的最新值，不是选择那一刻的旧值
    useTaskStore.getState().addTask('开机后写的任务', '', 'medium', '2026-09-29');
    await syncFolderBackupAfterBoot(new Date(2026, 8, 30, 8, 0, 0));

    expect(folder.files.get(FOLDER_BACKUP_FILE)).toContain('开机后写的任务');
  });

  it('目标文件夹写不进去时也不抛错，启动流程不受影响', async () => {
    installIndexedDbStub();
    const folder = fakeFolder();
    stubDirectoryPicker(folder.handle);
    await chooseFolderBackupFolder(readAllData(), NOW);

    folder.state.failWrite = true;
    await expect(syncFolderBackupAfterBoot(NOW)).resolves.toBeUndefined();
  });
});

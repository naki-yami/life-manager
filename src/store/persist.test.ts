import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from './taskStore';
import { useDevStore } from './devStore';
import { useDietStore } from './dietStore';
import { useUiStore } from './uiStore';
import { useThemeStore } from './themeStore';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { STORE_VERSION } from './persist';

/** 直接往 localStorage 写一份「某个版本」的数据，模拟用户老数据 */
function seed(key: string, state: unknown, version: number = STORE_VERSION): void {
  localStorage.setItem(key, JSON.stringify({ state, version }));
}

beforeEach(() => {
  localStorage.clear();
  useTaskStore.setState({ tasks: [], memos: [] });
  useDevStore.setState({ projects: [], sessions: [] });
  useDietStore.setState({ records: [], goals: { calories: 2000, protein: 80 }, water: {} });
  useUiStore.setState({ sidebarCollapsed: false, density: 'comfortable' });
  useThemeStore.setState({ themeMode: 'system' });
});

describe('归一化挂在 merge 上，每次 rehydrate 都执行', () => {
  it('版本号没变时也会补齐记录里新加的字段', async () => {
    seed(STORAGE_KEYS.tasks, {
      tasks: [
        {
          id: 'legacy-1',
          title: '旧任务',
          description: '',
          priority: 'high',
          status: 'pending',
          dueDate: '',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      memos: [],
    });

    await useTaskStore.persist.rehydrate();

    const task = useTaskStore.getState().tasks[0]!;
    expect(task.id).toBe('legacy-1');
    expect(task.subtasks).toEqual([]);
    expect(task.repeat).toBeNull();
  });

  it('开发项目内嵌的工作项也会补上分类', async () => {
    seed(STORAGE_KEYS.dev, {
      projects: [
        {
          id: 'p1',
          name: '旧项目',
          description: '',
          status: 'in-progress',
          tasks: [{ id: 'dt1', title: '旧工作项', status: 'todo', priority: 'medium' }],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      sessions: [],
    });

    await useDevStore.persist.rehydrate();

    const project = useDevStore.getState().projects[0]!;
    expect(project.hoursSpent).toBe(0);
    expect(project.milestones).toEqual([]);
    expect(project.logs).toEqual([]);
    expect(project.tasks[0]!.type).toBe('feature');
  });

  it('饮食记录缺营养素合计时补 0，设置在脏数据下回退默认值', async () => {
    seed(STORAGE_KEYS.diet, {
      records: [{ id: 'r1', date: '2026-09-29', type: 'lunch', items: [], totalCalories: 500 }],
      goals: { calories: 'oops', protein: 90 },
      water: { '2026-09-29': 6, '2026-09-28': 'x' },
    });

    await useDietStore.persist.rehydrate();

    const state = useDietStore.getState();
    expect(state.records[0]).toMatchObject({ totalProtein: 0, totalCarbs: 0, totalFat: 0 });
    expect(state.goals).toEqual({ calories: 2000, protein: 90 });
    expect(state.water).toEqual({ '2026-09-29': 6 });
  });

  it('界面偏好读到脏值时回退默认，不会把界面搞坏', async () => {
    seed(STORAGE_KEYS.ui, { sidebarCollapsed: 'yes', density: 'huge' });

    await useUiStore.persist.rehydrate();

    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    expect(useUiStore.getState().density).toBe('comfortable');
  });

  it('兼容只存了二态 theme 的旧数据', async () => {
    seed(STORAGE_KEYS.theme, { theme: 'dark' }, 2);

    await useThemeStore.persist.rehydrate();

    expect(useThemeStore.getState().themeMode).toBe('dark');
  });

  it('主题值非法时退回跟随系统，而不是让主题解析失败', async () => {
    seed(STORAGE_KEYS.theme, { themeMode: 'neon' });

    await useThemeStore.persist.rehydrate();

    expect(useThemeStore.getState().themeMode).toBe('system');
  });

  it('整份数据损坏时退回默认值，不抛异常也不白屏', async () => {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify({ state: 'oops', version: 0 }));

    await useTaskStore.persist.rehydrate();

    expect(useTaskStore.getState().tasks).toEqual([]);
    expect(useTaskStore.getState().memos).toEqual([]);
  });
});

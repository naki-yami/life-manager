import { beforeEach, describe, expect, it } from 'vitest';
import { appIsEmpty, clearDemoData, demoDataExists, seedDemoData } from './demoData';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useDietStore } from '../store/dietStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useGameStore } from '../store/gameStore';
import { useTaskStore } from '../store/taskStore';
import { useWritingStore } from '../store/writingStore';

beforeEach(() => {
  useTaskStore.setState({ tasks: [], memos: [] });
  useBookStore.setState({ books: [], sessions: [] });
  useDevStore.setState({ projects: [], sessions: [] });
  useWritingStore.setState({ projects: [] });
  useFitnessStore.setState({ plans: [], records: [] });
  useDietStore.setState({ records: [], goals: { calories: 2000, protein: 80 }, water: {} });
  useGameStore.setState({ games: [], sessions: [] });
});

describe('示例数据', () => {
  const modules = () => ({
    tasks: useTaskStore.getState().tasks,
    books: useBookStore.getState().books,
    devProjects: useDevStore.getState().projects,
    writingProjects: useWritingStore.getState().projects,
    workoutRecords: useFitnessStore.getState().records,
    dietRecords: useDietStore.getState().records,
    games: useGameStore.getState().games,
  });


  it('空应用时 appIsEmpty 为真，seed 后覆盖各模块且带 demo 前缀', () => {
    expect(appIsEmpty(modules())).toBe(true);
    expect(demoDataExists(modules())).toBe(false);

    seedDemoData();

    expect(appIsEmpty(modules())).toBe(false);
    expect(demoDataExists(modules())).toBe(true);
    expect(useTaskStore.getState().tasks.length).toBeGreaterThanOrEqual(3);
    expect(useBookStore.getState().books.length).toBeGreaterThanOrEqual(2);
    expect(useGameStore.getState().games.length).toBeGreaterThanOrEqual(1);
    expect(useGameStore.getState().sessions.length).toBeGreaterThanOrEqual(1);
    expect(useFitnessStore.getState().records.length).toBeGreaterThanOrEqual(1);
    expect(useDietStore.getState().records.length).toBeGreaterThanOrEqual(2);
    expect(useWritingStore.getState().projects.length).toBeGreaterThanOrEqual(1);
    expect(useDevStore.getState().projects.length).toBeGreaterThanOrEqual(1);
    // 全部带 demo 前缀
    for (const task of useTaskStore.getState().tasks) {
      expect(task.id.startsWith('demo-')).toBe(true);
    }
  });

  it('重复 seed 不翻倍：先剔掉旧 demo 记录再追加', () => {
    seedDemoData();
    const countAfterFirst = useTaskStore.getState().tasks.length;
    seedDemoData();
    expect(useTaskStore.getState().tasks.length).toBe(countAfterFirst);
  });

  it('clearDemoData 只删 demo 记录，真实数据与随后记录不受影响', () => {
    // 先记一条真实的
    useTaskStore.getState().addTask('真实任务', '', 'high', '');
    seedDemoData();
    expect(useTaskStore.getState().tasks.length).toBeGreaterThanOrEqual(4);

    clearDemoData();

    const tasks = useTaskStore.getState().tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.title).toBe('真实任务');
    expect(useTaskStore.getState().tasks.every((t) => !t.id.startsWith('demo-'))).toBe(true);
    // 游戏流水也跟着 demo 游戏一起被清掉
    expect(useGameStore.getState().games).toHaveLength(0);
    expect(useGameStore.getState().sessions).toHaveLength(0);
    expect(demoDataExists(modules())).toBe(false);
  });
});

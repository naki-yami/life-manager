import { useMemo } from 'react';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useDietStore } from '../store/dietStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useGameStore } from '../store/gameStore';
import { useTaskStore } from '../store/taskStore';
import { useWritingStore } from '../store/writingStore';
import { collectTagStats } from '../utils/tags';

/**
 * 「用过的标签」：跨模块收集，按使用次数排序。
 * 标签输入框用它做建议 —— 统一标签的价值就在于同一个词在不同模块里复用，
 * 所以建议必须跨模块，而不是只看当前页面。
 */
export function useTagSuggestions(limit = 12): string[] {
  const tasks = useTaskStore((state) => state.tasks);
  const books = useBookStore((state) => state.books);
  const devProjects = useDevStore((state) => state.projects);
  const writingProjects = useWritingStore((state) => state.projects);
  const games = useGameStore((state) => state.games);
  const workoutRecords = useFitnessStore((state) => state.records);
  const mealRecords = useDietStore((state) => state.records);

  return useMemo(() => {
    const items = [
      ...tasks.map((item) => ({ tags: item.tags, kind: '任务' })),
      ...books.map((item) => ({ tags: item.tags, kind: '书' })),
      ...devProjects.map((item) => ({ tags: item.tags, kind: '开发项目' })),
      ...writingProjects.map((item) => ({ tags: item.tags, kind: '写作' })),
      ...games.map((item) => ({ tags: item.tags, kind: '游戏' })),
      ...workoutRecords.map((item) => ({ tags: item.tags, kind: '训练记录' })),
      ...mealRecords.map((item) => ({ tags: item.tags, kind: '饮食记录' })),
    ];
    return collectTagStats(items)
      .slice(0, limit)
      .map((stat) => stat.tag);
  }, [tasks, books, devProjects, writingProjects, games, workoutRecords, mealRecords, limit]);
}

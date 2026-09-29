import { useMemo } from 'react';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useGameStore } from '../store/gameStore';
import { useTaskStore } from '../store/taskStore';
import { useWritingStore } from '../store/writingStore';
import { buildEntityIndex, type SearchableEntity } from '../utils/entityIndex';

/**
 * 命令面板「实体」组的数据源：订阅各模块 store，合成一张跨模块索引。
 * 只在面板打开时挂载，所以不会给常驻界面增加订阅开销。
 */
export function useEntityIndex(): SearchableEntity[] {
  const tasks = useTaskStore((state) => state.tasks);
  const memos = useTaskStore((state) => state.memos);
  const books = useBookStore((state) => state.books);
  const devProjects = useDevStore((state) => state.projects);
  const writingProjects = useWritingStore((state) => state.projects);
  const games = useGameStore((state) => state.games);

  return useMemo(
    () => buildEntityIndex({ tasks, memos, books, devProjects, writingProjects, games }),
    [tasks, memos, books, devProjects, writingProjects, games],
  );
}

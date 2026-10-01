import type {
  Book,
  DevProject,
  Game,
  MealRecord,
  Memo,
  Task,
  WorkoutRecord,
  WritingProject,
} from '../types';
import { normalizeTag } from './tags';

/** 「实体」结果能落到的模块 */
export type EntityKind = 'task' | 'memo' | 'book' | 'dev' | 'writing' | 'game' | 'workout' | 'meal';

export interface SearchableEntity {
  /** 全局唯一 id（`kind:entityId`），命令面板用它做 key */
  id: string;
  entityId: string;
  kind: EntityKind;
  /** 归属模块的中文名，作为分组提示展示 */
  kindLabel: string;
  title: string;
  /** 副标题：状态、日期这类一眼能分辨的信息 */
  subtitle: string;
  /** 参与模糊匹配的额外文本 */
  keywords: string[];
  /** 统一标签；命令面板输入 `#标签` 时按它过滤 */
  tags: string[];
  createdAt: string;
  /** 回车跳转的路由 */
  path: string;
  /** 目标页是否支持「打开这条记录」。false 时只跳到模块首页 */
  focusable: boolean;
}

export interface EntitySource {
  tasks: Task[];
  memos: Memo[];
  books: Book[];
  devProjects: DevProject[];
  writingProjects: WritingProject[];
  games: Game[];
  workoutRecords: WorkoutRecord[];
  mealRecords: MealRecord[];
}

const KIND_LABEL: Record<EntityKind, string> = {
  task: '任务',
  memo: '备忘',
  book: '书',
  dev: '开发项目',
  writing: '写作',
  game: '游戏',
  workout: '训练记录',
  meal: '饮食记录',
};

/** 实体条数上限：跨模块检索是给人用的，不需要把几千条全塞进面板 */
export const ENTITY_LIMIT = 400;

/**
 * 流水类模块（训练 / 饮食）每天可能好几条，一年就是上千条。
 * 全部塞进索引会把书、项目这类低频但重要的记录挤出上限，所以每类只留最近的这些条。
 */
export const STREAM_LIMIT = 100;

const TASK_STATUS: Record<Task['status'], string> = { pending: '待办', completed: '已完成' };
const BOOK_STATUS: Record<Book['status'], string> = {
  'want-to-read': '想读',
  reading: '在读',
  finished: '已读',
};
const DEV_STATUS: Record<DevProject['status'], string> = {
  planning: '规划中',
  'in-progress': '进行中',
  completed: '已完成',
  paused: '已暂停',
};
const WRITING_STATUS: Record<WritingProject['status'], string> = {
  draft: '草稿',
  'in-progress': '撰写中',
  completed: '已完成',
};
const GAME_STATUS: Record<Game['status'], string> = {
  playing: '在玩',
  completed: '已通关',
  backlog: '想玩',
};

const MEAL_TYPE: Record<MealRecord['type'], string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

const join = (...parts: Array<string | false | undefined>): string =>
  parts
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' · ');

/** 取最近 N 条流水（按日期倒序），不改动原数组 */
function recent<T extends { date: string }>(items: readonly T[], limit: number): T[] {
  return [...items].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

/** 训练标题：优先用训练名，没有就用动作名拼一个，都没有才退回默认文案 */
function workoutTitle(record: WorkoutRecord): string {
  const name = record.planName.trim();
  if (name !== '') return name;
  const exercises = record.exercises
    .map((exercise) => exercise.name.trim())
    .filter((exercise) => exercise !== '');
  return exercises.length > 0 ? exercises.slice(0, 3).join('、') : '训练记录';
}

/** 饮食标题：`午餐：鸡胸肉、米饭` */
function mealTitle(record: MealRecord): string {
  const items = record.items.map((item) => item.name.trim()).filter((item) => item !== '');
  const label = MEAL_TYPE[record.type];
  return items.length > 0 ? `${label}：${items.slice(0, 2).join('、')}` : label;
}

/**
 * 把各模块的记录摊成一张可搜索的索引。
 *
 * 纯函数，只依赖传入的快照，方便单测；订阅 store 的部分在
 * `src/hooks/useEntityIndex.ts` 里。
 */
export function buildEntityIndex(source: EntitySource): SearchableEntity[] {
  const entities: SearchableEntity[] = [
    ...source.tasks.map<SearchableEntity>((task) => ({
      id: `task:${task.id}`,
      entityId: task.id,
      kind: 'task',
      kindLabel: KIND_LABEL.task,
      title: task.title,
      subtitle: join(TASK_STATUS[task.status], task.dueDate && `截止 ${task.dueDate}`),
      keywords: [task.description],
      tags: task.tags,
      createdAt: task.createdAt,
      path: '/tasks',
      focusable: true,
    })),
    ...source.memos.map<SearchableEntity>((memo) => ({
      id: `memo:${memo.id}`,
      entityId: memo.id,
      kind: 'memo',
      kindLabel: KIND_LABEL.memo,
      title: memo.content,
      subtitle: '首页快速备忘',
      keywords: [],
      // 备忘是自由文本，不参与标签体系
      tags: [],
      createdAt: memo.createdAt,
      path: '/',
      // 备忘目前只在首页列表里平铺展示，没有可打开的详情
      focusable: false,
    })),
    ...source.books.map<SearchableEntity>((book) => ({
      id: `book:${book.id}`,
      entityId: book.id,
      kind: 'book',
      kindLabel: KIND_LABEL.book,
      title: `《${book.title}》`,
      subtitle: join(
        book.author,
        BOOK_STATUS[book.status],
        book.notes.length > 0 && `${book.notes.length} 条笔记`,
      ),
      keywords: [book.category, ...book.notes.slice(0, 3).map((note) => note.content)],
      tags: book.tags,
      createdAt: book.createdAt,
      path: '/study/books',
      focusable: true,
    })),
    ...source.devProjects.map<SearchableEntity>((project) => ({
      id: `dev:${project.id}`,
      entityId: project.id,
      kind: 'dev',
      kindLabel: KIND_LABEL.dev,
      title: project.name,
      subtitle: join(DEV_STATUS[project.status], project.techStack.join('/')),
      keywords: [project.description, project.repoUrl],
      tags: project.tags,
      createdAt: project.createdAt,
      // 开发项目有独立路由，直接进详情页，不需要聚焦请求
      path: `/dev/${project.id}`,
      focusable: false,
    })),
    ...source.writingProjects.map<SearchableEntity>((project) => ({
      id: `writing:${project.id}`,
      entityId: project.id,
      kind: 'writing',
      kindLabel: KIND_LABEL.writing,
      title: project.title,
      subtitle: join(WRITING_STATUS[project.status], `${project.wordCount} 字`),
      keywords: [project.notes],
      tags: project.tags,
      createdAt: project.createdAt,
      path: '/study/writing',
      focusable: true,
    })),
    ...source.games.map<SearchableEntity>((game) => ({
      id: `game:${game.id}`,
      entityId: game.id,
      kind: 'game',
      kindLabel: KIND_LABEL.game,
      title: game.name,
      subtitle: join(GAME_STATUS[game.status], game.platform, `${game.hoursPlayed} 小时`),
      keywords: [game.notes, ...game.achievements.map((achievement) => achievement.name)],
      tags: game.tags,
      createdAt: game.createdAt,
      path: '/games',
      focusable: true,
    })),
    ...recent(source.workoutRecords, STREAM_LIMIT).map<SearchableEntity>((record) => ({
      id: `workout:${record.id}`,
      entityId: record.id,
      kind: 'workout',
      kindLabel: KIND_LABEL.workout,
      title: workoutTitle(record),
      subtitle: join(
        record.date,
        record.exercises.length > 0 ? `${record.exercises.length} 个动作` : '暂无动作明细',
      ),
      keywords: [record.notes, ...record.exercises.map((exercise) => exercise.name)],
      tags: record.tags,
      // 训练记录没有 createdAt，用训练日期兜底排序
      createdAt: record.createdAt || record.date,
      path: '/fitness',
      // 健身页暂时没有「打开某条记录」的入口，回车先跳到模块
      focusable: false,
    })),
    ...recent(source.mealRecords, STREAM_LIMIT).map<SearchableEntity>((record) => ({
      id: `meal:${record.id}`,
      entityId: record.id,
      kind: 'meal',
      kindLabel: KIND_LABEL.meal,
      title: mealTitle(record),
      subtitle: join(record.date, `${record.totalCalories} 千卡`),
      keywords: record.items.map((item) => item.name),
      tags: record.tags,
      // 饮食记录只有日期，没有创建时间
      createdAt: record.date,
      path: '/diet',
      focusable: false,
    })),
  ];

  return entities.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, ENTITY_LIMIT);
}

/**
 * 输入是不是一个标签查询（以 `#` 开头）。是的话返回去掉 `#` 的标签关键字，否则 null。
 * `#` 单独输入也会返回空串 —— 表示「列出所有带标签的实体」。
 */
export function parseTagQuery(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed.startsWith('#') && !trimmed.startsWith('＃')) return null;
  return normalizeTag(trimmed);
}

/**
 * 按标签筛选实体：`#工作` 命中所有带该标签的记录，`#工` 也能命中（前缀输入时不必打完）。
 * 关键字为空表示「只要有标签的都算」，于是单独输入 `#` 就是「看看都打了哪些标签」。
 */
export function matchEntitiesByTag(
  entities: readonly SearchableEntity[],
  tag: string,
): SearchableEntity[] {
  const key = normalizeTag(tag).toLowerCase();
  if (key === '') return entities.filter((entity) => entity.tags.length > 0);
  return entities.filter((entity) => entity.tags.some((item) => item.toLowerCase().includes(key)));
}

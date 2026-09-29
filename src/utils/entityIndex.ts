import type { Book, DevProject, Game, Memo, Task, WritingProject } from '../types';

/** 「实体」结果能落到的模块 */
export type EntityKind = 'task' | 'memo' | 'book' | 'dev' | 'writing' | 'game';

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
}

const KIND_LABEL: Record<EntityKind, string> = {
  task: '任务',
  memo: '备忘',
  book: '书',
  dev: '开发项目',
  writing: '写作',
  game: '游戏',
};

/** 实体条数上限：跨模块检索是给人用的，不需要把几千条全塞进面板 */
export const ENTITY_LIMIT = 400;

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

const join = (...parts: Array<string | false | undefined>): string =>
  parts
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' · ');

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
      createdAt: book.createdAt,
      path: '/books',
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
      createdAt: project.createdAt,
      path: '/writing',
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
      createdAt: game.createdAt,
      path: '/games',
      focusable: true,
    })),
  ];

  return entities.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, ENTITY_LIMIT);
}

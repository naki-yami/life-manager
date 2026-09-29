import { describe, expect, it } from 'vitest';
import { buildEntityIndex, ENTITY_LIMIT, type EntitySource } from './entityIndex';
import type { Book, DevProject, Game, Memo, Task, WritingProject } from '../types';

const task = (over: Partial<Task> & { id: string; title: string }): Task => ({
  description: '',
  priority: 'medium',
  status: 'pending',
  dueDate: '',
  subtasks: [],
  repeat: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const memo = (id: string, content: string, createdAt: string): Memo => ({ id, content, createdAt });

const book = (over: Partial<Book> & { id: string; title: string }): Book => ({
  author: '',
  category: '',
  status: 'want-to-read',
  progress: 0,
  notes: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const devProject = (over: Partial<DevProject> & { id: string; name: string }): DevProject => ({
  description: '',
  status: 'planning',
  tasks: [],
  hoursSpent: 0,
  techStack: [],
  repoUrl: '',
  archived: false,
  milestones: [],
  logs: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const writingProject = (
  over: Partial<WritingProject> & { id: string; title: string },
): WritingProject => ({
  type: 'article',
  status: 'draft',
  wordCount: 0,
  notes: '',
  content: '',
  targetWords: 0,
  snapshots: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const game = (over: Partial<Game> & { id: string; name: string }): Game => ({
  platform: 'PC',
  status: 'playing',
  hoursPlayed: 0,
  progress: 0,
  achievements: [],
  notes: '',
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const emptySource = (over: Partial<EntitySource> = {}): EntitySource => ({
  tasks: [],
  memos: [],
  books: [],
  devProjects: [],
  writingProjects: [],
  games: [],
  ...over,
});

describe('buildEntityIndex', () => {
  it('把各模块记录摊平成带模块名与跳转路由的条目', () => {
    const entities = buildEntityIndex(
      emptySource({
        tasks: [task({ id: 't1', title: '交周报', dueDate: '2026-09-29' })],
        memos: [memo('m1', '记得买牛奶', '2026-09-02T00:00:00.000Z')],
        books: [book({ id: 'b1', title: '置身事内', author: '兰小欢' })],
        devProjects: [devProject({ id: 'd1', name: '记账 App', status: 'in-progress' })],
        writingProjects: [writingProject({ id: 'w1', title: '周报模板', wordCount: 120 })],
        games: [game({ id: 'g1', name: '星露谷物语', hoursPlayed: 12 })],
      }),
    );

    const byId = Object.fromEntries(entities.map((entity) => [entity.id, entity]));
    expect(byId['task:t1']).toMatchObject({
      kind: 'task',
      kindLabel: '任务',
      title: '交周报',
      path: '/tasks',
      focusable: true,
    });
    expect(byId['task:t1']!.subtitle).toContain('截止 2026-09-29');
    expect(byId['memo:m1']).toMatchObject({
      kind: 'memo',
      title: '记得买牛奶',
      path: '/',
      focusable: false,
    });
    expect(byId['book:b1']).toMatchObject({
      title: '《置身事内》',
      path: '/books',
      focusable: true,
    });
    expect(byId['book:b1']!.subtitle).toContain('兰小欢');
    // 开发项目有独立路由，直接进详情页
    expect(byId['dev:d1']).toMatchObject({ path: '/dev/d1', focusable: false });
    expect(byId['writing:w1']).toMatchObject({ path: '/writing', focusable: true });
    expect(byId['writing:w1']!.subtitle).toContain('120 字');
    expect(byId['game:g1']).toMatchObject({ path: '/games', focusable: true });
    expect(byId['game:g1']!.subtitle).toContain('12 小时');
  });

  it('新的排前面', () => {
    const entities = buildEntityIndex(
      emptySource({
        tasks: [
          task({ id: 'old', title: '早的', createdAt: '2026-09-01T00:00:00.000Z' }),
          task({ id: 'new', title: '晚的', createdAt: '2026-09-20T00:00:00.000Z' }),
        ],
      }),
    );
    expect(entities.map((entity) => entity.entityId)).toEqual(['new', 'old']);
  });

  it('把说明、作者、笔记等也放进可匹配词里', () => {
    const entities = buildEntityIndex(
      emptySource({
        tasks: [task({ id: 't1', title: '交周报', description: '给张总' })],
        books: [
          book({
            id: 'b1',
            title: '置身事内',
            notes: [{ id: 'n1', content: '土地财政', createdAt: '' }],
          }),
        ],
      }),
    );
    const byId = Object.fromEntries(entities.map((entity) => [entity.id, entity]));
    expect(byId['task:t1']!.keywords).toContain('给张总');
    expect(byId['book:b1']!.keywords).toContain('土地财政');
  });

  it('超过上限时截断，避免面板被大库拖慢', () => {
    const tasks = Array.from({ length: ENTITY_LIMIT + 20 }, (_, index) =>
      task({ id: `t${index}`, title: `任务 ${index}` }),
    );
    expect(buildEntityIndex(emptySource({ tasks }))).toHaveLength(ENTITY_LIMIT);
  });

  it('空数据返回空数组', () => {
    expect(buildEntityIndex(emptySource())).toEqual([]);
  });
});

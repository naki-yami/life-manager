import { describe, expect, it } from 'vitest';
import {
  buildEntityIndex,
  ENTITY_LIMIT,
  matchEntitiesByTag,
  parseTagQuery,
  STREAM_LIMIT,
  type EntitySource,
} from './entityIndex';
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
import { normalizeTags } from './tags';

const task = (over: Partial<Task> & { id: string; title: string }): Task => ({
  description: '',
  priority: 'medium',
  status: 'pending',
  dueDate: '',
  subtasks: [],
  repeat: null,
  timebox: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
  tags: over.tags ?? [],
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
  tags: over.tags ?? [],
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
  tags: over.tags ?? [],
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
  tags: over.tags ?? [],
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
  tags: over.tags ?? [],
});

const workout = (over: Partial<WorkoutRecord> & { id: string }): WorkoutRecord => ({
  date: '2026-09-20',
  planName: '',
  exercises: [],
  notes: '',
  createdAt: '2026-09-20T10:00:00.000Z',
  ...over,
  tags: normalizeTags(over.tags ?? []),
});

const meal = (over: Partial<MealRecord> & { id: string }): MealRecord => ({
  date: '2026-09-20',
  type: 'lunch',
  items: [],
  totalCalories: 0,
  totalProtein: 0,
  totalCarbs: 0,
  totalFat: 0,
  ...over,
  tags: normalizeTags(over.tags ?? []),
});

const emptySource = (over: Partial<EntitySource> = {}): EntitySource => ({
  tasks: [],
  memos: [],
  books: [],
  devProjects: [],
  writingProjects: [],
  games: [],
  workoutRecords: [],
  mealRecords: [],
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

describe('训练与饮食记录的索引', () => {
  it('训练记录优先用训练名作标题，没有训练名就用动作名', () => {
    const entities = buildEntityIndex(
      emptySource({
        workoutRecords: [
          workout({
            id: 'wo1',
            planName: '胸肌日',
            date: '2026-09-20',
            exercises: [{ name: '卧推', sets: 4, reps: 8, weight: 60 }],
          }),
          workout({
            id: 'wo2',
            planName: '',
            date: '2026-09-19',
            exercises: [{ name: '深蹲', sets: 5, reps: 5, weight: 100 }],
          }),
          workout({ id: 'wo3', planName: '' }),
        ],
      }),
    );
    const byId = Object.fromEntries(entities.map((entity) => [entity.id, entity]));
    expect(byId['workout:wo1']).toMatchObject({
      kind: 'workout',
      kindLabel: '训练记录',
      title: '胸肌日',
      path: '/fitness',
      // 健身页还没有「打开某条记录」的入口，所以只跳到模块
      focusable: false,
    });
    expect(byId['workout:wo1']!.subtitle).toContain('2026-09-20');
    expect(byId['workout:wo1']!.keywords).toContain('卧推');
    expect(byId['workout:wo2']!.title).toBe('深蹲');
    expect(byId['workout:wo3']!.title).toBe('训练记录');
  });

  it('饮食记录用「餐次：前两样」作标题', () => {
    const entities = buildEntityIndex(
      emptySource({
        mealRecords: [
          meal({
            id: 'm1',
            type: 'dinner',
            date: '2026-09-20',
            totalCalories: 700,
            items: [
              { name: '米饭', category: '主食', calories: 200 },
              { name: '鸡胸肉', category: '蛋白质', calories: 300 },
              { name: '西兰花', category: '蔬菜', calories: 200 },
            ],
          }),
          meal({ id: 'm2', type: 'snack', items: [] }),
        ],
      }),
    );
    const byId = Object.fromEntries(entities.map((entity) => [entity.id, entity]));
    expect(byId['meal:m1']).toMatchObject({
      kind: 'meal',
      kindLabel: '饮食记录',
      title: '晚餐：米饭、鸡胸肉',
      path: '/diet',
      focusable: false,
    });
    expect(byId['meal:m1']!.subtitle).toContain('700 千卡');
    expect(byId['meal:m1']!.keywords).toContain('西兰花');
    expect(byId['meal:m2']!.title).toBe('加餐');
  });

  it('流水类只索引最近的 STREAM_LIMIT 条，避免把别的模块挤出上限', () => {
    const mealRecords = Array.from({ length: STREAM_LIMIT + 30 }, (_, index) =>
      meal({ id: `m${index}`, date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}` }),
    );
    const entities = buildEntityIndex(emptySource({ mealRecords }));
    expect(entities).toHaveLength(STREAM_LIMIT);
    expect(entities.every((entity) => entity.kind === 'meal')).toBe(true);
  });

  it('截止日期更晚的流水排在前面', () => {
    const entities = buildEntityIndex(
      emptySource({
        mealRecords: [
          meal({ id: 'old', date: '2026-09-01' }),
          meal({ id: 'new', date: '2026-09-20' }),
        ],
      }),
    );
    expect(entities.map((entity) => entity.entityId)).toEqual(['new', 'old']);
  });
});

describe('标签索引与筛选', () => {
  const taggedSource = (): EntitySource =>
    emptySource({
      tasks: [task({ id: 't1', title: '交周报', tags: ['工作'] })],
      books: [book({ id: 'b1', title: '置身事内', tags: ['工作', '经济'] })],
      devProjects: [devProject({ id: 'd1', name: '记账 App', tags: ['工作'] })],
      memos: [memo('m1', '随手记', '2026-09-02T00:00:00.000Z')],
    });

  it('标签进入 tags 字段；备忘是自由文本，没有标签', () => {
    const byId = Object.fromEntries(
      buildEntityIndex(taggedSource()).map((entity) => [entity.id, entity]),
    );
    expect(byId['task:t1']!.tags).toEqual(['工作']);
    expect(byId['book:b1']!.tags).toEqual(['工作', '经济']);
    expect(byId['memo:m1']!.tags).toEqual([]);
  });

  it('搜「工作」能同时命中任务、书与项目', () => {
    const hits = matchEntitiesByTag(buildEntityIndex(taggedSource()), '工作');
    expect(hits.map((entity) => entity.kind).sort()).toEqual(['book', 'dev', 'task']);
    // 每个模块只出现一次，不会因为标签重复而出现多条
    expect(new Set(hits.map((entity) => entity.id)).size).toBe(hits.length);
  });

  it('parseTagQuery 只认 # 开头的输入', () => {
    expect(parseTagQuery('#工作')).toBe('工作');
    expect(parseTagQuery('＃工作')).toBe('工作');
    expect(parseTagQuery('  #工作  ')).toBe('工作');
    expect(parseTagQuery('工作')).toBeNull();
    expect(parseTagQuery('')).toBeNull();
    // 只打了一个 #：列出所有带标签的记录
    expect(parseTagQuery('#')).toBe('');
  });

  it('matchEntitiesByTag 支持前缀输入，空关键字列全部带标签的记录', () => {
    const entities = buildEntityIndex(taggedSource());
    // 同一时间创建的记录保持索引里的先后顺序（任务 → 书 → 项目）
    expect(matchEntitiesByTag(entities, '工作').map((entity) => entity.entityId)).toEqual([
      't1',
      'b1',
      'd1',
    ]);
    expect(matchEntitiesByTag(entities, '经').map((entity) => entity.entityId)).toEqual(['b1']);
    expect(matchEntitiesByTag(entities, '')).toHaveLength(3);
    expect(matchEntitiesByTag(entities, '不存在')).toEqual([]);
  });
});

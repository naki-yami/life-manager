import { z } from 'zod';

/**
 * 备份文件的 schema 定义。
 * 所有实体的校验规则集中在这里，导入时用它做校验，
 * 保证「坏数据不会写进 store」，同时给出精确到字段路径的错误信息。
 */

export const APP_ID = 'life-manager';
export const BACKUP_SCHEMA_VERSION = 3;

const isoDateString = z.string();
const percent = z.number().min(0).max(100).catch(0);

// ---------- 今日计划 ----------
export const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string().default(''),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  status: z.enum(['pending', 'completed']).default('pending'),
  dueDate: z.string().default(''),
  createdAt: isoDateString.default(() => new Date().toISOString()),
  completedAt: z.string().optional(),
});

export const memoSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

// ---------- 读书 ----------
export const bookNoteSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

export const bookSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  author: z.string().default(''),
  category: z.string().default(''),
  status: z.enum(['want-to-read', 'reading', 'finished']).default('want-to-read'),
  progress: percent,
  notes: z.array(bookNoteSchema).default([]),
  createdAt: isoDateString.default(() => new Date().toISOString()),
  finishedAt: isoDateString.optional(),
});

// ---------- 开发工作 ----------
export const devTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  status: z.enum(['todo', 'in-progress', 'done']).default('todo'),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

export const devProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().default(''),
  status: z.enum(['planning', 'in-progress', 'completed', 'paused']).default('planning'),
  tasks: z.array(devTaskSchema).default([]),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

// ---------- 写作 ----------
export const writingProjectSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  type: z.enum(['article', 'copy', 'book']).default('article'),
  status: z.enum(['draft', 'in-progress', 'completed']).default('draft'),
  wordCount: z.number().min(0).catch(0),
  notes: z.string().default(''),
  createdAt: isoDateString.default(() => new Date().toISOString()),
  updatedAt: isoDateString.default(() => new Date().toISOString()),
});

// ---------- 健身 ----------
export const exerciseSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  sets: z.number().min(0).catch(0),
  reps: z.number().min(0).catch(0),
  weight: z.number().min(0).catch(0),
});

export const workoutRecordSchema = z.object({
  id: z.string().min(1),
  date: z.string(),
  planName: z.string().default(''),
  exercises: z.array(exerciseSchema).default([]),
  notes: z.string().default(''),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

export const fitnessPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().default(''),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

// ---------- 饮食 ----------
export const foodItemSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  category: z.string().default(''),
  calories: z.number().min(0).catch(0),
});

export const mealRecordSchema = z.object({
  id: z.string().min(1),
  date: z.string(),
  type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).default('breakfast'),
  items: z.array(foodItemSchema).default([]),
  totalCalories: z.number().min(0).catch(0),
});

// ---------- 游戏 ----------
export const gameAchievementSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().default(''),
  unlocked: z.boolean().default(false),
});

export const gameSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  platform: z.enum(['PC', 'PS5', 'Xbox', 'Switch', 'Mobile', 'Other']).default('PC'),
  status: z.enum(['playing', 'completed', 'backlog']).default('playing'),
  hoursPlayed: z.number().min(0).catch(0),
  progress: percent,
  achievements: z.array(gameAchievementSchema).default([]),
  notes: z.string().default(''),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

/** 游玩流水；旧的备份文件里没有这个模块，导入时不会清空现有记录 */
export const gameSessionSchema = z.object({
  id: z.string().min(1),
  gameId: z.string().default(''),
  date: z.string().default(''),
  hours: z.number().min(0).catch(0),
  note: z.string().default(''),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

// ---------- 设置 ----------
export const settingsSchema = z.object({
  /** 新字段（v3）：三态主题 */
  themeMode: z.enum(['light', 'dark', 'system']).optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
  sidebarCollapsed: z.boolean().optional(),
  /** 旧备份里只有二态 theme，导入时按 themeMode 处理 */
  theme: z.enum(['light', 'dark']).optional(),
});

/** 备份数据体的统一结构：模块名 -> 记录数组 */
export const backupDataSchema = z.object({
  tasks: z.array(taskSchema).default([]),
  memos: z.array(memoSchema).default([]),
  books: z.array(bookSchema).default([]),
  devProjects: z.array(devProjectSchema).default([]),
  writingProjects: z.array(writingProjectSchema).default([]),
  fitnessPlans: z.array(fitnessPlanSchema).default([]),
  fitnessRecords: z.array(workoutRecordSchema).default([]),
  dietRecords: z.array(mealRecordSchema).default([]),
  games: z.array(gameSchema).default([]),
  gameSessions: z.array(gameSessionSchema).default([]),
  settings: settingsSchema.optional(),
});

export type BackupData = z.infer<typeof backupDataSchema>;

export const BACKUP_MODULES = [
  'tasks',
  'memos',
  'books',
  'devProjects',
  'writingProjects',
  'fitnessPlans',
  'fitnessRecords',
  'dietRecords',
  'games',
  'gameSessions',
] as const;

export type BackupModule = (typeof BACKUP_MODULES)[number];

export const MODULE_LABELS: Record<BackupModule, string> = {
  tasks: '任务',
  memos: '备忘',
  books: '书籍',
  devProjects: '开发项目',
  writingProjects: '写作项目',
  fitnessPlans: '训练计划',
  fitnessRecords: '训练记录',
  dietRecords: '饮食记录',
  games: '游戏',
  gameSessions: '游玩记录',
};

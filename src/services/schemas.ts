import { z } from 'zod';
import { normalizeTags } from '../utils/tags';

/**
 * 备份文件的 schema 定义。
 * 所有实体的校验规则集中在这里，导入时用它做校验，
 * 保证「坏数据不会写进 store」，同时给出精确到字段路径的错误信息。
 */

export const APP_ID = 'life-manager';
/**
 * 备份文件的 schema 版本。
 * 11：7 类实体（任务 / 书 / 开发项目 / 写作 / 游戏 / 训练记录 / 饮食记录）新增
 *     `tags` 字段；旧文件里没有它，导入时补空数组。
 */
export const BACKUP_SCHEMA_VERSION = 11;

const isoDateString = z.string();
const percent = z.number().min(0).max(100).catch(0);

/**
 * 统一标签字段。
 *
 * `.default([])` 保证旧备份 / 旧 localStorage 里没有 tags 的记录被读出来时补上空数组；
 * `.transform()` 顺手归一化（去 `#`、去空、忽略大小写去重、限长），于是
 * 「脏数据不会进 store」这条规则对标签同样成立，读取处不用再自己清洗。
 */
const tags = z
  .array(z.string())
  .default([])
  .transform((list) => normalizeTags(list));

// ---------- 今日计划 ----------
export const subTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  done: z.boolean().default(false),
});

export const repeatRuleSchema = z.object({
  kind: z.enum(['daily', 'weekdays', 'weekly', 'monthly']),
  /** kind = 'weekly' 时生效；0 = 周一 … 6 = 周日 */
  weekdays: z.array(z.number().min(0).max(6)).optional(),
});

export const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string().default(''),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  status: z.enum(['pending', 'completed']).default('pending'),
  dueDate: z.string().default(''),
  tags,
  /** v7：子任务与重复规则；旧备份缺省时补默认值 */
  subtasks: z.array(subTaskSchema).default([]),
  repeat: repeatRuleSchema.nullable().default(null),
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
  /** v7：笔记对应的页码；旧备份没有就不填 */
  page: z.number().min(0).optional(),
});

export const bookSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  author: z.string().default(''),
  category: z.string().default(''),
  status: z.enum(['want-to-read', 'reading', 'finished']).default('want-to-read'),
  progress: percent,
  notes: z.array(bookNoteSchema).default([]),
  tags,
  /** v7：总页数与开始阅读时间；旧备份缺省时按注释处理 */
  totalPages: z.number().min(0).optional(),
  startedAt: isoDateString.optional(),
  createdAt: isoDateString.default(() => new Date().toISOString()),
  finishedAt: isoDateString.optional(),
});

/** 阅读流水；旧的备份文件里没有这个模块，导入时不会清空现有记录 */
export const readingSessionSchema = z.object({
  id: z.string().min(1),
  bookId: z.string().default(''),
  date: z.string().default(''),
  minutes: z.number().min(0).catch(0),
  note: z.string().default(''),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

// ---------- 开发工作 ----------
export const devTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  status: z.enum(['todo', 'in-progress', 'done']).default('todo'),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  /** v10：工作项分类；旧备份缺省按「功能」处理 */
  type: z.enum(['feature', 'requirement', 'bug', 'tech']).default('feature'),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

export const devMilestoneSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  dueDate: z.string().optional(),
  done: z.boolean().default(false),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

export const devLogEntrySchema = z.object({
  id: z.string().min(1),
  date: z.string().default(''),
  content: z.string(),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

export const devProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().default(''),
  status: z.enum(['planning', 'in-progress', 'completed', 'paused']).default('planning'),
  tasks: z.array(devTaskSchema).default([]),
  tags,
  /** 累计工时；旧备份里没有这个字段，导入时补 0 */
  hoursSpent: z.number().min(0).catch(0),
  /** v5：技术栈标签、仓库地址、起止日期与归档标记；旧备份缺省时按注释补齐 */
  techStack: z.array(z.string()).default([]),
  repoUrl: z.string().default(''),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
  archived: z.boolean().default(false),
  /** v10：里程碑与开发日志；旧备份缺省补空数组 */
  milestones: z.array(devMilestoneSchema).default([]),
  logs: z.array(devLogEntrySchema).default([]),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

/** 工时流水；旧的备份文件里没有这个模块，导入时不会清空现有记录 */
export const workSessionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().default(''),
  date: z.string().default(''),
  hours: z.number().min(0).catch(0),
  note: z.string().default(''),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

// ---------- 写作 ----------
export const writingSnapshotSchema = z.object({
  id: z.string().min(1),
  wordCount: z.number().min(0).catch(0),
  content: z.string().default(''),
  createdAt: isoDateString.default(() => new Date().toISOString()),
});

export const writingProjectSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  type: z.enum(['article', 'copy', 'book']).default('article'),
  status: z.enum(['draft', 'in-progress', 'completed']).default('draft'),
  wordCount: z.number().min(0).catch(0),
  notes: z.string().default(''),
  tags,
  /** v9：正文、目标字数与版本快照；旧备份缺省补齐（目标字数补 0） */
  content: z.string().default(''),
  targetWords: z.number().min(0).catch(0),
  snapshots: z.array(writingSnapshotSchema).default([]),
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
  tags,
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
  /** v8：三大营养素（克）；旧备份没有就保持缺省 */
  protein: z.number().min(0).optional(),
  carbs: z.number().min(0).optional(),
  fat: z.number().min(0).optional(),
});

export const mealRecordSchema = z.object({
  id: z.string().min(1),
  date: z.string(),
  type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).default('breakfast'),
  items: z.array(foodItemSchema).default([]),
  totalCalories: z.number().min(0).catch(0),
  tags,
  /**
   * v8：营养素合计。这三项是「由条目累加而来」的派生值，不是用户填的原始信息，
   * 所以旧数据缺省时统一补 0（表示这餐没记营养素），而不是留成 undefined ——
   * 否则每个读取处都要写 `?? 0`。
   */
  totalProtein: z.number().min(0).catch(0).default(0),
  totalCarbs: z.number().min(0).catch(0).default(0),
  totalFat: z.number().min(0).catch(0).default(0),
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
  tags,
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
  workSessions: z.array(workSessionSchema).default([]),
  writingProjects: z.array(writingProjectSchema).default([]),
  fitnessPlans: z.array(fitnessPlanSchema).default([]),
  fitnessRecords: z.array(workoutRecordSchema).default([]),
  dietRecords: z.array(mealRecordSchema).default([]),
  games: z.array(gameSchema).default([]),
  gameSessions: z.array(gameSessionSchema).default([]),
  readingSessions: z.array(readingSessionSchema).default([]),
  settings: settingsSchema.optional(),
});

export type BackupData = z.infer<typeof backupDataSchema>;

export const BACKUP_MODULES = [
  'tasks',
  'memos',
  'books',
  'devProjects',
  'workSessions',
  'writingProjects',
  'fitnessPlans',
  'fitnessRecords',
  'dietRecords',
  'games',
  'gameSessions',
  'readingSessions',
] as const;

export type BackupModule = (typeof BACKUP_MODULES)[number];

export const MODULE_LABELS: Record<BackupModule, string> = {
  tasks: '任务',
  memos: '备忘',
  books: '书籍',
  devProjects: '开发项目',
  workSessions: '工时记录',
  writingProjects: '写作项目',
  fitnessPlans: '训练计划',
  fitnessRecords: '训练记录',
  dietRecords: '饮食记录',
  games: '游戏',
  gameSessions: '游玩记录',
  readingSessions: '阅读记录',
};

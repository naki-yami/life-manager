// Task types for today plan
export type Priority = 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'completed';

export interface SubTask {
  id: string;
  title: string;
  done: boolean;
}

/** 重复规则：完成后自动生成下一次 */
export type RepeatKind = 'daily' | 'weekdays' | 'weekly' | 'monthly';

export interface RepeatRule {
  kind: RepeatKind;
  /** kind = 'weekly' 时生效；0 = 周一 … 6 = 周日 */
  weekdays?: number[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  dueDate: string;
  /** 子任务清单；旧数据可能没有 */
  subtasks: SubTask[];
  /** 重复规则；null 表示不重复。旧数据可能没有 */
  repeat: RepeatRule | null;
  createdAt: string;
  completedAt?: string;
}

// Book types
export type BookStatus = 'want-to-read' | 'reading' | 'finished';

export interface BookNote {
  id: string;
  content: string;
  createdAt: string;
  /** 笔记对应的页码；旧数据可能没有 */
  page?: number;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  status: BookStatus;
  progress: number;
  notes: BookNote[];
  /** 总页数；填了之后可以用页码换算进度。旧数据可能没有 */
  totalPages?: number;
  /** 首次标记为「已读」的时间，用来做年度阅读统计；旧数据可能没有 */
  finishedAt?: string;
  /** 最近一次开始阅读的时间，用来估算读完所需天数；旧数据可能没有 */
  startedAt?: string;
  createdAt: string;
}

/** 一次阅读记录；与游戏游玩流水、开发工时流水同一套模式 */
export interface ReadingSession {
  id: string;
  /** 关联的 Book.id */
  bookId: string;
  /** 阅读日期 YYYY-MM-DD */
  date: string;
  /** 阅读时长（分钟） */
  minutes: number;
  note: string;
  createdAt: string;
}

// Dev project types
export type DevProjectStatus = 'planning' | 'in-progress' | 'completed' | 'paused';
export type DevTaskStatus = 'todo' | 'in-progress' | 'done';

export interface DevTask {
  id: string;
  title: string;
  status: DevTaskStatus;
  priority: Priority;
  createdAt: string;
}

export interface DevProject {
  id: string;
  name: string;
  description: string;
  status: DevProjectStatus;
  tasks: DevTask[];
  /** 累计投入工时，由工时流水累加而来 */
  hoursSpent: number;
  /** 技术栈标签；旧数据可能没有 */
  techStack: string[];
  /** 仓库地址，空字符串表示未填写 */
  repoUrl: string;
  startDate?: string;
  endDate?: string;
  /** 归档的项目从默认列表隐藏，不再参与统计 */
  archived: boolean;
  createdAt: string;
}

/** 一次投入的工时记录；项目上的 hoursSpent 与这些流水共同维护 */
export interface WorkSession {
  id: string;
  /** 关联的 DevProject.id */
  projectId: string;
  /** 工作日期 YYYY-MM-DD */
  date: string;
  hours: number;
  note: string;
  createdAt: string;
}

// Writing types
export type WritingType = 'article' | 'copy' | 'book';
export type WritingStatus = 'draft' | 'in-progress' | 'completed';

export interface WritingProject {
  id: string;
  title: string;
  type: WritingType;
  status: WritingStatus;
  wordCount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// Fitness types
export interface Exercise {
  id?: string;
  name: string;
  sets: number;
  reps: number;
  weight: number;
}

export interface WorkoutRecord {
  id: string;
  date: string;
  planName: string;
  exercises: Exercise[];
  notes: string;
  createdAt: string;
}

export interface FitnessPlan {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

// Diet types
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodItem {
  id?: string;
  name: string;
  category: string;
  calories: number;
}

export interface MealRecord {
  id: string;
  date: string;
  type: MealType;
  items: FoodItem[];
  totalCalories: number;
}

// Game types
export type GamePlatform = 'PC' | 'PS5' | 'Xbox' | 'Switch' | 'Mobile' | 'Other';
export type GameStatus = 'playing' | 'completed' | 'backlog';

export interface GameAchievement {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
}

/** 一次游玩记录；总时长由 game.hoursPlayed 与这些流水共同维护 */
export interface GameSession {
  id: string;
  /** 关联的 Game.id */
  gameId: string;
  /** 游玩日期 YYYY-MM-DD */
  date: string;
  hours: number;
  note: string;
  createdAt: string;
}

export interface Game {
  id: string;
  name: string;
  platform: GamePlatform;
  status: GameStatus;
  hoursPlayed: number;
  progress: number;
  achievements: GameAchievement[];
  notes: string;
  createdAt: string;
}

// Memo types
export interface Memo {
  id: string;
  content: string;
  createdAt: string;
}

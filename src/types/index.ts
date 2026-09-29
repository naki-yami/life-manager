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

/**
 * 任务的时间盒：把任务排到某一天的某个时间点。
 *
 * 为什么不复用 `dueDate`：截止日期回答「最晚什么时候做完」，
 * 时间盒回答「我打算什么时候做」。两者经常不一致（提前做、逾期补做），
 * 拆开之后拖时间轴不会顺带改掉截止日期。
 */
export interface TaskTimebox {
  /** 时间盒所在日期 YYYY-MM-DD */
  date: string;
  /** 开始时间 HH:mm（24 小时制，本地时间） */
  start: string;
  /** 计划时长（分钟） */
  minutes: number;
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
  /** 今日时间轴上的时间盒；null 表示还没排。旧数据可能没有 */
  timebox: TaskTimebox | null;
  /** 统一标签（不带 #）；旧数据由归一化补 []，所以这里不是可选的 */
  tags: string[];
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
  /** 统一标签（不带 #）；旧数据由归一化补 [] */
  tags: string[];
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

/** 工作项分类：功能 / 需求 / BUG / 技术问题 */
export type DevItemType = 'feature' | 'requirement' | 'bug' | 'tech';

export interface DevTask {
  id: string;
  title: string;
  status: DevTaskStatus;
  priority: Priority;
  /** 工作项分类；旧数据可能没有，默认按「功能」处理 */
  type: DevItemType;
  createdAt: string;
}

/** 项目里程碑：做完一个勾一个 */
export interface DevMilestone {
  id: string;
  title: string;
  /** 目标日期 YYYY-MM-DD，可选 */
  dueDate?: string;
  done: boolean;
  createdAt: string;
}

/** 开发日志：按天记流水 */
export interface DevLogEntry {
  id: string;
  /** 日志日期 YYYY-MM-DD */
  date: string;
  content: string;
  createdAt: string;
}

export interface DevProject {
  id: string;
  name: string;
  description: string;
  status: DevProjectStatus;
  tasks: DevTask[];
  /** 统一标签（不带 #）；与 techStack 不同，它跨模块、可用于筛选 */
  tags: string[];
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
  /** 里程碑；旧数据可能没有 */
  milestones: DevMilestone[];
  /** 开发日志；旧数据可能没有 */
  logs: DevLogEntry[];
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

/** 保存正文时留下的版本快照，保留最近 20 版 */
export interface WritingSnapshot {
  id: string;
  wordCount: number;
  content: string;
  createdAt: string;
}

export interface WritingProject {
  id: string;
  title: string;
  type: WritingType;
  status: WritingStatus;
  wordCount: number;
  notes: string;
  /** 统一标签（不带 #）；旧数据由归一化补 [] */
  tags: string[];
  /** 正文；编辑器保存时更新，字数随之自动同步。旧数据可能没有 */
  content: string;
  /** 目标字数；0 表示未设置。旧数据可能没有 */
  targetWords: number;
  snapshots: WritingSnapshot[];
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
  /** 统一标签（不带 #），例如部位「胸 / 背 / 腿」 */
  tags: string[];
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
  /** 三大营养素（克）；旧数据可能没有 */
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface MealRecord {
  id: string;
  date: string;
  type: MealType;
  items: FoodItem[];
  totalCalories: number;
  /** 统一标签（不带 #），例如「外食 / 加班餐」 */
  tags: string[];
  /**
   * 三大营养素合计（克），由条目累加而来。
   * 旧数据缺省时由归一化补 0，所以这里不是可选的 —— 读取处不必再写 `?? 0`。
   */
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

/** 每日饮食目标；0 表示未设置 */
export interface DietGoals {
  calories: number;
  protein: number;
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
  /** 统一标签（不带 #）；旧数据由归一化补 [] */
  tags: string[];
  createdAt: string;
}

// Memo types
export interface Memo {
  id: string;
  content: string;
  createdAt: string;
}
// Habit types
export type HabitKind = 'binary' | 'count';
export type HabitScheduleKind = 'daily' | 'weekly' | 'interval';

/**
 * 习惯的节奏。
 *
 * 三个字段都必填：归一化层会把缺失项补成默认值，代码里就不必到处写 `?? 1`。
 * 只有 kind 对应的那个字段会被读取，另一个只是占位。
 */
export interface HabitSchedule {
  kind: HabitScheduleKind;
  /** kind = 'weekly' 时生效：每周目标次数（1-7） */
  timesPerWeek: number;
  /** kind = 'interval' 时生效：间隔天数（>=1），例如「每 2 天」 */
  everyDays: number;
}

export interface Habit {
  id: string;
  name: string;
  /** binary：做到即完成；count：数量达到 target 才算完成 */
  kind: HabitKind;
  /** count 型的目标数量；binary 型固定按 1 处理 */
  target: number;
  /** 计量单位，例如「杯」「公里」；binary 型为空串 */
  unit: string;
  schedule: HabitSchedule;
  /**
   * 打卡日志：日期键（YYYY-MM-DD）→ 当天完成量。
   * 只记「有打卡」的日子，取消打卡即删除该键，避免存储里积一堆 0。
   */
  logs: Record<string, number>;
  createdAt: string;
}

// Body metric types
/**
 * 身体指标：一天最多一条。
 *
 * `weight` / `bodyFat` 是高频项，所以拆成独立字段而不是塞进 measurements ——
 * 趋势图、环比、统计页都要单独读它们，独立字段省掉一层字符串键查找。
 * `measurements` 存围度，键是部位（内置胸 / 腰 / 臀 / 臂 / 腿，也允许自建），值统一按 cm 记。
 */
export interface BodyMetric {
  id: string;
  /** 记录日期 YYYY-MM-DD；同一天只保留一条 */
  date: string;
  /** 体重（kg）；undefined 表示那天没称 */
  weight?: number;
  /** 体脂率（%）；undefined 表示那天没测 */
  bodyFat?: number;
  /** 围度（cm）：部位键 -> 数值；没填的部位不会出现 */
  measurements: Record<string, number>;
  createdAt: string;
}

// Focus types
/** 番茄钟：倒计时到点；正计时：一直往上走，手动停 */
export type FocusMode = 'pomodoro' | 'stopwatch';

/**
 * 专注对象。前三种对应「能把时长回填成流水」的模块：
 * - `task`：专注结束可以直接把任务勾掉；
 * - `dev` / `book` / `game`：把这次时长写成工时 / 阅读 / 游玩流水。
 */
export type FocusTarget = 'task' | 'dev' | 'book' | 'game';

/**
 * 进行中的专注。
 *
 * 与已完成的会话分开存：秒表在跑的时候不该在「记录列表」里出现一条半成品，
 * 刷新页面后用户需要的也只是「还在跑的那一个」，而不是一堆中间态。
 */
export interface ActiveFocus {
  /** 关联实体 id；实体被删掉后这里就只是一个孤 id，展示时回退到 title */
  entityId: string;
  /** 开始时的标题快照，实体被删后仍能看懂这次专注做的是什么 */
  title: string;
  target: FocusTarget;
  mode: FocusMode;
  /** 计划时长（分钟）：番茄钟到点自动结束，正计时只用来显示「已超时多久」 */
  plannedMinutes: number;
  startedAt: string;
}

/** 一次已完成的专注；取消的专注不写记录 */
export interface FocusSession {
  id: string;
  /** 专注发生在哪一天 YYYY-MM-DD（按 startedAt 的本地日期） */
  date: string;
  entityId: string;
  title: string;
  target: FocusTarget;
  mode: FocusMode;
  plannedMinutes: number;
  /** 实际专注分钟数，至少 1 分钟 */
  minutes: number;
  startedAt: string;
  endedAt: string;
  /** 时长是否已经写成对应模块的流水；避免重复回填 */
  posted: boolean;
  createdAt: string;
}

// Review types
/** 复盘的周期粒度：日复盘与周复盘各写各的，互不覆盖 */
export type ReviewPeriod = 'day' | 'week';

/**
 * 一次复盘。
 *
 * 三个取舍：
 * - **一个周期只有一条**：`period + date` 就是主键，同一天再写是修正而不是新增，
 *   否则「这周我到底怎么想的」会散落在好几条记录里；
 * - **`date` 存周期起始日**：日复盘存当天，周复盘存那周的周一，
 *   这样「哪一周」不需要再算一遍，也天然排好序；
 * - **只存三个回答，不存汇总数字**：汇总能从各模块的流水实时算出来，
 *   存下来反而会在数据变动之后撒谎。
 */
export interface ReviewEntry {
  id: string;
  period: ReviewPeriod;
  /** 周期起始日 YYYY-MM-DD：日复盘＝当天，周复盘＝那周的周一 */
  date: string;
  /** 最有价值的一件事 */
  best: string;
  /** 最大的阻碍 */
  blocker: string;
  /** 下个周期最重要的事 */
  next: string;
  createdAt: string;
  updatedAt: string;
}
// Goal types
/** 目标的周期粒度：一天、一周、一月各算各的 */
export type GoalPeriod = 'day' | 'week' | 'month';

/**
 * 可设目标的指标。
 *
 * 取值必须与 `src/utils/metrics.ts` 的 registry 对齐 —— 那边是取数的唯一实现，
 * 这里只是把「哪些指标适合当目标」固化成类型：热量日均这类「越低越好」的指标不在其中，
 * `达成率 = 当前值 / 目标值` 对它不成立。
 */
export type GoalMetric =
  | 'tasks.completed'
  | 'focus.minutes'
  | 'fitness.sessions'
  | 'reading.minutes'
  | 'dev.hours'
  | 'habit.rate';

/**
 * 一个目标。
 *
 * 两个取舍：
 * - **只存「指标 + 周期 + 目标值」，不存进度**：进度每次从各模块流水现算，
 *   存下来会在数据变动之后悄悄撒谎（与复盘汇总同一个道理）；
 * - **同一指标同一周期只留一条**：`每周训练 4 次` 和 `每周训练 6 次` 同时存在着，
 *   只会让人不知道该看哪个，要改就改那一条。
 */
export interface Goal {
  id: string;
  metric: GoalMetric;
  period: GoalPeriod;
  /** 目标值；`habit.rate` 按百分比（1–100） */
  target: number;
  createdAt: string;
}
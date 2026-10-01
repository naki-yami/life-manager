import { addDays, todayKey } from '../utils/date';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useDietStore } from '../store/dietStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useGameStore } from '../store/gameStore';
import { useTaskStore } from '../store/taskStore';
import { useWritingStore } from '../store/writingStore';
import type {
  Book,
  DevProject,
  Game,
  GameSession,
  MealRecord,
  Task,
  WorkoutRecord,
  WritingProject,
} from '../types';

/**
 * 示例数据（原 7.7）：给新用户一键「看看各页面长什么样」的样本。
 *
 * 两条铁律：
 * - 所有实体 id 以 `demo-` 开头 —— 清除就是按前缀过滤，不需要额外的登记表；
 * - 载入前先把旧的 demo 记录剔掉再追加，重复点「载入」不会翻倍。
 *
 * 日期全部相对「今天」，保证载入时热力图 / 趋势图 / 时间轴立刻有东西看。
 */

const DEMO_PREFIX = 'demo-';

const nowIso = (): string => new Date().toISOString();

/** 全应用是否还一条真实数据都没有（示例数据不算） */
export function appIsEmpty(): boolean {
  return (
    useTaskStore.getState().tasks.length === 0 &&
    useBookStore.getState().books.length === 0 &&
    useDevStore.getState().projects.length === 0 &&
    useWritingStore.getState().projects.length === 0 &&
    useFitnessStore.getState().records.length === 0 &&
    useDietStore.getState().records.length === 0 &&
    useGameStore.getState().games.length === 0
  );
}

/** 库里是否还留着示例数据 */
export function demoDataExists(): boolean {
  const hasDemo = (ids: Array<{ id: string }>): boolean =>
    ids.some((item) => item.id.startsWith(DEMO_PREFIX));
  return (
    hasDemo(useTaskStore.getState().tasks) ||
    hasDemo(useBookStore.getState().books) ||
    hasDemo(useDevStore.getState().projects) ||
    hasDemo(useWritingStore.getState().projects) ||
    hasDemo(useFitnessStore.getState().records) ||
    hasDemo(useDietStore.getState().records) ||
    hasDemo(useGameStore.getState().games)
  );
}

/** 载入示例数据：先剔掉旧的 demo 记录再追加，可重复调用不翻倍 */
export function seedDemoData(): void {
  const today = todayKey();
  const yesterday = addDays(today, -1);
  const inThreeDays = addDays(today, 3);

  // ---------- 今日计划 ----------
  const demoTasks: Task[] = [
    {
      id: 'demo-task-1',
      title: '把季度总结写完',
      description: '先列大纲，再填数据',
      priority: 'high',
      status: 'pending',
      dueDate: today,
      subtasks: [
        { id: 'demo-sub-1', title: '列大纲', done: true },
        { id: 'demo-sub-2', title: '写正文', done: false },
      ],
      repeat: null,
      timebox: null,
      tags: ['工作'],
      createdAt: nowIso(),
    },
    {
      id: 'demo-task-2',
      title: '预约体检',
      description: '',
      priority: 'medium',
      status: 'pending',
      dueDate: inThreeDays,
      subtasks: [],
      repeat: null,
      timebox: null,
      tags: [],
      createdAt: nowIso(),
    },
    {
      id: 'demo-task-3',
      title: '给博客换新主题',
      description: '',
      priority: 'low',
      status: 'completed',
      dueDate: yesterday,
      subtasks: [],
      repeat: null,
      timebox: null,
      tags: [],
      createdAt: nowIso(),
      completedAt: `${yesterday}T21:00:00.000Z`,
    },
  ];
  const taskStore = useTaskStore.getState();
  taskStore.replaceTasks([...taskStore.tasks.filter((t) => !t.id.startsWith(DEMO_PREFIX)), ...demoTasks]);

  // ---------- 读书 ----------
  const demoBooks: Book[] = [
    {
      id: 'demo-book-1',
      title: '置身事内',
      author: '兰小欢',
      category: '经济',
      status: 'reading',
      progress: 45,
      notes: [],
      tags: ['经济'],
      rating: 9,
      review: '通俗易懂，讲透了地方政府',
      favorite: true,
      statusHistory: [{ id: 'demo-sh-1', status: 'reading', date: yesterday }],
      totalPages: 320,
      startedAt: `${addDays(today, -6)}T00:00:00.000Z`,
      createdAt: nowIso(),
    },
    {
      id: 'demo-book-2',
      title: '三体',
      author: '刘慈欣',
      category: '小说',
      status: 'finished',
      progress: 100,
      notes: [],
      tags: ['小说'],
      rating: 10,
      review: '',
      favorite: false,
      statusHistory: [{ id: 'demo-sh-2', status: 'finished', date: addDays(today, -20) }],
      finishedAt: `${addDays(today, -20)}T00:00:00.000Z`,
      createdAt: nowIso(),
    },
  ];
  const bookStore = useBookStore.getState();
  bookStore.replaceBooks([
    ...bookStore.books.filter((b) => !b.id.startsWith(DEMO_PREFIX)),
    ...demoBooks,
  ]);

  // ---------- 游戏 ----------
  const demoGames: Game[] = [
    {
      id: 'demo-game-1',
      name: '哈迪斯',
      platform: 'PC',
      status: 'playing',
      hoursPlayed: 12.5,
      progress: 40,
      achievements: [{ id: 'demo-ach-1', name: '逃出冥界', description: '第一次通关', unlocked: true }],
      notes: '',
      tags: ['Rogue'],
      rating: 9,
      review: '死了也想再来一把',
      favorite: false,
      statusHistory: [{ id: 'demo-sh-g1', status: 'playing', date: yesterday }],
      createdAt: nowIso(),
    },
  ];
  const demoGameSessions: GameSession[] = [
    {
      id: 'demo-gsession-1',
      gameId: 'demo-game-1',
      date: yesterday,
      hours: 2,
      note: '打到第三层',
      createdAt: nowIso(),
    },
  ];
  const gameStore = useGameStore.getState();
  gameStore.replaceGames([
    ...gameStore.games.filter((g) => !g.id.startsWith(DEMO_PREFIX)),
    ...demoGames,
  ]);
  gameStore.replaceSessions([
    ...gameStore.sessions.filter((session) => !session.id.startsWith(DEMO_PREFIX)),
    ...demoGameSessions,
  ]);

  // ---------- 健身 ----------
  const demoWorkouts: WorkoutRecord[] = [
    {
      id: 'demo-workout-1',
      date: yesterday,
      planName: '推日',
      exercises: [
        { id: 'demo-ex-1', name: '杠铃卧推', sets: 4, reps: 8, weight: 60 },
        { id: 'demo-ex-2', name: '哑铃 shoulder press', sets: 3, reps: 10, weight: 15 },
      ],
      notes: '状态不错',
      tags: [],
      createdAt: nowIso(),
    },
  ];
  const fitnessStore = useFitnessStore.getState();
  fitnessStore.replaceRecords([
    ...fitnessStore.records.filter((r) => !r.id.startsWith(DEMO_PREFIX)),
    ...demoWorkouts,
  ]);

  // ---------- 饮食 ----------
  const demoMeals: MealRecord[] = [
    {
      id: 'demo-meal-1',
      date: today,
      type: 'breakfast',
      items: [{ id: 'demo-food-1', name: '燕麦粥', category: '主食', calories: 320, protein: 12, carbs: 54, fat: 6 }],
      totalCalories: 320,
      totalProtein: 12,
      totalCarbs: 54,
      totalFat: 6,
      tags: [],
    },
    {
      id: 'demo-meal-2',
      date: today,
      type: 'lunch',
      items: [{ id: 'demo-food-2', name: '鸡胸肉饭', category: '蛋白质', calories: 620, protein: 42, carbs: 68, fat: 12 }],
      totalCalories: 620,
      totalProtein: 42,
      totalCarbs: 68,
      totalFat: 12,
      tags: [],
    },
  ];
  const dietStore = useDietStore.getState();
  dietStore.replaceRecords([
    ...dietStore.records.filter((r) => !r.id.startsWith(DEMO_PREFIX)),
    ...demoMeals,
  ]);

  // ---------- 写作 ----------
  const demoWriting: WritingProject[] = [
    {
      id: 'demo-write-1',
      title: '九月复盘',
      type: 'article',
      status: 'in-progress',
      wordCount: 3200,
      notes: '第三部分还差数据',
      content: '这个月最大的变化是……',
      targetWords: 5000,
      snapshots: [],
      tags: ['复盘'],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ];
  const writingStore = useWritingStore.getState();
  writingStore.replaceProjects([
    ...writingStore.projects.filter((p) => !p.id.startsWith(DEMO_PREFIX)),
    ...demoWriting,
  ]);

  // ---------- 开发 ----------
  const demoDev: DevProject[] = [
    {
      id: 'demo-dev-1',
      name: '记账 App',
      description: '个人用的极简记账工具',
      status: 'in-progress',
      tasks: [
        {
          id: 'demo-dtask-1',
          title: '导出 CSV',
          status: 'todo',
          priority: 'medium',
          type: 'feature',
          createdAt: nowIso(),
        },
        {
          id: 'demo-dtask-2',
          title: '修日期越界',
          status: 'done',
          priority: 'high',
          type: 'bug',
          createdAt: nowIso(),
        },
      ],
      hoursSpent: 3.5,
      techStack: ['React'],
      repoUrl: '',
      tags: ['个人项目'],
      archived: false,
      milestones: [{ id: 'demo-ms-1', title: '能用版', done: false, createdAt: nowIso() }],
      logs: [{ id: 'demo-log-1', date: yesterday, content: '搭好骨架', createdAt: nowIso() }],
      createdAt: nowIso(),
    },
  ];
  const devStore = useDevStore.getState();
  devStore.replaceProjects([
    ...devStore.projects.filter((p) => !p.id.startsWith(DEMO_PREFIX)),
    ...demoDev,
  ]);
}

/** 清除示例数据：所有模块里 id 以 demo- 开头的记录全部移除，真实数据不动 */
export function clearDemoData(): void {
  const notDemo = <T extends { id: string }>(items: readonly T[]): T[] =>
    items.filter((item) => !item.id.startsWith(DEMO_PREFIX));

  const taskStore = useTaskStore.getState();
  if (taskStore.tasks.some((t) => t.id.startsWith(DEMO_PREFIX))) {
    taskStore.replaceTasks(notDemo(taskStore.tasks));
  }
  const bookStore = useBookStore.getState();
  if (bookStore.books.some((b) => b.id.startsWith(DEMO_PREFIX))) {
    bookStore.replaceBooks(notDemo(bookStore.books));
  }
  const gameStore = useGameStore.getState();
  if (gameStore.games.some((g) => g.id.startsWith(DEMO_PREFIX))) {
    gameStore.replaceGames(notDemo(gameStore.games));
    gameStore.replaceSessions(notDemo(gameStore.sessions));
  }
  const fitnessStore = useFitnessStore.getState();
  if (fitnessStore.records.some((r) => r.id.startsWith(DEMO_PREFIX))) {
    fitnessStore.replaceRecords(notDemo(fitnessStore.records));
  }
  const dietStore = useDietStore.getState();
  if (dietStore.records.some((r) => r.id.startsWith(DEMO_PREFIX))) {
    dietStore.replaceRecords(notDemo(dietStore.records));
  }
  const writingStore = useWritingStore.getState();
  if (writingStore.projects.some((p) => p.id.startsWith(DEMO_PREFIX))) {
    writingStore.replaceProjects(notDemo(writingStore.projects));
  }
  const devStore = useDevStore.getState();
  if (devStore.projects.some((p) => p.id.startsWith(DEMO_PREFIX))) {
    devStore.replaceProjects(notDemo(devStore.projects));
  }
}

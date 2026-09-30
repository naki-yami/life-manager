import { describe, expect, it } from 'vitest';
import type { BackupData } from './schemas';
import {
  buildBackupEnvelope,
  clearAutoSnapshots,
  createAutoSnapshot,
  DAILY_SNAPSHOT_REASON,
  ensureDailySnapshot,
  listAutoSnapshots,
  mergeById,
  parseBackup,
  planImport,
  planTotals,
  restoreAutoSnapshot,
  serializeBackup,
} from './backup';
import { clearAppData } from '../store/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';

/** 一份覆盖所有模块的完整数据，用于往返测试 */
function sampleData(): BackupData {
  return {
    tasks: [
      {
        id: 'task-1',
        title: '写周报',
        description: '本周进展',
        priority: 'high',
        status: 'completed',
        dueDate: '2026-09-28',
        tags: ['工作', '紧急'],
        subtasks: [
          { id: 'sub-1', title: '收集数据', done: true },
          { id: 'sub-2', title: '写结论', done: false },
        ],
        repeat: { kind: 'weekly', weekdays: [0, 2] },
        timebox: { date: '2026-09-27', start: '09:00', minutes: 90 },
        createdAt: '2026-09-27T01:00:00.000Z',
        completedAt: '2026-09-27T09:00:00.000Z',
      },
    ],
    memos: [{ id: 'memo-1', content: '记得买咖啡豆', createdAt: '2026-09-27T02:00:00.000Z' }],
    books: [
      {
        id: 'book-1',
        title: '维摩诘经',
        author: '佚名',
        category: '佛学',
        status: 'reading',
        progress: 42,
        notes: [{ id: 'note-1', content: '不二法门', createdAt: '2026-09-27T03:00:00.000Z' }],
        tags: ['佛学'],
        rating: 9,
        review: '值得一读再读',
        favorite: true,
        statusHistory: [{ id: 'sh-1', status: 'reading', date: '2026-09-20' }],
        createdAt: '2026-09-20T00:00:00.000Z',
      },
    ],
    devProjects: [
      {
        id: 'dev-1',
        name: 'Life Manager',
        description: '个人管理应用',
        status: 'in-progress',
        tasks: [
          {
            id: 'devtask-1',
            title: '修数据缺陷',
            status: 'done',
            priority: 'high',
            type: 'bug',
            createdAt: '2026-09-27T04:00:00.000Z',
          },
        ],
        milestones: [
          {
            id: 'ms-1',
            title: 'v1.0 发布',
            dueDate: '2026-10-31',
            done: false,
            createdAt: '2026-09-01T00:00:00.000Z',
          },
        ],
        logs: [
          {
            id: 'log-1',
            date: '2026-09-27',
            content: '修完存储层缺陷',
            createdAt: '2026-09-27T18:00:00.000Z',
          },
        ],
        hoursSpent: 12,
        techStack: ['React', 'TypeScript'],
        tags: ['副业'],
        repoUrl: 'https://github.com/example/life-manager',
        startDate: '2026-09-01',
        archived: false,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    workSessions: [
      {
        id: 'work-1',
        projectId: 'dev-1',
        date: '2026-09-27',
        hours: 2.5,
        note: '重构存储层',
        createdAt: '2026-09-27T12:00:00.000Z',
      },
    ],
    writingProjects: [
      {
        id: 'write-1',
        title: '禅与摩托车维修艺术',
        type: 'book',
        status: 'in-progress',
        wordCount: 3200,
        notes: '第三章需要重写',
        tags: ['长文'],
        content: '第一章 良质……',
        targetWords: 50000,
        snapshots: [
          {
            id: 'snap-1',
            wordCount: 3200,
            content: '第一章 良质……',
            createdAt: '2026-09-27T05:00:00.000Z',
          },
        ],
        createdAt: '2026-09-10T00:00:00.000Z',
        updatedAt: '2026-09-27T05:00:00.000Z',
      },
    ],
    fitnessPlans: [
      {
        id: 'plan-1',
        name: '胸肌日',
        description: '推为主',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ],
    fitnessRecords: [
      {
        id: 'record-1',
        date: '2026-09-27',
        planName: '胸肌日',
        exercises: [{ id: 'ex-1', name: '卧推', sets: 4, reps: 8, weight: 60 }],
        notes: '状态不错',
        tags: ['胸'],
        createdAt: '2026-09-27T06:00:00.000Z',
      },
    ],
    dietRecords: [
      {
        id: 'meal-1',
        date: '2026-09-27',
        type: 'lunch',
        items: [
          {
            id: 'food-1',
            name: '鸡胸肉',
            category: '蛋白质',
            calories: 220,
            protein: 40,
            carbs: 0,
            fat: 5,
          },
        ],
        totalCalories: 220,
        totalProtein: 40,
        totalCarbs: 0,
        totalFat: 5,
        tags: ['外食'],
      },
    ],
    games: [
      {
        id: 'game-1',
        name: '艾尔登法环',
        platform: 'PC',
        status: 'playing',
        hoursPlayed: 42,
        progress: 60,
        achievements: [{ id: 'ach-1', name: '初始的艾尔登之王', description: '', unlocked: true }],
        notes: '卡在女武神',
        tags: ['单机'],
        finishedAt: '2026-09-28',
        rating: 10,
        review: '年度最佳',
        favorite: false,
        statusHistory: [{ id: 'sh-g1', status: 'completed', date: '2026-09-28' }],
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    gameSessions: [
      {
        id: 'session-1',
        gameId: 'game-1',
        date: '2026-09-20',
        hours: 3.5,
        note: '打过了女武神',
        createdAt: '2026-09-20T22:00:00.000Z',
      },
    ],
    readingSessions: [
      {
        id: 'read-1',
        bookId: 'book-1',
        date: '2026-09-26',
        minutes: 45,
        note: '读到不二法门',
        createdAt: '2026-09-26T21:00:00.000Z',
      },
    ],
    habits: [
      {
        id: 'habit-1',
        name: '喝水',
        kind: 'count',
        target: 8,
        unit: '杯',
        schedule: { kind: 'daily', timesPerWeek: 1, everyDays: 1 },
        logs: { '2026-09-27': 8, '2026-09-28': 3 },
        createdAt: '2026-09-20T00:00:00.000Z',
      },
    ],
    bodyMetrics: [
      {
        id: 'body-1',
        date: '2026-09-27',
        weight: 70.4,
        bodyFat: 18.2,
        measurements: { waist: 80, chest: 95 },
        createdAt: '2026-09-27T07:00:00.000Z',
      },
    ],
    focusSessions: [
      {
        id: 'focus-1',
        date: '2026-09-27',
        entityId: 'task-1',
        title: '写周报',
        target: 'task',
        mode: 'pomodoro',
        plannedMinutes: 25,
        minutes: 25,
        startedAt: '2026-09-27T08:00:00.000Z',
        endedAt: '2026-09-27T08:25:00.000Z',
        posted: false,
        createdAt: '2026-09-27T08:25:00.000Z',
      },
    ],
    reviews: [
      {
        id: 'review-1',
        period: 'week',
        date: '2026-09-21',
        best: '把存储层收进一个模块',
        blocker: '晚上容易被消息打断',
        next: '把复盘页做完',
        createdAt: '2026-09-27T12:00:00.000Z',
        updatedAt: '2026-09-27T12:00:00.000Z',
      },
    ],
    journal: [
      {
        id: 'journal-1',
        date: '2026-09-29',
        mood: 4,
        tags: ['工作'],
        text: '把日记模块的数据层收干净',
        createdAt: '2026-09-29T13:00:00.000Z',
        updatedAt: '2026-09-29T13:00:00.000Z',
      },
    ],
    goals: [
      {
        id: 'goal-1',
        metric: 'fitness.sessions',
        period: 'week',
        target: 4,
        createdAt: '2026-09-27T12:00:00.000Z',
      },
    ],
    settings: { theme: 'dark' },
    customFoods: [
      {
        id: 'cfood-1',
        name: '妈妈牌红烧肉',
        category: '其他',
        calories: 320,
        protein: 15,
        carbs: 8,
        fat: 26,
        createdAt: '2026-09-29T10:00:00.000Z',
      },
    ],
    customExercises: [],
  };
}

const emptyData = (): BackupData => ({
  tasks: [],
  memos: [],
  books: [],
  devProjects: [],
  workSessions: [],
  writingProjects: [],
  fitnessPlans: [],
  fitnessRecords: [],
  bodyMetrics: [],
  dietRecords: [],
  games: [],
  gameSessions: [],
  readingSessions: [],
  habits: [],
  focusSessions: [],
  reviews: [],
  journal: [],
  goals: [],
  customFoods: [],
  customExercises: [],
});

describe('导出 / 导入 往返', () => {
  it('导出再导入后，每个模块的数据与导出前完全一致', () => {
    const original = sampleData();
    const text = serializeBackup(original, new Date('2026-09-28T00:00:00.000Z'));

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'merge');

    // 这是 P0 的核心回归：旧实现只保留 title 等少数字段，
    // 状态、笔记、成就、时长、嵌套任务全都会丢
    expect(plan.data.tasks).toEqual(original.tasks);
    expect(plan.data.memos).toEqual(original.memos);
    expect(plan.data.books).toEqual(original.books);
    expect(plan.data.devProjects).toEqual(original.devProjects);
    expect(plan.data.workSessions).toEqual(original.workSessions);
    expect(plan.data.writingProjects).toEqual(original.writingProjects);
    expect(plan.data.fitnessPlans).toEqual(original.fitnessPlans);
    expect(plan.data.fitnessRecords).toEqual(original.fitnessRecords);
    expect(plan.data.bodyMetrics).toEqual(original.bodyMetrics);
    expect(plan.data.dietRecords).toEqual(original.dietRecords);
    expect(plan.data.games).toEqual(original.games);
    expect(plan.data.habits).toEqual(original.habits);
    expect(plan.data.focusSessions).toEqual(original.focusSessions);
    expect(plan.data.reviews).toEqual(original.reviews);
    expect(plan.data.journal).toEqual(original.journal);
    expect(plan.data.settings).toEqual(original.settings);
  });

  it('保留了 v1 导入时被吞掉的关键字段', () => {
    const original = sampleData();
    const parsed = parseBackup(serializeBackup(original));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'merge');

    expect(plan.data.tasks?.[0]?.status).toBe('completed');
    expect(plan.data.tasks?.[0]?.completedAt).toBe('2026-09-27T09:00:00.000Z');
    expect(plan.data.books?.[0]?.progress).toBe(42);
    expect(plan.data.books?.[0]?.notes).toHaveLength(1);
    expect(plan.data.devProjects?.[0]?.tasks).toHaveLength(1);
    expect(plan.data.devProjects?.[0]?.hoursSpent).toBe(12);
    expect(plan.data.workSessions?.[0]?.hours).toBe(2.5);
    expect(plan.data.writingProjects?.[0]?.wordCount).toBe(3200);
    expect(plan.data.fitnessRecords).toHaveLength(1);
    expect(plan.data.dietRecords).toHaveLength(1);
    expect(plan.data.games?.[0]?.achievements).toHaveLength(1);
    expect(plan.data.games?.[0]?.hoursPlayed).toBe(42);
  });

  it('信封结构包含 schemaVersion 与 exportedAt', () => {
    const envelope = buildBackupEnvelope(emptyData(), new Date('2026-09-28T00:00:00.000Z'));
    expect(envelope.app).toBe('life-manager');
    expect(envelope.schemaVersion).toBe(19);
    expect(envelope.exportedAt).toBe('2026-09-28T00:00:00.000Z');
  });
});

describe('parseBackup 兼容性与健壮性', () => {
  it('兼容 v1 扁平结构', () => {
    const parsed = parseBackup(
      JSON.stringify({ tasks: [{ id: 't1', title: '旧任务', createdAt: '2026-01-01T00:00:00Z' }] }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.source).toBe('legacy');
    expect(parsed.backup.schemaVersion).toBe(1);
    expect(parsed.backup.modules.tasks).toHaveLength(1);
  });

  it('旧数据缺少的字段用默认值补齐', () => {
    const parsed = parseBackup(JSON.stringify({ books: [{ id: 'b1', title: '只有书名' }] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const book = parsed.backup.modules.books?.[0];
    expect(book?.status).toBe('want-to-read');
    expect(book?.progress).toBe(0);
    expect(book?.notes).toEqual([]);
  });

  it('不是 JSON 时返回明确错误而不是抛出异常', () => {
    const parsed = parseBackup('这不是 json');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors[0]?.message).toContain('JSON');
  });

  it('没有任何已知模块时判定为失败', () => {
    const parsed = parseBackup(JSON.stringify({ foo: 'bar' }));
    expect(parsed.ok).toBe(false);
  });

  it('单条坏数据只丢这一条，其余照常导入', () => {
    const parsed = parseBackup(
      JSON.stringify({
        data: {
          tasks: [
            { id: 'good-1', title: '好数据', createdAt: '2026-01-01T00:00:00Z' },
            { title: '缺少 id 的坏数据' },
          ],
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.modules.tasks).toHaveLength(1);
    expect(parsed.backup.modules.tasks?.[0]?.id).toBe('good-1');
    expect(parsed.backup.warnings).toHaveLength(1);
    expect(parsed.backup.warnings[0]?.path).toBe('tasks[1]');
  });

  it('某个模块整体类型错误时只跳过该模块', () => {
    const parsed = parseBackup(
      JSON.stringify({
        data: {
          tasks: [{ id: 't1', title: '正常', createdAt: '2026-01-01T00:00:00Z' }],
          books: '不是数组',
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.modules.tasks).toHaveLength(1);
    expect(parsed.backup.modules.books).toBeUndefined();
    expect(parsed.backup.warnings[0]?.message).toContain('期望数组');
  });
});

describe('覆盖模式下的数据安全', () => {
  it('备份里缺失的模块保持现状，显式的空数组才代表清空', () => {
    const current = emptyData();
    current.books = [
      {
        id: 'book-1',
        title: '人类简史',
        author: '',
        category: '',
        status: 'reading',
        progress: 10,
        notes: [],
        tags: [],
        rating: 0,
        review: '',
        favorite: false,
        statusHistory: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const plan = planImport(current, { tasks: [] }, 'overwrite');

    // tasks 在备份里是明确的空数组 -> 确实清空
    expect(plan.data.tasks).toEqual([]);
    // books 压根没出现在备份里 -> 不能连它一起抹掉
    expect(plan.data.books).toHaveLength(1);
    expect(plan.data.books![0]!.id).toBe('book-1');
    expect(plan.stats.books).toEqual({ incoming: 0, added: 0, skipped: 0 });
  });
});
describe('游玩记录的导入兼容', () => {
  it('旧备份没有 gameSessions 时该模块视为缺失，覆盖模式也不会清空现有记录', () => {
    const legacy = sampleData() as Record<string, unknown>;
    delete legacy.gameSessions;
    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.modules.gameSessions).toBeUndefined();

    const plan = planImport(
      {
        gameSessions: [
          { id: 'keep', gameId: 'g', date: '2026-01-01', hours: 1, note: '', createdAt: 'x' },
        ],
      },
      parsed.backup.modules,
      'overwrite',
    );
    expect(plan.data.gameSessions).toEqual([
      { id: 'keep', gameId: 'g', date: '2026-01-01', hours: 1, note: '', createdAt: 'x' },
    ]);
  });

  it('新备份里的游玩记录按 id 去重合并', () => {
    const session = {
      id: 'session-1',
      gameId: 'game-1',
      date: '2026-09-20',
      hours: 3.5,
      note: '',
      createdAt: '2026-09-20T22:00:00.000Z',
    };
    const plan = planImport({ gameSessions: [session] }, { gameSessions: [session] }, 'merge');
    expect(plan.data.gameSessions).toHaveLength(1);
    expect(plan.stats.gameSessions).toEqual({ incoming: 1, added: 0, skipped: 1 });
  });
});
describe('工时记录的导入兼容', () => {
  it('旧备份没有 workSessions 时该模块视为缺失，覆盖模式也不会清空现有记录', () => {
    const legacy = sampleData() as Record<string, unknown>;
    delete legacy.workSessions;
    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.modules.workSessions).toBeUndefined();

    const plan = planImport(
      {
        workSessions: [
          { id: 'keep', projectId: 'p', date: '2026-01-01', hours: 1, note: '', createdAt: 'x' },
        ],
      },
      parsed.backup.modules,
      'overwrite',
    );
    expect(plan.data.workSessions).toEqual([
      { id: 'keep', projectId: 'p', date: '2026-01-01', hours: 1, note: '', createdAt: 'x' },
    ]);
  });

  it('旧备份里的项目没有 hoursSpent，导入时补 0', () => {
    const legacy = sampleData() as Record<string, unknown>;
    const projects = legacy.devProjects as Array<Record<string, unknown>>;
    delete projects[0]!.hoursSpent;
    // v5 新增的字段也从旧备份里删掉，验证导入时补默认值
    delete projects[0]!.techStack;
    delete projects[0]!.repoUrl;
    delete projects[0]!.archived;
    delete legacy.workSessions;

    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'overwrite');
    expect(plan.data.devProjects?.[0]?.name).toBe('Life Manager');
    expect(plan.data.devProjects?.[0]?.hoursSpent).toBe(0);
    // v5 新增的字段在旧备份里缺失时补默认值
    expect(plan.data.devProjects?.[0]?.techStack).toEqual([]);
    expect(plan.data.devProjects?.[0]?.repoUrl).toBe('');
    expect(plan.data.devProjects?.[0]?.archived).toBe(false);
  });

  it('旧备份里的任务没有子任务与重复规则，导入时补默认值', () => {
    const legacy = sampleData() as Record<string, unknown>;
    const tasks = legacy.tasks as Array<Record<string, unknown>>;
    delete tasks[0]!.subtasks;
    delete tasks[0]!.repeat;

    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'overwrite');
    expect(plan.data.tasks?.[0]?.subtasks).toEqual([]);
    expect(plan.data.tasks?.[0]?.repeat).toBeNull();
  });

  it('同一份备份重复导入不会产生重复工时', () => {
    const session = {
      id: 'w1',
      projectId: 'p1',
      date: '2026-09-20',
      hours: 2,
      note: '',
      createdAt: '2026-09-20T22:00:00.000Z',
    };
    const plan = planImport({ workSessions: [session] }, { workSessions: [session] }, 'merge');
    expect(plan.data.workSessions).toHaveLength(1);
    expect(plan.stats.workSessions).toEqual({ incoming: 1, added: 0, skipped: 1 });
  });
});

describe('开发项目 v10 字段的导入兼容', () => {
  it('旧备份缺里程碑 / 日志 / 工作项分类时补默认值', () => {
    const legacy = sampleData() as Record<string, unknown>;
    const projects = legacy.devProjects as Array<Record<string, unknown>>;
    const tasks = projects[0]!.tasks as Array<Record<string, unknown>>;
    delete projects[0]!.milestones;
    delete projects[0]!.logs;
    delete tasks[0]!.type;

    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'overwrite');
    expect(plan.data.devProjects?.[0]?.milestones).toEqual([]);
    expect(plan.data.devProjects?.[0]?.logs).toEqual([]);
    expect(plan.data.devProjects?.[0]?.tasks?.[0]?.type).toBe('feature'); // 缺省按「功能」处理
  });
});

describe('统一标签的导入兼容', () => {
  /** 所有带标签的模块；改数据模型时要一起维护 */
  const TAGGED_MODULES = [
    'tasks',
    'books',
    'devProjects',
    'writingProjects',
    'fitnessRecords',
    'dietRecords',
    'games',
  ] as const;

  it('往返后标签原样保留', () => {
    const original = sampleData();
    const parsed = parseBackup(serializeBackup(original));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'merge');
    expect(plan.data.tasks?.[0]?.tags).toEqual(['工作', '紧急']);
    expect(plan.data.books?.[0]?.tags).toEqual(['佛学']);
    expect(plan.data.devProjects?.[0]?.tags).toEqual(['副业']);
    expect(plan.data.writingProjects?.[0]?.tags).toEqual(['长文']);
    expect(plan.data.fitnessRecords?.[0]?.tags).toEqual(['胸']);
    expect(plan.data.dietRecords?.[0]?.tags).toEqual(['外食']);
    expect(plan.data.games?.[0]?.tags).toEqual(['单机']);
  });

  it('旧备份里没有 tags 的实体，导入时补空数组', () => {
    const legacy = sampleData() as Record<string, unknown>;
    for (const module of TAGGED_MODULES) {
      const items = legacy[module] as Array<Record<string, unknown>>;
      delete items[0]!.tags;
    }

    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'overwrite');
    expect(plan.data.tasks?.[0]?.tags).toEqual([]);
    expect(plan.data.books?.[0]?.tags).toEqual([]);
    expect(plan.data.devProjects?.[0]?.tags).toEqual([]);
    expect(plan.data.writingProjects?.[0]?.tags).toEqual([]);
    expect(plan.data.fitnessRecords?.[0]?.tags).toEqual([]);
    expect(plan.data.dietRecords?.[0]?.tags).toEqual([]);
    expect(plan.data.games?.[0]?.tags).toEqual([]);
  });

  it('标签进 store 之前会被清洗：去 # 前缀、忽略大小写去重、丢弃空值', () => {
    const legacy = sampleData() as Record<string, unknown>;
    const tasks = legacy.tasks as Array<Record<string, unknown>>;
    tasks[0]!.tags = ['#工作', '工作', '   ', 'Work', 'work', '工作'];

    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'overwrite');
    expect(plan.data.tasks?.[0]?.tags).toEqual(['工作', 'Work']);
  });
});

describe('阅读记录的导入兼容', () => {
  it('旧备份没有 readingSessions 时该模块视为缺失，覆盖模式也不会清空现有记录', () => {
    const legacy = sampleData() as Record<string, unknown>;
    delete legacy.readingSessions;
    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.modules.readingSessions).toBeUndefined();

    const plan = planImport(
      {
        readingSessions: [
          { id: 'keep', bookId: 'b', date: '2026-01-01', minutes: 30, note: '', createdAt: 'x' },
        ],
      },
      parsed.backup.modules,
      'overwrite',
    );
    expect(plan.data.readingSessions).toEqual([
      { id: 'keep', bookId: 'b', date: '2026-01-01', minutes: 30, note: '', createdAt: 'x' },
    ]);
  });
});

describe('习惯的导入兼容', () => {
  const keptHabit = {
    id: 'keep',
    name: '晨跑',
    kind: 'binary' as const,
    target: 1,
    unit: '',
    schedule: { kind: 'daily' as const, timesPerWeek: 1, everyDays: 1 },
    logs: {},
    createdAt: '2026-09-01T00:00:00.000Z',
  };

  it('旧备份没有 habits 时该模块视为缺失，覆盖模式也不会清空现有习惯', () => {
    const legacy = sampleData() as Record<string, unknown>;
    delete legacy.habits;
    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.modules.habits).toBeUndefined();

    const plan = planImport({ habits: [keptHabit] }, parsed.backup.modules, 'overwrite');
    expect(plan.data.habits).toEqual([keptHabit]);
  });

  it('打卡日志里的脏值在导入时被清洗，合法记录照常保留', () => {
    const backup = sampleData();
    backup.habits[0]!.logs = { '2026-09-28': 3, '2026-09-27': 0, '2026/09/26': 5 };

    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'merge');
    expect(plan.data.habits?.[0]?.logs).toEqual({ '2026-09-28': 3 });
  });
});

describe('身体指标的导入兼容', () => {
  const keptMetric = {
    id: 'keep',
    date: '2026-09-01',
    weight: 70,
    measurements: {},
    createdAt: '2026-09-01T07:00:00.000Z',
  };

  it('旧备份没有 bodyMetrics 时该模块视为缺失，覆盖模式也不会清空现有记录', () => {
    const legacy = sampleData() as Record<string, unknown>;
    delete legacy.bodyMetrics;
    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.modules.bodyMetrics).toBeUndefined();

    const plan = planImport({ bodyMetrics: [keptMetric] }, parsed.backup.modules, 'overwrite');
    expect(plan.data.bodyMetrics).toEqual([keptMetric]);
  });

  it('脏读数在导入时被清洗到「没记」，坏日期的记录整条丢弃', () => {
    const backup = sampleData();
    // 故意塞脏数据：NaN 体重、超 100 的体脂、混了字符串的围度表、坏日期
    backup.bodyMetrics = [
      {
        id: 'body-1',
        date: '2026-09-27',
        weight: Number.NaN,
        bodyFat: 150,
        measurements: { waist: 80.44, bad: 'x' },
        createdAt: '2026-09-27T07:00:00.000Z',
      },
      {
        id: 'body-2',
        date: '2026/09/26',
        weight: 70,
        measurements: {},
        createdAt: '2026-09-26T07:00:00.000Z',
      },
    ] as unknown as typeof backup.bodyMetrics;

    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'merge');
    expect(plan.data.bodyMetrics).toHaveLength(1);
    expect(plan.data.bodyMetrics?.[0]).toMatchObject({
      id: 'body-1',
      bodyFat: 100,
      measurements: { waist: 80.4 },
    });
    expect(plan.data.bodyMetrics?.[0]?.weight).toBeUndefined();
  });
});

describe('专注记录与时间盒的导入兼容', () => {
  const keptSession = {
    id: 'keep',
    date: '2026-09-01',
    entityId: 'task-1',
    title: '写周报',
    target: 'task' as const,
    mode: 'pomodoro' as const,
    plannedMinutes: 25,
    minutes: 25,
    startedAt: '2026-09-01T08:00:00.000Z',
    endedAt: '2026-09-01T08:25:00.000Z',
    posted: false,
    createdAt: '2026-09-01T08:25:00.000Z',
  };

  it('旧备份没有 focusSessions 时该模块视为缺失，覆盖模式也不会清空现有记录', () => {
    const legacy = sampleData() as Record<string, unknown>;
    delete legacy.focusSessions;
    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.modules.focusSessions).toBeUndefined();

    const plan = planImport({ focusSessions: [keptSession] }, parsed.backup.modules, 'overwrite');
    expect(plan.data.focusSessions).toEqual([keptSession]);
  });

  it('时间盒往返后原样保留；坏时间盒退回「没排」而不是画一个假盒子', () => {
    const backup = sampleData();
    expect(backup.tasks[0]?.timebox).toEqual({ date: '2026-09-27', start: '09:00', minutes: 90 });

    const dirty = sampleData() as unknown as { tasks: Record<string, unknown>[] };
    dirty.tasks[0]!.timebox = { date: '2026-09-27', start: '25:00', minutes: 90 };

    const parsed = parseBackup(JSON.stringify(dirty));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'overwrite');
    expect(plan.data.tasks?.[0]?.timebox).toBeNull();
  });

  it('旧任务没有 timebox 字段时补成 null，页面不必再写 ?? null', () => {
    const legacy = sampleData() as unknown as { tasks: Record<string, unknown>[] };
    delete legacy.tasks[0]!.timebox;

    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'merge');
    expect(plan.data.tasks?.[0]?.timebox).toBeNull();
  });

  it('时长越界的专注记录被收敛到 1 – 600 分钟', () => {
    const backup = sampleData() as unknown as { focusSessions: Record<string, unknown>[] };
    backup.focusSessions = [{ ...keptSession, minutes: 0, plannedMinutes: 9999 }];

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'merge');
    expect(plan.data.focusSessions).toHaveLength(1);
    expect(plan.data.focusSessions?.[0]).toMatchObject({
      id: 'keep',
      // plannedMinutes 超出上限：catch 到默认的 25 分钟，而不是夹成 600
      plannedMinutes: 25,
      minutes: 1,
    });
  });

  it('结构坏掉的专注记录整条丢弃，不写进 store', () => {
    const backup = sampleData() as unknown as { focusSessions: Record<string, unknown>[] };
    backup.focusSessions = [{ ...keptSession, target: 'telepathy' }];

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'merge');
    expect(plan.data.focusSessions).toEqual([]);
    expect(plan.stats.focusSessions.skipped).toBe(0);
  });
});

describe('复盘的导入兼容', () => {
  const keptReview = {
    id: 'keep',
    period: 'week' as const,
    date: '2026-09-21',
    best: '把复盘页收尾',
    blocker: '',
    next: '',
    createdAt: '2026-09-27T12:00:00.000Z',
    updatedAt: '2026-09-27T12:00:00.000Z',
  };

  it('旧备份没有 reviews 时该模块视为缺失，覆盖模式也不会清空现有复盘', () => {
    const legacy = sampleData() as Record<string, unknown>;
    delete legacy.reviews;

    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.modules.reviews).toBeUndefined();

    const plan = planImport({ reviews: [keptReview] }, parsed.backup.modules, 'overwrite');
    expect(plan.data.reviews).toEqual([keptReview]);
  });

  it('复盘三问缺字段时补空串，其余内容照常保留', () => {
    const backup = sampleData() as unknown as { reviews: Record<string, unknown>[] };
    delete backup.reviews[0]!.blocker;

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'merge');
    expect(plan.data.reviews?.[0]).toMatchObject({
      id: 'review-1',
      blocker: '',
      next: '把复盘页做完',
    });
  });

  it('旧备份没有 period 字段时补成「每周复盘」，不会整条丢弃', () => {
    const backup = sampleData() as unknown as { reviews: Record<string, unknown>[] };
    delete backup.reviews[0]!.period;

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'merge');
    expect(plan.data.reviews?.[0]).toMatchObject({ id: 'review-1', period: 'week' });
  });

  it('周期取值不在枚举里时整条丢弃，并留下解析警告', () => {
    const backup = sampleData() as unknown as { reviews: Record<string, unknown>[] };
    backup.reviews[0]!.period = 'month';

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.modules.reviews).toEqual([]);
    expect(parsed.backup.warnings.some((issue) => issue.path.startsWith('reviews'))).toBe(true);
  });
});

describe('目标的导入兼容', () => {
  const keptGoal = {
    id: 'keep-goal',
    metric: 'fitness.sessions' as const,
    period: 'week' as const,
    target: 4,
    createdAt: '2026-09-27T12:00:00.000Z',
  };

  it('旧备份没有 goals 时该模块视为缺失，覆盖模式也不会清空现有目标', () => {
    const legacy = sampleData() as Record<string, unknown>;
    delete legacy.goals;

    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.modules.goals).toBeUndefined();

    const plan = planImport({ goals: [keptGoal] }, parsed.backup.modules, 'overwrite');
    expect(plan.data.goals).toEqual([keptGoal]);
  });

  it('缺周期与创建时间时补默认值，指标与目标值照常保留', () => {
    const backup = sampleData() as unknown as { goals: Record<string, unknown>[] };
    delete backup.goals[0]!.period;
    delete backup.goals[0]!.createdAt;

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'merge');
    expect(plan.data.goals?.[0]).toMatchObject({
      id: 'goal-1',
      metric: 'fitness.sessions',
      period: 'week',
      target: 4,
    });
    expect(plan.data.goals?.[0]?.createdAt).toBeTruthy();
  });

  it('指标不在枚举里时整条丢弃，并留下解析警告', () => {
    const backup = sampleData() as unknown as { goals: Record<string, unknown>[] };
    backup.goals[0]!.metric = 'diet.averageCalories';

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.modules.goals).toEqual([]);
    expect(parsed.backup.warnings.some((issue) => issue.path.startsWith('goals'))).toBe(true);
  });
});

describe('导入模式', () => {
  const existing = [{ id: 'a', title: '现有' }];

  it('merge：跳过已存在的 id，不产生重复', () => {
    const outcome = mergeById(
      existing,
      [
        { id: 'a', title: '重复' },
        { id: 'b', title: '新增' },
      ],
      'merge',
    );
    expect(outcome.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(outcome.added).toBe(1);
    expect(outcome.skipped).toBe(1);
  });

  it('append：id 冲突时重新分配 id，两条都保留', () => {
    const outcome = mergeById(existing, [{ id: 'a', title: '同名' }], 'append', () => 'fresh-id');
    expect(outcome.items).toHaveLength(2);
    expect(outcome.items[1]?.id).toBe('fresh-id');
    expect(outcome.items[1]?.title).toBe('同名');
    expect(outcome.skipped).toBe(0);
  });

  it('overwrite：完全替换现有数据', () => {
    const outcome = mergeById(existing, [{ id: 'z', title: '替换' }], 'overwrite');
    expect(outcome.items.map((i) => i.id)).toEqual(['z']);
  });

  it('重复导入同一份备份不会让数据翻倍（merge 幂等）', () => {
    const original = sampleData();
    const parsed = parseBackup(serializeBackup(original));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const first = planImport(emptyData(), parsed.backup.modules, 'merge');
    const second = planImport(first.data, parsed.backup.modules, 'merge');

    expect(second.data.tasks).toHaveLength(original.tasks.length);
    expect(second.data.books).toHaveLength(original.books.length);
    expect(planTotals(second.stats).added).toBe(0);
    expect(planTotals(second.stats).skipped).toBe(planTotals(first.stats).incoming);
  });

  it('预览统计与实际写入一致', () => {
    const original = sampleData();
    const parsed = parseBackup(serializeBackup(original));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const plan = planImport(emptyData(), parsed.backup.modules, 'merge');
    const totals = planTotals(plan.stats);
    const actual = [
      plan.data.tasks,
      plan.data.memos,
      plan.data.books,
      plan.data.devProjects,
      plan.data.workSessions,
      plan.data.writingProjects,
      plan.data.fitnessPlans,
      plan.data.fitnessRecords,
      plan.data.bodyMetrics,
      plan.data.dietRecords,
      plan.data.games,
      plan.data.gameSessions,
      plan.data.readingSessions,
      plan.data.habits,
      plan.data.focusSessions,
      plan.data.reviews,
      plan.data.journal,
      plan.data.goals,
      plan.data.customFoods,
      plan.data.customExercises,
    ].reduce((sum, list) => sum + (list?.length ?? 0), 0);

    expect(totals.added).toBe(actual);
  });
});

describe('自动备份快照', () => {
  it('创建快照后可以列出，恢复时把数据写回本应用的 key', async () => {
    localStorage.clear();
    localStorage.setItem('lm:tasks', '{"state":{"tasks":[]},"version":3}');
    const key = await createAutoSnapshot('测试前');
    expect(key).not.toBeNull();

    localStorage.setItem('lm:tasks', '{"state":{"tasks":[{"id":"x"}]},"version":3}');

    const snapshots = await listAutoSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.reason).toBe('测试前');

    expect(await restoreAutoSnapshot(key!)).toBe(true);
    expect(localStorage.getItem('lm:tasks')).toBe('{"state":{"tasks":[]},"version":3}');
  });

  it('clearAutoSnapshots 会删掉全部快照，且不动普通数据', async () => {
    localStorage.clear();
    localStorage.setItem('lm:books', '{"state":{"books":[]},"version":3}');
    await createAutoSnapshot('一');
    await createAutoSnapshot('二');
    expect(await listAutoSnapshots()).toHaveLength(2);

    const removed = await clearAutoSnapshots();

    expect(removed).toHaveLength(2);
    expect(await listAutoSnapshots()).toHaveLength(0);
    expect(localStorage.getItem('lm:books')).not.toBeNull();
  });

  it('清除全部数据后，能从快照把数据完整恢复回来', async () => {
    localStorage.clear();
    // 走一遍真实链路：数据落盘 → 留快照 → 清除数据 → 回滚
    localStorage.setItem(
      STORAGE_KEYS.tasks,
      JSON.stringify({ state: { tasks: [{ id: 't1', title: '写周报' }], memos: [] }, version: 11 }),
    );
    localStorage.setItem(
      STORAGE_KEYS.books,
      JSON.stringify({ state: { books: [{ id: 'b1', title: '人类简史' }] }, version: 11 }),
    );
    const before = {
      tasks: localStorage.getItem(STORAGE_KEYS.tasks),
      books: localStorage.getItem(STORAGE_KEYS.books),
    };

    const key = await createAutoSnapshot('清除所有数据前');
    expect(key).not.toBeNull();

    // 「清除数据」会删掉 lm:* 的普通 key，但快照必须留着 —— 否则就没得回滚了
    await clearAppData();
    expect(localStorage.getItem(STORAGE_KEYS.tasks)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.books)).toBeNull();
    expect(await listAutoSnapshots()).toHaveLength(1);

    expect(await restoreAutoSnapshot(key!)).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.tasks)).toBe(before.tasks);
    expect(localStorage.getItem(STORAGE_KEYS.books)).toBe(before.books);
  });

  it('快照损坏时恢复会失败而不是抛错', async () => {
    localStorage.clear();
    localStorage.setItem('lm:backup:auto:broken', 'not-json');
    expect(await restoreAutoSnapshot('lm:backup:auto:broken')).toBe(false);
  });
});

describe('每日自动备份', () => {
  const seedTasks = (): void => {
    localStorage.setItem(
      STORAGE_KEYS.tasks,
      JSON.stringify({ state: { tasks: [{ id: 't1' }], memos: [] }, version: 11 }),
    );
  };

  it('有数据时每天第一次打开会留一份快照', async () => {
    localStorage.clear();
    seedTasks();

    const key = await ensureDailySnapshot();

    expect(key).not.toBeNull();
    const snapshots = await listAutoSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.reason).toBe(DAILY_SNAPSHOT_REASON);
  });

  it('同一天再打开不会重复创建', async () => {
    localStorage.clear();
    seedTasks();

    expect(await ensureDailySnapshot()).not.toBeNull();
    expect(await ensureDailySnapshot()).toBeNull();
    expect(await listAutoSnapshots()).toHaveLength(1);
  });

  it('跨到第二天会再留一份', async () => {
    localStorage.clear();
    seedTasks();

    await ensureDailySnapshot();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(await ensureDailySnapshot(tomorrow)).not.toBeNull();
    expect(await listAutoSnapshots()).toHaveLength(2);
  });

  it('空库不占快照位', async () => {
    localStorage.clear();
    localStorage.setItem(
      STORAGE_KEYS.tasks,
      JSON.stringify({ state: { tasks: [], memos: [] }, version: 11 }),
    );

    expect(await ensureDailySnapshot()).toBeNull();
    expect(await listAutoSnapshots()).toHaveLength(0);
  });

  it('数据整个坏掉时不会抛错', async () => {
    localStorage.clear();
    localStorage.setItem(STORAGE_KEYS.tasks, 'not-json');

    await expect(ensureDailySnapshot()).resolves.toBeNull();
  });
});

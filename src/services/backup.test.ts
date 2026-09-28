import { describe, expect, it } from 'vitest';
import type { BackupData } from './schemas';
import {
  buildBackupEnvelope,
  clearAutoSnapshots,
  createAutoSnapshot,
  listAutoSnapshots,
  mergeById,
  parseBackup,
  planImport,
  planTotals,
  restoreAutoSnapshot,
  serializeBackup,
} from './backup';

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
        subtasks: [
          { id: 'sub-1', title: '收集数据', done: true },
          { id: 'sub-2', title: '写结论', done: false },
        ],
        repeat: { kind: 'weekly', weekdays: [0, 2] },
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
            createdAt: '2026-09-27T04:00:00.000Z',
          },
        ],
        hoursSpent: 12,
        techStack: ['React', 'TypeScript'],
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
        createdAt: '2026-09-27T06:00:00.000Z',
      },
    ],
    dietRecords: [
      {
        id: 'meal-1',
        date: '2026-09-27',
        type: 'lunch',
        items: [{ id: 'food-1', name: '鸡胸肉', category: '蛋白质', calories: 220 }],
        totalCalories: 220,
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
    settings: { theme: 'dark' },
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
  dietRecords: [],
  games: [],
  gameSessions: [],
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
    expect(plan.data.dietRecords).toEqual(original.dietRecords);
    expect(plan.data.games).toEqual(original.games);
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
    expect(envelope.schemaVersion).toBe(6);
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
      plan.data.dietRecords,
      plan.data.games,
      plan.data.gameSessions,
    ].reduce((sum, list) => sum + (list?.length ?? 0), 0);

    expect(totals.added).toBe(actual);
  });
});

describe('自动备份快照', () => {
  it('创建快照后可以列出，恢复时把数据写回本应用的 key', () => {
    localStorage.clear();
    localStorage.setItem('lm:tasks', '{"state":{"tasks":[]},"version":3}');
    const key = createAutoSnapshot('测试前');
    expect(key).not.toBeNull();

    localStorage.setItem('lm:tasks', '{"state":{"tasks":[{"id":"x"}]},"version":3}');

    const snapshots = listAutoSnapshots();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.reason).toBe('测试前');

    expect(restoreAutoSnapshot(key!)).toBe(true);
    expect(localStorage.getItem('lm:tasks')).toBe('{"state":{"tasks":[]},"version":3}');
  });

  it('clearAutoSnapshots 会删掉全部快照，且不动普通数据', () => {
    localStorage.clear();
    localStorage.setItem('lm:books', '{"state":{"books":[]},"version":3}');
    createAutoSnapshot('一');
    createAutoSnapshot('二');
    expect(listAutoSnapshots()).toHaveLength(2);

    const removed = clearAutoSnapshots();

    expect(removed).toHaveLength(2);
    expect(listAutoSnapshots()).toHaveLength(0);
    expect(localStorage.getItem('lm:books')).not.toBeNull();
  });

  it('快照损坏时恢复会失败而不是抛错', () => {
    localStorage.clear();
    localStorage.setItem('lm:backup:auto:broken', 'not-json');
    expect(restoreAutoSnapshot('lm:backup:auto:broken')).toBe(false);
  });
});

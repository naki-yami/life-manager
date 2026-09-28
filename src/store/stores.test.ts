import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from './taskStore';
import { useBookStore } from './bookStore';
import { useGameStore } from './gameStore';
import { useDietStore } from './dietStore';
import { useFitnessStore } from './fitnessStore';
import { useThemeStore } from './themeStore';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { migrateState, STORE_VERSION } from './persist';

beforeEach(async () => {
  localStorage.clear();
  useTaskStore.setState({ tasks: [], memos: [] });
  useBookStore.setState({ books: [] });
  useGameStore.setState({ games: [], sessions: [] });
  useDietStore.setState({ records: [] });
  useFitnessStore.setState({ plans: [], records: [] });
  useThemeStore.setState({ themeMode: 'light' });
});

describe('taskStore', () => {
  it('增删改查与完成状态切换', () => {
    const store = useTaskStore.getState();
    store.addTask('写周报', '本周进展', 'high', '2026-09-28');

    const created = useTaskStore.getState().tasks[0]!;
    expect(created.title).toBe('写周报');
    expect(created.status).toBe('pending');
    expect(created.completedAt).toBeUndefined();

    useTaskStore.getState().toggleTaskStatus(created.id);
    const done = useTaskStore.getState().tasks[0]!;
    expect(done.status).toBe('completed');
    expect(done.completedAt).toBeDefined();

    useTaskStore.getState().toggleTaskStatus(created.id);
    expect(useTaskStore.getState().tasks[0]!.completedAt).toBeUndefined();

    useTaskStore.getState().updateTask(created.id, { title: '写月报' });
    expect(useTaskStore.getState().tasks[0]!.title).toBe('写月报');

    useTaskStore.getState().deleteTask(created.id);
    expect(useTaskStore.getState().tasks).toHaveLength(0);
  });

  it('生成的 id 互不重复', () => {
    const { addTask } = useTaskStore.getState();
    for (let i = 0; i < 50; i += 1) addTask(`任务 ${i}`, '', 'low', '');
    const ids = useTaskStore.getState().tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(50);
  });

  it('replaceTasks 整对象写入，保留状态与时间戳', () => {
    useTaskStore.getState().replaceTasks([
      {
        id: 'fixed-id',
        title: '导入的任务',
        description: 'd',
        priority: 'medium',
        status: 'completed',
        dueDate: '2026-09-28',
        createdAt: '2026-09-01T00:00:00.000Z',
        completedAt: '2026-09-02T00:00:00.000Z',
      },
    ]);

    const task = useTaskStore.getState().tasks[0]!;
    expect(task.id).toBe('fixed-id');
    expect(task.status).toBe('completed');
    expect(task.completedAt).toBe('2026-09-02T00:00:00.000Z');
  });
});

describe('持久化 key', () => {
  it('写入 lm: 前缀的 key，且不再使用旧的 tasks-storage', () => {
    useTaskStore.getState().addTask('任务', '', 'low', '');

    const raw = localStorage.getItem(STORAGE_KEYS.tasks);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).state.tasks).toHaveLength(1);
    expect(localStorage.getItem('tasks-storage')).toBeNull();
  });

  it('各 store 使用各自独立的 key', () => {
    useBookStore.getState().addBook('书名', '作者', '分类');
    useThemeStore.getState().setTheme('dark');

    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.books)!).state.books).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.theme)!).state.themeMode).toBe('dark');
  });
});

describe('版本迁移', () => {
  it('读到 v1 旧数据（version 0）时保留数据而不是丢弃', async () => {
    localStorage.setItem(
      STORAGE_KEYS.tasks,
      JSON.stringify({
        state: {
          tasks: [
            {
              id: 'legacy-1',
              title: '旧任务',
              description: '',
              priority: 'high',
              status: 'completed',
              dueDate: '',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          memos: [],
        },
        version: 0,
      }),
    );

    await useTaskStore.persist.rehydrate();

    expect(useTaskStore.getState().tasks).toHaveLength(1);
    expect(useTaskStore.getState().tasks[0]!.id).toBe('legacy-1');
    expect(useTaskStore.getState().tasks[0]!.status).toBe('completed');
  });

  it('数据损坏时退回默认值，不抛异常也不白屏', async () => {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify({ state: 'oops', version: 0 }));

    await useTaskStore.persist.rehydrate();

    expect(useTaskStore.getState().tasks).toEqual([]);
  });

  it('migrateState 忽略 undefined，不用空值覆盖默认值', () => {
    const result = migrateState(
      { tasks: undefined, memos: [{ id: 'm' }] },
      {
        tasks: [],
        memos: [],
      },
    );
    expect(result.tasks).toEqual([]);
    expect(result.memos).toHaveLength(1);
  });

  it('migrateState 保留未知字段，便于回退', () => {
    const result = migrateState({ tasks: [], futureField: 'keep' }, { tasks: [] });
    expect(result).toEqual({ tasks: [], futureField: 'keep' });
  });

  it('当前版本号是 4', () => {
    expect(STORE_VERSION).toBe(4);
  });
});

describe('其它 store', () => {
  it('bookStore：进度与笔记', () => {
    useBookStore.getState().addBook('维摩诘经', '佚名', '佛学');
    const book = useBookStore.getState().books[0]!;

    useBookStore.getState().updateProgress(book.id, 42);
    useBookStore.getState().addNote(book.id, '不二法门');

    const updated = useBookStore.getState().books[0]!;
    expect(updated.progress).toBe(42);
    expect(updated.notes).toHaveLength(1);
    expect(updated.notes[0]!.content).toBe('不二法门');
  });

  it('dietStore：自动汇总热量', () => {
    useDietStore.getState().addRecord('2026-09-28', 'lunch', [
      { name: '鸡胸肉', category: '蛋白质', calories: 220 },
      { name: '米饭', category: '主食', calories: 230 },
    ]);

    const record = useDietStore.getState().records[0]!;
    expect(record.totalCalories).toBe(450);
    expect(record.items.every((item) => Boolean(item.id))).toBe(true);
    expect(useDietStore.getState().getRecordsByDate('2026-09-28')).toHaveLength(1);
    expect(useDietStore.getState().getRecordsByDate('2026-09-29')).toHaveLength(0);
  });

  it('gameStore：成就解锁切换', () => {
    useGameStore.getState().addGame('艾尔登法环', 'PC');
    const game = useGameStore.getState().games[0]!;

    useGameStore.getState().addAchievement(game.id, '初始的艾尔登之王', '');
    const achievement = useGameStore.getState().games[0]!.achievements[0]!;
    expect(achievement.unlocked).toBe(false);

    useGameStore.getState().toggleAchievement(game.id, achievement.id);
    expect(useGameStore.getState().games[0]!.achievements[0]!.unlocked).toBe(true);
  });

  it('fitnessStore：replaceRecords 整体替换', () => {
    useFitnessStore.getState().addRecord('胸肌日', '2026-09-27', [], '');
    expect(useFitnessStore.getState().records).toHaveLength(1);

    useFitnessStore.getState().replaceRecords([]);
    expect(useFitnessStore.getState().records).toHaveLength(0);
  });
});

describe('旧版数据迁移（端到端）', () => {
  it('v1 旧 key 中的数据在 store 初始化时已被迁移，用户数据不丢', async () => {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem(
      'tasks-storage',
      JSON.stringify({
        state: {
          tasks: [
            {
              id: 'old-task',
              title: '旧版留下的任务',
              description: '',
              priority: 'high',
              status: 'completed',
              dueDate: '',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          memos: [{ id: 'old-memo', content: '旧备忘', createdAt: '2026-01-01T00:00:00.000Z' }],
        },
        version: 0,
      }),
    );
    localStorage.setItem(
      'books-storage',
      JSON.stringify({
        state: {
          books: [
            {
              id: 'old-book',
              title: '旧版在读的书',
              author: '',
              category: '',
              status: 'reading',
              progress: 42,
              notes: [{ id: 'old-note', content: '旧笔记', createdAt: '2026-01-01T00:00:00.000Z' }],
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
        version: 0,
      }),
    );

    // 模拟真实的启动顺序：全新的模块图 -> 加载 store
    const freshTaskStore = (await import('./taskStore')).useTaskStore;
    const freshBookStore = (await import('./bookStore')).useBookStore;

    expect(freshTaskStore.getState().tasks).toHaveLength(1);
    expect(freshTaskStore.getState().tasks[0]!.id).toBe('old-task');
    expect(freshTaskStore.getState().tasks[0]!.status).toBe('completed');
    expect(freshTaskStore.getState().memos).toHaveLength(1);
    expect(freshBookStore.getState().books[0]!.progress).toBe(42);
    expect(freshBookStore.getState().books[0]!.notes).toHaveLength(1);

    // 旧 key 保留作为兜底，不删除
    expect(localStorage.getItem('tasks-storage')).not.toBeNull();
  });
});
describe('bookStore 读完时间', () => {
  it('标记已读时写入 finishedAt，重复标记不覆盖', () => {
    useBookStore.getState().addBook('人类简史', '赫拉利', '历史');
    const id = useBookStore.getState().books[0]!.id;
    expect(useBookStore.getState().books[0]!.finishedAt).toBeUndefined();

    useBookStore.getState().updateBookStatus(id, 'finished');
    const first = useBookStore.getState().books[0]!.finishedAt;
    expect(first).toBeDefined();

    useBookStore.getState().updateBookStatus(id, 'finished');
    expect(useBookStore.getState().books[0]!.finishedAt).toBe(first);
  });

  it('从「已读」改回其它状态会清空 finishedAt，避免统计到没读完的书', () => {
    useBookStore.getState().addBook('人类简史', '赫拉利', '历史');
    const id = useBookStore.getState().books[0]!.id;
    useBookStore.getState().updateBookStatus(id, 'finished');
    useBookStore.getState().updateBookStatus(id, 'reading');

    expect(useBookStore.getState().books[0]!.finishedAt).toBeUndefined();
    expect(useBookStore.getState().books[0]!.status).toBe('reading');
  });
});

describe('gameStore 游玩流水', () => {
  const addGame = (name = '黑神话'): string => {
    useGameStore.getState().addGame(name, 'PC');
    return useGameStore.getState().games.find((game) => game.name === name)!.id;
  };

  it('记一次游玩会同时写流水并累加到总时长', () => {
    const id = addGame();

    useGameStore.getState().addSession(id, '2026-09-28', 2.5, '打完第一章');

    const session = useGameStore.getState().sessions[0]!;
    expect(session.gameId).toBe(id);
    expect(session.date).toBe('2026-09-28');
    expect(session.hours).toBe(2.5);
    expect(session.note).toBe('打完第一章');
    expect(useGameStore.getState().games[0]!.hoursPlayed).toBe(2.5);

    useGameStore.getState().addSession(id, '2026-09-29', 1.5, '');
    expect(useGameStore.getState().games[0]!.hoursPlayed).toBe(4);
    expect(useGameStore.getState().sessions).toHaveLength(2);
  });

  it('删流水会把时长减回去，且不会变成负数', () => {
    const id = addGame();
    useGameStore.getState().addSession(id, '2026-09-28', 2, '');
    const sessionId = useGameStore.getState().sessions[0]!.id;

    useGameStore.getState().deleteSession(sessionId);

    expect(useGameStore.getState().sessions).toHaveLength(0);
    expect(useGameStore.getState().games[0]!.hoursPlayed).toBe(0);

    // 手动把总时长调小后再删，不能出现负数
    useGameStore.getState().addSession(id, '2026-09-28', 3, '');
    useGameStore.getState().updateHoursPlayed(id, 1);
    useGameStore.getState().deleteSession(useGameStore.getState().sessions[0]!.id);
    expect(useGameStore.getState().games[0]!.hoursPlayed).toBe(0);
  });

  it('删掉不存在的流水时原样返回，不会误改总时长', () => {
    const id = addGame();
    useGameStore.getState().addSession(id, '2026-09-28', 2, '');

    useGameStore.getState().deleteSession('not-exist');

    expect(useGameStore.getState().sessions).toHaveLength(1);
    expect(useGameStore.getState().games[0]!.hoursPlayed).toBe(2);
  });

  it('replaceSessions 用于导入与撤销', () => {
    useGameStore
      .getState()
      .replaceSessions([
        { id: 's1', gameId: 'g1', date: '2026-09-01', hours: 1, note: '', createdAt: 'x' },
      ]);
    expect(useGameStore.getState().sessions).toHaveLength(1);
    useGameStore.getState().replaceSessions([]);
    expect(useGameStore.getState().sessions).toHaveLength(0);
  });
});

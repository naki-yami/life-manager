import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from './taskStore';
import { useBookStore } from './bookStore';
import { useGameStore } from './gameStore';
import { useDietStore } from './dietStore';
import { useFitnessStore } from './fitnessStore';
import { useWritingStore } from './writingStore';
import { useDevStore } from './devStore';
import { useThemeStore } from './themeStore';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { migrateState, STORE_VERSION } from './persist';
import { todayKey } from '../utils/date';

beforeEach(async () => {
  localStorage.clear();
  useTaskStore.setState({ tasks: [], memos: [] });
  useBookStore.setState({ books: [] });
  useGameStore.setState({ games: [], sessions: [] });
  useDietStore.setState({ records: [] });
  useFitnessStore.setState({ plans: [], records: [] });
  useDevStore.setState({ projects: [], sessions: [] });
  // writingStore 之前漏了重置：两条写作用例共用 projects[0]，其实是同一条记录被反复改
  useWritingStore.setState({ projects: [] });
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
        subtasks: [],
        repeat: null,
        timebox: null,
        tags: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        completedAt: '2026-09-02T00:00:00.000Z',
      },
    ]);

    const task = useTaskStore.getState().tasks[0]!;
    expect(task.id).toBe('fixed-id');
    expect(task.status).toBe('completed');
    expect(task.completedAt).toBe('2026-09-02T00:00:00.000Z');
  });

  it('子任务可以增删与勾选', () => {
    useTaskStore.getState().addTask('写周报', '', 'medium', '');
    const id = useTaskStore.getState().tasks[0]!.id;

    useTaskStore.getState().addSubtask(id, '收集数据');
    useTaskStore.getState().addSubtask(id, '写结论');
    expect(useTaskStore.getState().tasks[0]!.subtasks).toHaveLength(2);

    const subId = useTaskStore.getState().tasks[0]!.subtasks[0]!.id;
    useTaskStore.getState().toggleSubtask(id, subId);
    expect(useTaskStore.getState().tasks[0]!.subtasks[0]!.done).toBe(true);

    useTaskStore.getState().deleteSubtask(id, subId);
    expect(useTaskStore.getState().tasks[0]!.subtasks).toHaveLength(1);
  });

  it('完成重复任务会自动生成下一次，撤销字段不带走', () => {
    useTaskStore.getState().addTask('站会', '', 'medium', '2026-09-28', { kind: 'daily' });
    const id = useTaskStore.getState().tasks[0]!.id;

    useTaskStore.getState().toggleTaskStatus(id);

    const tasks = useTaskStore.getState().tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.id).toBe(id);
    expect(tasks[0]!.status).toBe('completed');

    const next = tasks[1]!;
    expect(next.id).not.toBe(id);
    expect(next.status).toBe('pending');
    expect(next.dueDate).toBe('2026-09-29');
    expect(next.completedAt).toBeUndefined();

    // 把已完成的原任务取消完成：取消方向不生成新任务
    useTaskStore.getState().toggleTaskStatus(id);
    const after = useTaskStore.getState().tasks;
    expect(after).toHaveLength(2);
    expect(after[0]!.status).toBe('pending');
    expect(after[1]!.status).toBe('pending');
  });

  it('非重复任务完成时不会生成新任务', () => {
    useTaskStore.getState().addTask('一次性的事', '', 'low', '');
    useTaskStore.getState().toggleTaskStatus(useTaskStore.getState().tasks[0]!.id);
    expect(useTaskStore.getState().tasks).toHaveLength(1);
  });

  it('新建任务默认没有时间盒', () => {
    useTaskStore.getState().addTask('写方案', '', 'high', '2026-09-29');
    expect(useTaskStore.getState().tasks[0]!.timebox).toBeNull();
  });

  it('排时间盒：合法落点原样写入，非法落点等于没排', () => {
    useTaskStore.getState().addTask('写方案', '', 'high', '2026-09-29');
    const id = useTaskStore.getState().tasks[0]!.id;

    useTaskStore.getState().setTimebox(id, { date: '2026-09-29', start: '09:00', minutes: 90 });
    expect(useTaskStore.getState().tasks[0]!.timebox).toEqual({
      date: '2026-09-29',
      start: '09:00',
      minutes: 90,
    });

    useTaskStore.getState().setTimebox(id, { date: '2026-09-29', start: '25:00', minutes: 90 });
    expect(useTaskStore.getState().tasks[0]!.timebox).toBeNull();

    useTaskStore.getState().setTimebox(id, { date: '2026-09-29', start: '09:00', minutes: 90 });
    useTaskStore.getState().setTimebox(id, null);
    expect(useTaskStore.getState().tasks[0]!.timebox).toBeNull();
  });

  it('重复任务的下一轮沿用同一个时间点，只把日期换成新的一天', () => {
    useTaskStore.getState().addTask('站会', '', 'medium', '2026-09-28', { kind: 'daily' });
    const id = useTaskStore.getState().tasks[0]!.id;
    useTaskStore.getState().setTimebox(id, {
      date: '2026-09-28',
      start: '09:00',
      minutes: 30,
    });

    useTaskStore.getState().toggleTaskStatus(id);

    const next = useTaskStore.getState().tasks[1]!;
    expect(next.dueDate).toBe('2026-09-29');
    expect(next.timebox).toEqual({ date: '2026-09-29', start: '09:00', minutes: 30 });
    // 原任务的时间盒留在原来那天，历史不被改写
    expect(useTaskStore.getState().tasks[0]!.timebox).toEqual({
      date: '2026-09-28',
      start: '09:00',
      minutes: 30,
    });
  });
});

describe('持久化 key', () => {
  it('写入 lm: 前缀的 key，且不再使用旧的 tasks-storage', async () => {
    useTaskStore.getState().addTask('任务', '', 'low', '');

    // 落盘是异步的（数据可能写进 IndexedDB），断言存储前先等它写完
    await vi.waitFor(() => {
      const raw = localStorage.getItem(STORAGE_KEYS.tasks);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!).state.tasks).toHaveLength(1);
      expect(localStorage.getItem('tasks-storage')).toBeNull();
    });
  });

  it('各 store 使用各自独立的 key', async () => {
    useBookStore.getState().addBook('书名', '作者', '分类');
    useThemeStore.getState().setTheme('dark');

    await vi.waitFor(() => {
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.books)!).state.books).toHaveLength(1);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.theme)!).state.themeMode).toBe('dark');
    });
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

  it('当前版本号是 11', () => {
    expect(STORE_VERSION).toBe(11);
  });

  it('旧项目数据没有 hoursSpent，重新水合时补 0', async () => {
    localStorage.setItem(
      STORAGE_KEYS.dev,
      JSON.stringify({
        state: {
          projects: [
            {
              id: 'old-dev',
              name: '旧项目',
              description: '',
              status: 'in-progress',
              tasks: [],
              createdAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
        version: 4,
      }),
    );

    await useDevStore.persist.rehydrate();

    expect(useDevStore.getState().projects[0]!.name).toBe('旧项目');
    expect(useDevStore.getState().projects[0]!.hoursSpent).toBe(0);
    expect(useDevStore.getState().sessions).toEqual([]);
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

  it('bookStore：记阅读流水与开始时间', () => {
    const store = useBookStore.getState();
    store.addBook('人类简史', '赫拉利', '历史');
    const id = useBookStore.getState().books[0]!.id;

    expect(useBookStore.getState().books[0]!.startedAt).toBeUndefined();
    store.updateBookStatus(id, 'reading');
    const startedAt = useBookStore.getState().books[0]!.startedAt;
    expect(startedAt).toBeTruthy();

    // 再次改状态再回来，不覆盖第一次的开始时间
    store.updateBookStatus(id, 'want-to-read');
    store.updateBookStatus(id, 'reading');
    expect(useBookStore.getState().books[0]!.startedAt).toBe(startedAt);

    store.addReadingSession(id, '2026-09-28', 45, '第一章');
    const { sessions } = useBookStore.getState();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.bookId).toBe(id);
    expect(sessions[0]!.minutes).toBe(45);

    store.deleteReadingSession(sessions[0]!.id);
    expect(useBookStore.getState().sessions).toHaveLength(0);
  });

  it('bookStore：进度页码换算写回百分比', () => {
    const store = useBookStore.getState();
    store.addBook('深入理解计算机系统', '', '技术');
    const id = useBookStore.getState().books[0]!.id;
    store.updateBook(id, { totalPages: 200, status: 'reading' });
    store.updateProgress(id, 50);
    expect(useBookStore.getState().books[0]!.progress).toBe(50);
  });

  it('dietStore：营养素合计、每日目标与饮水打卡', () => {
    const store = useDietStore.getState();
    store.addRecord('2026-09-28', 'lunch', [
      { name: '鸡胸肉', category: '蛋白质', calories: 220, protein: 40, carbs: 0, fat: 5 },
      { name: '米饭', category: '主食', calories: 200, protein: 4, carbs: 45, fat: 1 },
    ]);

    const record = useDietStore.getState().records[0]!;
    expect(record.totalCalories).toBe(420);
    expect(record.totalProtein).toBe(44);
    expect(record.totalCarbs).toBe(45);
    expect(record.totalFat).toBe(6);

    useDietStore.getState().setGoals({ calories: 1800, protein: 100 });
    expect(useDietStore.getState().goals).toEqual({ calories: 1800, protein: 100 });

    useDietStore.getState().setWater('2026-09-28', 3);
    expect(useDietStore.getState().water['2026-09-28']).toBe(3);
    // 边界：最多 99 杯，最少 0 杯
    useDietStore.getState().setWater('2026-09-28', 120);
    expect(useDietStore.getState().water['2026-09-28']).toBe(99);
    useDietStore.getState().setWater('2026-09-28', -2);
    expect(useDietStore.getState().water['2026-09-28']).toBe(0);
  });

  it('writingStore：保存正文同步字数并留快照', () => {
    const store = useWritingStore.getState();
    store.addProject('新文章', 'article');
    const id = useWritingStore.getState().projects[0]!.id;

    store.updateContent(id, '第一段内容');
    let project = useWritingStore.getState().projects[0]!;
    expect(project.wordCount).toBe(5);
    expect(project.snapshots).toHaveLength(1);

    // 内容没变就不重复留版
    store.updateContent(id, '第一段内容');
    expect(useWritingStore.getState().projects[0]!.snapshots).toHaveLength(1);

    store.updateContent(id, ['第一段内容', '第二段'].join(String.fromCharCode(10)));
    project = useWritingStore.getState().projects[0]!;
    expect(project.wordCount).toBe(9); // 5 + 1(换行) + 3
    expect(project.snapshots).toHaveLength(2);

    store.setTargetWords(id, 5000);
    expect(useWritingStore.getState().projects[0]!.targetWords).toBe(5000);
    // 负数钳到 0
    store.setTargetWords(id, -3);
    expect(useWritingStore.getState().projects[0]!.targetWords).toBe(0);
  });

  it('writingStore：快照滚动保留 20 版', () => {
    const store = useWritingStore.getState();
    store.addProject('日记', 'article');
    const id = useWritingStore.getState().projects[0]!.id;
    for (let i = 1; i <= 25; i += 1) {
      store.updateContent(id, `第 ${i} 版内容`);
    }
    const project = useWritingStore.getState().projects[0]!;
    expect(project.snapshots).toHaveLength(20);
    // 最新的一版在最前
    expect(project.snapshots[0]!.content).toBe('第 25 版内容');
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

    // 反序列化是异步的（数据可能落在 IndexedDB 里），等两份 store 都读回来
    await vi.waitFor(() => {
      expect(freshTaskStore.getState().tasks).toHaveLength(1);
      expect(freshBookStore.getState().books).toHaveLength(1);
    });

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

describe('bookStore 条目化（F11）', () => {
  it('状态变更记进时间线：最近在前，重复设同一状态不重复记', () => {
    useBookStore.getState().addBook('人类简史', '赫拉利', '历史');
    const id = useBookStore.getState().books[0]!.id;
    expect(useBookStore.getState().books[0]!.statusHistory).toEqual([]);

    useBookStore.getState().updateBookStatus(id, 'reading');
    useBookStore.getState().updateBookStatus(id, 'reading');
    useBookStore.getState().updateBookStatus(id, 'finished');

    const history = useBookStore.getState().books[0]!.statusHistory;
    expect(history.map((entry) => entry.status)).toEqual(['finished', 'reading']);
    expect(new Set(history.map((entry) => entry.id)).size).toBe(2);
  });

  it('时间线记本地日期，不是 UTC 日期', () => {
    vi.useFakeTimers();
    // 本地凌晨 00:30：旧写法 toISOString().slice(0, 10) 在东八区会算成前一天
    vi.setSystemTime(new Date(2026, 8, 30, 0, 30));
    try {
      useBookStore.getState().addBook('人类简史', '赫拉利', '历史');
      const id = useBookStore.getState().books[0]!.id;
      useBookStore.getState().updateBookStatus(id, 'reading');

      expect(useBookStore.getState().books[0]!.statusHistory[0]!.date).toBe('2026-09-30');
      expect(useBookStore.getState().books[0]!.statusHistory[0]!.date).toBe(
        todayKey(new Date(2026, 8, 30, 0, 30)),
      );
    } finally {
      vi.useRealTimers();
    }
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

describe('gameStore 条目化（F11）', () => {
  it('标记通关时记通关日期与状态时间线，退回则清掉通关日期', () => {
    useGameStore.setState({ games: [], sessions: [] });
    useGameStore.getState().addGame('哈迪斯', 'PC');
    const id = useGameStore.getState().games[0]!.id;

    useGameStore.getState().updateGameStatus(id, 'completed');
    let game = useGameStore.getState().games[0]!;
    expect(game.status).toBe('completed');
    expect(game.finishedAt).toBeTruthy();
    expect(game.statusHistory[0]!.status).toBe('completed');

    // 再切别的状态：通关日期清掉，时间线追加
    useGameStore.getState().updateGameStatus(id, 'playing');
    game = useGameStore.getState().games[0]!;
    expect(game.finishedAt).toBeUndefined();
    expect(game.statusHistory[0]!.status).toBe('playing');
    expect(game.statusHistory).toHaveLength(2);

    // 状态没变不重复记录
    useGameStore.getState().updateGameStatus(id, 'playing');
    expect(useGameStore.getState().games[0]!.statusHistory).toHaveLength(2);
  });

  it('通关日期与时间线都记本地日期，不是 UTC 日期', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 0, 30));
    try {
      useGameStore.getState().addGame('哈迪斯', 'PC');
      const id = useGameStore.getState().games[0]!.id;
      useGameStore.getState().updateGameStatus(id, 'completed');

      const game = useGameStore.getState().games[0]!;
      expect(game.finishedAt).toBe('2026-09-30');
      expect(game.statusHistory[0]!.date).toBe('2026-09-30');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('devStore 里程碑 / 开发日志 / 工作项分类', () => {
  it('工作项可以带分类创建', () => {
    useDevStore.getState().addProject('写作助手', '');
    const pid = useDevStore.getState().projects[0]!.id;
    useDevStore.getState().addTask(pid, '修导出崩溃', 'high', 'bug');
    const task = useDevStore.getState().projects[0]!.tasks[0]!;
    expect(task.type).toBe('bug');
  });

  it('里程碑可以增删与勾选', () => {
    useDevStore.getState().addProject('写作助手', '');
    const pid = useDevStore.getState().projects[0]!.id;
    const store = useDevStore.getState();
    store.addMilestone(pid, 'v1.0 发布', '2026-10-31');
    let project = useDevStore.getState().projects[0]!;
    expect(project.milestones).toHaveLength(1);
    expect(project.milestones[0]!.dueDate).toBe('2026-10-31');

    store.toggleMilestone(pid, project.milestones[0]!.id);
    expect(useDevStore.getState().projects[0]!.milestones[0]!.done).toBe(true);

    useDevStore.getState().deleteMilestone(pid, project.milestones[0]!.id);
    expect(useDevStore.getState().projects[0]!.milestones).toHaveLength(0);
  });

  it('开发日志可以追加与删除', () => {
    useDevStore.getState().addProject('写作助手', '');
    const pid = useDevStore.getState().projects[0]!.id;
    useDevStore.getState().addLog(pid, '2026-09-29', '完成导入预览');
    const project = useDevStore.getState().projects[0]!;
    expect(project.logs).toHaveLength(1);
    expect(project.logs[0]!.content).toBe('完成导入预览');

    useDevStore.getState().deleteLog(pid, project.logs[0]!.id);
    expect(useDevStore.getState().projects[0]!.logs).toHaveLength(0);
  });
});

describe('devStore 工时流水', () => {
  const addProject = (name = 'Life Manager'): string => {
    useDevStore.getState().addProject(name, '个人应用');
    return useDevStore.getState().projects.find((project) => project.name === name)!.id;
  };

  it('记一次工时同时写流水并累加到项目', () => {
    const id = addProject();

    useDevStore.getState().addSession(id, '2026-09-28', 2.5, '重构存储层');

    const session = useDevStore.getState().sessions[0]!;
    expect(session.projectId).toBe(id);
    expect(session.date).toBe('2026-09-28');
    expect(session.hours).toBe(2.5);
    expect(session.note).toBe('重构存储层');
    expect(useDevStore.getState().projects[0]!.hoursSpent).toBe(2.5);

    useDevStore.getState().addSession(id, '2026-09-29', 1.5, '');
    expect(useDevStore.getState().projects[0]!.hoursSpent).toBe(4);
    expect(useDevStore.getState().sessions).toHaveLength(2);
  });

  it('删流水会把工时减回去，且不会变成负数', () => {
    const id = addProject();
    useDevStore.getState().addSession(id, '2026-09-28', 2, '');
    const sessionId = useDevStore.getState().sessions[0]!.id;

    useDevStore.getState().deleteSession(sessionId);

    expect(useDevStore.getState().sessions).toHaveLength(0);
    expect(useDevStore.getState().projects[0]!.hoursSpent).toBe(0);

    // 手动把累计工时改小后再删，不能出现负数
    useDevStore.getState().addSession(id, '2026-09-28', 3, '');
    useDevStore.getState().updateProject(id, { hoursSpent: 1 });
    useDevStore.getState().deleteSession(useDevStore.getState().sessions[0]!.id);
    expect(useDevStore.getState().projects[0]!.hoursSpent).toBe(0);
  });

  it('删掉不存在的流水时原样返回，不会误改项目工时', () => {
    const id = addProject();
    useDevStore.getState().addSession(id, '2026-09-28', 2, '');

    useDevStore.getState().deleteSession('not-exist');

    expect(useDevStore.getState().sessions).toHaveLength(1);
    expect(useDevStore.getState().projects[0]!.hoursSpent).toBe(2);
  });

  it('replaceSessions 用于导入与撤销', () => {
    useDevStore
      .getState()
      .replaceSessions([
        { id: 'w1', projectId: 'p1', date: '2026-09-01', hours: 3, note: '', createdAt: 'x' },
      ]);
    expect(useDevStore.getState().sessions).toHaveLength(1);

    useDevStore.getState().replaceSessions([]);
    expect(useDevStore.getState().sessions).toHaveLength(0);
  });
});

describe('统一标签', () => {
  /** 七个模块的 add* 都接受可选的 tags，并且写进 store 之前会做一次清洗 */
  const DIRTY = ['#工作', '工作', '   ', 'Work', 'work'];
  const CLEAN = ['工作', 'Work'];

  it('addTask 写入并清洗标签', () => {
    useTaskStore.getState().addTask('写周报', '', 'medium', '', null, DIRTY);
    expect(useTaskStore.getState().tasks[0]!.tags).toEqual(CLEAN);
  });

  it('不传标签时默认空数组', () => {
    useTaskStore.getState().addTask('写周报', '', 'medium', '');
    expect(useTaskStore.getState().tasks[0]!.tags).toEqual([]);
  });

  it('读书 / 开发 / 写作 / 游戏 / 训练 / 饮食都支持标签', () => {
    useBookStore.getState().addBook('置身事内', '兰小欢', '经济', DIRTY);
    expect(useBookStore.getState().books[0]!.tags).toEqual(CLEAN);

    useDevStore.getState().addProject('记账 App', '', DIRTY);
    expect(useDevStore.getState().projects[0]!.tags).toEqual(CLEAN);

    useWritingStore.getState().addProject('周报模板', 'article', DIRTY);
    expect(useWritingStore.getState().projects[0]!.tags).toEqual(CLEAN);

    useGameStore.getState().addGame('星露谷', 'PC', DIRTY);
    expect(useGameStore.getState().games[0]!.tags).toEqual(CLEAN);

    useFitnessStore.getState().addRecord('胸肌日', '2026-09-28', [], '', DIRTY);
    expect(useFitnessStore.getState().records[0]!.tags).toEqual(CLEAN);

    useDietStore.getState().addRecord('2026-09-28', 'lunch', [], DIRTY);
    expect(useDietStore.getState().records[0]!.tags).toEqual(CLEAN);
  });

  it('updateX 可以单独改标签（表单与快速捕获共用这条路径）', () => {
    useTaskStore.getState().addTask('写周报', '', 'medium', '');
    const id = useTaskStore.getState().tasks[0]!.id;
    useTaskStore.getState().updateTask(id, { tags: ['工作'] });
    expect(useTaskStore.getState().tasks[0]!.tags).toEqual(['工作']);
  });
});

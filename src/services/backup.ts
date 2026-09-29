import { z } from 'zod';
import { createId } from '../utils/id';
import {
  BACKUP_KEY_PREFIX,
  DATA_STORAGE_KEYS,
  MAX_AUTO_BACKUPS,
  appStorageKeys,
  clearAppStorage,
  isAppStorageKey,
} from '../utils/storageKeys';
import { todayKey } from '../utils/date';
import { reportStorageFailure } from '../store/storage';
import {
  APP_ID,
  BACKUP_MODULES,
  BACKUP_SCHEMA_VERSION,
  bodyMetricSchema,
  bookSchema,
  devProjectSchema,
  fitnessPlanSchema,
  focusSessionSchema,
  gameSchema,
  gameSessionSchema,
  goalSchema,
  habitSchema,
  readingSessionSchema,
  mealRecordSchema,
  reviewSchema,
  memoSchema,
  settingsSchema,
  taskSchema,
  workoutRecordSchema,
  workSessionSchema,
  writingProjectSchema,
} from './schemas';
import type { BackupData, BackupModule } from './schemas';

export interface ParseIssue {
  path: string;
  message: string;
}

export interface ParsedBackup {
  source: 'envelope' | 'legacy';
  schemaVersion: number;
  exportedAt?: string;
  modules: Partial<BackupData>;
  warnings: ParseIssue[];
}

export type ImportMode = 'merge' | 'overwrite' | 'append';

export interface ModulePlan {
  incoming: number;
  added: number;
  skipped: number;
}

export type ImportPlanStats = Record<BackupModule, ModulePlan>;

export interface ImportPlan {
  data: Partial<BackupData>;
  stats: ImportPlanStats;
}

export interface MergeOutcome<T> {
  items: T[];
  added: number;
  skipped: number;
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(根)';
      return `${path}: ${issue.message}`;
    })
    .join('；');
}

/**
 * 校验单个模块。
 * 先整体校验（快路径）；若整数组不合法，则退化为逐条校验，
 * 这样一条坏数据不会导致整个模块被丢弃。
 */
function parseArray<S extends z.ZodTypeAny>(
  schema: S,
  raw: unknown[],
  module: string,
): { items: z.infer<S>[]; issues: ParseIssue[] } {
  const whole = z.array(schema).safeParse(raw);
  if (whole.success) return { items: whole.data, issues: [] };

  const items: z.infer<S>[] = [];
  const issues: ParseIssue[] = [];
  raw.forEach((entry, index) => {
    const one = schema.safeParse(entry);
    if (one.success) items.push(one.data);
    else issues.push({ path: `${module}[${index}]`, message: formatZodError(one.error) });
  });
  return { items, issues };
}

/**
 * 解析备份文本。兼容：
 * - v2 信封结构 { app, schemaVersion, exportedAt, data: {...} }
 * - v1 扁平结构 { tasks: [...], books: [...], ... }
 */
export function parseBackup(
  rawText: string,
): { ok: true; backup: ParsedBackup } | { ok: false; errors: ParseIssue[] } {
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    return { ok: false, errors: [{ path: '(文件)', message: '不是合法的 JSON 文件' }] };
  }

  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { ok: false, errors: [{ path: '(文件)', message: '备份文件的顶层结构应为对象' }] };
  }

  const root = json as Record<string, unknown>;
  const nested = root.data;
  const isEnvelope = typeof nested === 'object' && nested !== null && !Array.isArray(nested);
  const source = isEnvelope ? (nested as Record<string, unknown>) : root;

  const warnings: ParseIssue[] = [];
  const modules: Partial<BackupData> = {};
  // 注意：只有「明确的数组」才会被当作该模块的数据。
  // 字段缺失或类型不对时返回 undefined（= 该模块不在备份里），
  // 这样「覆盖」模式不会因为一份坏文件而清空用户现有数据。
  // 显式的空数组 [] 仍然表示「用户确实要清空这个模块」。
  const pick = <S extends z.ZodTypeAny>(schema: S, key: string): z.infer<S>[] | undefined => {
    const raw = source[key];
    if (raw === undefined) return undefined;
    if (!Array.isArray(raw)) {
      const actual = raw === null ? 'null' : typeof raw;
      warnings.push({ path: key, message: `期望数组，实际为 ${actual}` });
      return undefined;
    }
    const parsed = parseArray(schema, raw, key);
    warnings.push(...parsed.issues);
    return parsed.items;
  };

  modules.tasks = pick(taskSchema, 'tasks');
  modules.memos = pick(memoSchema, 'memos');
  modules.books = pick(bookSchema, 'books');
  modules.devProjects = pick(devProjectSchema, 'devProjects');
  modules.workSessions = pick(workSessionSchema, 'workSessions');
  modules.writingProjects = pick(writingProjectSchema, 'writingProjects');
  modules.fitnessPlans = pick(fitnessPlanSchema, 'fitnessPlans');
  modules.fitnessRecords = pick(workoutRecordSchema, 'fitnessRecords');
  modules.bodyMetrics = pick(bodyMetricSchema, 'bodyMetrics');
  modules.dietRecords = pick(mealRecordSchema, 'dietRecords');
  modules.games = pick(gameSchema, 'games');
  modules.gameSessions = pick(gameSessionSchema, 'gameSessions');
  modules.readingSessions = pick(readingSessionSchema, 'readingSessions');
  modules.habits = pick(habitSchema, 'habits');
  modules.focusSessions = pick(focusSessionSchema, 'focusSessions');
  modules.reviews = pick(reviewSchema, 'reviews');
  modules.goals = pick(goalSchema, 'goals');

  const settings = settingsSchema.safeParse(source.settings);
  if (settings.success) modules.settings = settings.data;
  else if (source.settings !== undefined) {
    warnings.push({ path: 'settings', message: formatZodError(settings.error) });
  }

  const missing = BACKUP_MODULES.filter((module) => modules[module] === undefined);
  if (missing.length === BACKUP_MODULES.length) {
    return { ok: false, errors: [{ path: '(文件)', message: '没有找到任何已知的数据模块' }] };
  }

  return {
    ok: true,
    backup: {
      source: isEnvelope ? 'envelope' : 'legacy',
      schemaVersion: typeof root.schemaVersion === 'number' ? root.schemaVersion : 1,
      exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : undefined,
      modules,
      warnings,
    },
  };
}

/** 按 id 合并 / 覆盖 / 追加 */
export function mergeById<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  mode: ImportMode,
  makeId: () => string = createId,
): MergeOutcome<T> {
  if (mode === 'overwrite') {
    return { items: [...incoming], added: incoming.length, skipped: 0 };
  }

  if (mode === 'merge') {
    const known = new Set(existing.map((item) => item.id));
    const items = [...existing];
    let added = 0;
    let skipped = 0;
    for (const item of incoming) {
      if (known.has(item.id)) {
        skipped += 1;
        continue;
      }
      known.add(item.id);
      items.push(item);
      added += 1;
    }
    return { items, added, skipped };
  }

  // append：全部保留，遇到 id 冲突就重新分配，避免出现重复记录
  const used = new Set(existing.map((item) => item.id));
  const items = [...existing];
  for (const item of incoming) {
    let next = item;
    if (used.has(item.id)) {
      let fresh = makeId();
      while (used.has(fresh)) fresh = makeId();
      next = { ...item, id: fresh };
    }
    used.add(next.id);
    items.push(next);
  }
  return { items, added: incoming.length, skipped: 0 };
}

/**
 * 计算导入结果。既用于写入前的预览，也用于真正的写入，
 * 保证「预览看到什么，导入就是什么」。
 */
export function planImport(
  current: Partial<BackupData>,
  backup: Partial<BackupData>,
  mode: ImportMode,
  makeId: () => string = createId,
): ImportPlan {
  /**
   * 备份里没有这个模块 ≠ 用户要清空它。
   * 旧备份（或部分模块缺失的备份）里没有的字段一律保持现状，
   * 否则「覆盖」模式会把用户现有数据静默抹掉。
   */
  const merge = <T extends { id: string }>(
    module: BackupModule,
    existing: T[],
  ): MergeOutcome<T> => {
    const incoming = backup[module] as unknown as T[] | undefined;
    if (incoming === undefined) return { items: [...existing], added: 0, skipped: 0 };
    return mergeById(existing, incoming, mode, makeId);
  };

  const tasks = merge('tasks', current.tasks ?? []);
  const memos = merge('memos', current.memos ?? []);
  const books = merge('books', current.books ?? []);
  const devProjects = merge('devProjects', current.devProjects ?? []);
  const workSessions = merge('workSessions', current.workSessions ?? []);
  const writingProjects = merge('writingProjects', current.writingProjects ?? []);
  const fitnessPlans = merge('fitnessPlans', current.fitnessPlans ?? []);
  const fitnessRecords = merge('fitnessRecords', current.fitnessRecords ?? []);
  const bodyMetrics = merge('bodyMetrics', current.bodyMetrics ?? []);
  const dietRecords = merge('dietRecords', current.dietRecords ?? []);
  const games = merge('games', current.games ?? []);
  const gameSessions = merge('gameSessions', current.gameSessions ?? []);
  const readingSessions = merge('readingSessions', current.readingSessions ?? []);
  const habits = merge('habits', current.habits ?? []);
  const focusSessions = merge('focusSessions', current.focusSessions ?? []);
  const reviews = merge('reviews', current.reviews ?? []);
  const goals = merge('goals', current.goals ?? []);

  const count = (incoming: unknown[] | undefined) => (incoming ?? []).length;

  return {
    data: {
      tasks: tasks.items,
      memos: memos.items,
      books: books.items,
      devProjects: devProjects.items,
      workSessions: workSessions.items,
      writingProjects: writingProjects.items,
      fitnessPlans: fitnessPlans.items,
      fitnessRecords: fitnessRecords.items,
      bodyMetrics: bodyMetrics.items,
      dietRecords: dietRecords.items,
      games: games.items,
      gameSessions: gameSessions.items,
      readingSessions: readingSessions.items,
      habits: habits.items,
      focusSessions: focusSessions.items,
      reviews: reviews.items,
      goals: goals.items,
      settings: backup.settings,
    },
    stats: {
      tasks: { incoming: count(backup.tasks), added: tasks.added, skipped: tasks.skipped },
      memos: { incoming: count(backup.memos), added: memos.added, skipped: memos.skipped },
      books: { incoming: count(backup.books), added: books.added, skipped: books.skipped },
      devProjects: {
        incoming: count(backup.devProjects),
        added: devProjects.added,
        skipped: devProjects.skipped,
      },
      workSessions: {
        incoming: count(backup.workSessions),
        added: workSessions.added,
        skipped: workSessions.skipped,
      },
      writingProjects: {
        incoming: count(backup.writingProjects),
        added: writingProjects.added,
        skipped: writingProjects.skipped,
      },
      fitnessPlans: {
        incoming: count(backup.fitnessPlans),
        added: fitnessPlans.added,
        skipped: fitnessPlans.skipped,
      },
      fitnessRecords: {
        incoming: count(backup.fitnessRecords),
        added: fitnessRecords.added,
        skipped: fitnessRecords.skipped,
      },
      bodyMetrics: {
        incoming: count(backup.bodyMetrics),
        added: bodyMetrics.added,
        skipped: bodyMetrics.skipped,
      },
      dietRecords: {
        incoming: count(backup.dietRecords),
        added: dietRecords.added,
        skipped: dietRecords.skipped,
      },
      games: { incoming: count(backup.games), added: games.added, skipped: games.skipped },
      gameSessions: {
        incoming: count(backup.gameSessions),
        added: gameSessions.added,
        skipped: gameSessions.skipped,
      },
      readingSessions: {
        incoming: count(backup.readingSessions),
        added: readingSessions.added,
        skipped: readingSessions.skipped,
      },
      habits: { incoming: count(backup.habits), added: habits.added, skipped: habits.skipped },
      focusSessions: {
        incoming: count(backup.focusSessions),
        added: focusSessions.added,
        skipped: focusSessions.skipped,
      },
      reviews: {
        incoming: count(backup.reviews),
        added: reviews.added,
        skipped: reviews.skipped,
      },
      goals: { incoming: count(backup.goals), added: goals.added, skipped: goals.skipped },
    },
  };
}

export function planTotals(stats: ImportPlanStats): {
  incoming: number;
  added: number;
  skipped: number;
} {
  return BACKUP_MODULES.reduce(
    (acc, module) => ({
      incoming: acc.incoming + stats[module].incoming,
      added: acc.added + stats[module].added,
      skipped: acc.skipped + stats[module].skipped,
    }),
    { incoming: 0, added: 0, skipped: 0 },
  );
}

// ---------------------------------------------------------------- 导出

export interface BackupEnvelope {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

export function buildBackupEnvelope(data: BackupData, now: Date = new Date()): BackupEnvelope {
  return {
    app: APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data,
  };
}

export function serializeBackup(data: BackupData, now: Date = new Date()): string {
  return JSON.stringify(buildBackupEnvelope(data, now), null, 2);
}

export function backupFileName(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `life-manager-backup-${stamp}.json`;
}

/** 触发浏览器下载，返回文件名 */
export function downloadBackup(data: BackupData, now: Date = new Date()): string {
  const blob = new Blob([serializeBackup(data, now)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const fileName = backupFileName(now);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return fileName;
}

// ---------------------------------------------------------------- 自动快照

export interface AutoSnapshot {
  key: string;
  createdAt: string;
  reason: string;
  size: number;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 在任何破坏性操作前保存一份快照，便于回滚 */
export function createAutoSnapshot(reason: string): string | null {
  const storage = safeStorage();
  if (!storage) return null;

  const entries: Record<string, string> = {};
  for (const key of appStorageKeys()) {
    const value = storage.getItem(key);
    if (value !== null) entries[key] = value;
  }

  // 先按上限裁剪再写入：快照自己也占空间，空间紧张时先腾地方成功率更高
  pruneAutoSnapshots();

  // 同一毫秒内连续快照（例如批量操作）也要各自独立，所以后缀带上随机片段
  const key = `${BACKUP_KEY_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    storage.setItem(key, JSON.stringify({ createdAt: new Date().toISOString(), reason, entries }));
  } catch (error) {
    // 快照写不进去属于可接受的降级（当前数据本身仍在），但要让用户知道存储已经满了
    reportStorageFailure(key, error);
    return null;
  }
  return key;
}

export function listAutoSnapshots(): AutoSnapshot[] {
  const storage = safeStorage();
  if (!storage) return [];

  const snapshots: AutoSnapshot[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key === null || !key.startsWith(BACKUP_KEY_PREFIX)) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      const parsed = JSON.parse(raw) as { createdAt?: string; reason?: string };
      snapshots.push({
        key,
        createdAt: parsed.createdAt ?? '',
        reason: parsed.reason ?? '',
        size: raw.length * 2,
      });
    } catch {
      snapshots.push({ key, createdAt: '', reason: '(无法解析)', size: raw.length * 2 });
    }
  }

  return snapshots.sort((a, b) => b.key.localeCompare(a.key));
}

export function pruneAutoSnapshots(max: number = MAX_AUTO_BACKUPS): string[] {
  const storage = safeStorage();
  if (!storage) return [];
  const removed: string[] = [];
  const snapshots = listAutoSnapshots();
  for (const snapshot of snapshots.slice(max)) {
    storage.removeItem(snapshot.key);
    removed.push(snapshot.key);
  }
  return removed;
}

/** 删除全部自动备份快照，返回被删掉的 key（「清除数据」默认保留快照，这里是显式清空入口） */
export function clearAutoSnapshots(): string[] {
  const storage = safeStorage();
  if (!storage) return [];
  const removed = listAutoSnapshots().map((snapshot) => snapshot.key);
  for (const key of removed) storage.removeItem(key);
  return removed;
}
/** 把某个快照写回 localStorage（仅覆盖本应用的 key），调用方负责重新加载页面 */
export function restoreAutoSnapshot(key: string): boolean {
  const storage = safeStorage();
  if (!storage) return false;
  const raw = storage.getItem(key);
  if (raw === null) return false;

  try {
    const parsed = JSON.parse(raw) as { entries?: Record<string, string> };
    const entries = parsed.entries ?? {};
    for (const targetKey of appStorageKeys()) storage.removeItem(targetKey);
    for (const [entryKey, entryValue] of Object.entries(entries)) {
      if (isAppStorageKey(entryKey)) storage.setItem(entryKey, entryValue);
    }
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- 每日自动备份

export const DAILY_SNAPSHOT_REASON = '每日自动备份';

/** 快照创建时间落在哪一天（按应用统一的 todayKey 口径）；解析不了就返回空串 */
function snapshotDay(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return todayKey(date);
}

function isNonEmptyObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}

/** 本地是否已经有真实数据。空库不占快照位，免得新用户一进来就攒一堆空快照 */
function hasUserData(): boolean {
  const storage = safeStorage();
  if (!storage) return false;

  for (const key of DATA_STORAGE_KEYS) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
      const state = parsed?.state;
      if (typeof state !== 'object' || state === null) continue;
      for (const value of Object.values(state)) {
        if (Array.isArray(value) ? value.length > 0 : isNonEmptyObject(value)) return true;
      }
    } catch {
      // 单个模块的数据坏了不影响判断其它模块
      continue;
    }
  }
  return false;
}

/**
 * 每天第一次打开应用时自动留一份快照。
 *
 * 为什么按「天」而不是按「次」或「每次改动」：快照池只有 MAX_AUTO_BACKUPS 份，
 * 按次写会把池子冲干净，反而失去「回到上周某天」的能力。而真正要防的是
 * 「清缓存 / 误操作」这类低频事故，一天一份就够了。
 */
export function ensureDailySnapshot(now: Date = new Date()): string | null {
  if (!safeStorage()) return null;

  const day = todayKey(now);
  const already = listAutoSnapshots().some(
    (snapshot) =>
      snapshot.reason === DAILY_SNAPSHOT_REASON && snapshotDay(snapshot.createdAt) === day,
  );
  if (already) return null;
  if (!hasUserData()) return null;

  return createAutoSnapshot(DAILY_SNAPSHOT_REASON);
}

export { clearAppStorage };

import type { BackupData } from './schemas';
import { serializeBackup } from './backup';

/**
 * 「备份到指定文件夹」（D3）。
 *
 * 为什么值得单独做一条：手动导出的文件是「用户想起来去点」才存在的，
 * 而真正会丢数据的场景（清缓存、换电脑、误操作）恰恰发生在人没想起来导出的时候。
 * 这里把「一个文件夹的写权限」交给应用记住，之后每次打开都静默覆盖一份最新备份。
 *
 * 边界：
 *   - 只用 File System Access API，纯本地，不联网也不上传；
 *   - 目录句柄存在**独立的 IndexedDB 库**里 —— 它只能结构化克隆，塞不进 localStorage，
 *     所以 localStorage 兜底路径下这个功能直接算「不支持」，而不是假装支持；
 *   - 授权失效时开机静默写入会直接跳过，**绝不弹窗**：目录授权必须由用户点击触发。
 */

/** 写进目标文件夹的文件名；固定名字 = 每次覆盖，文件夹里永远只有一份最新备份 */
export const FOLDER_BACKUP_FILE = 'life-manager-auto-backup.json';

const HANDLE_DB_NAME = 'life-manager-handles';
const HANDLE_DB_VERSION = 1;
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'backup-folder';

export interface FolderBackupStatus {
  /** 文件夹名，只用于显示 */
  folderName: string;
  /** 最近一次成功写入时间（ISO）；从未写过时为空串 */
  lastWrittenAt: string;
  /** 句柄是否还有写入授权；false 时界面提示「重新授权」 */
  granted: boolean;
}

interface FolderHandleRecord {
  handle: FileSystemDirectoryHandle;
  lastWrittenAt: string;
}

interface DirectoryPermissionDescriptor {
  mode: 'read' | 'readwrite';
}

/** TS 5.9 的 lib.dom 还没有 Permission 相关的这两个方法，这里按实际用法补形状 */
interface PermissionCapableHandle {
  queryPermission?: (descriptor: DirectoryPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (descriptor: DirectoryPermissionDescriptor) => Promise<PermissionState>;
}

interface DirectoryPickerHost {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: string;
  }) => Promise<FileSystemDirectoryHandle>;
}

function pickerHost(): DirectoryPickerHost | null {
  const host = globalThis as unknown as DirectoryPickerHost;
  return typeof host.showDirectoryPicker === 'function' ? host : null;
}

/** 弹出系统目录选择框；浏览器不支持时返回 null */
function pickDirectory(): Promise<FileSystemDirectoryHandle> | null {
  const host = pickerHost();
  const pick = host?.showDirectoryPicker;
  if (host === null || typeof pick !== 'function') return null;
  return pick.call(host, { id: 'life-manager-backup', mode: 'readwrite', startIn: 'documents' });
}

export function isFolderBackupSupported(): boolean {
  // 句柄要落到 IndexedDB 才能跨会话记住；拿不到 IndexedDB 就不该让用户白授权一次
  return pickerHost() !== null && typeof indexedDB !== 'undefined';
}

/** 用户在系统弹窗里按了「取消」时抛的是 AbortError，不该当成失败弹错 */
export function isFolderPickerAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

// ---------------------------------------------------------------- 句柄的落盘

function openHandleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, HANDLE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('打不开 IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB 被其它标签页占用'));
  });
}

function request<T>(source: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    source.onsuccess = () => resolve(source.result);
    source.onerror = () => reject(source.error ?? new Error('IndexedDB 操作失败'));
  });
}

function isHandleRecord(value: unknown): value is FolderHandleRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { handle?: unknown; lastWrittenAt?: unknown };
  return (
    typeof candidate.handle === 'object' &&
    candidate.handle !== null &&
    typeof candidate.lastWrittenAt === 'string'
  );
}

interface FolderHandleStore {
  read(): Promise<FolderHandleRecord | null>;
  write(record: FolderHandleRecord): Promise<void>;
  remove(): Promise<void>;
}

/** 打不开（隐私模式、配额）就返回 null，功能整体降级为「不支持」 */
async function createIndexedDbHandleStore(): Promise<FolderHandleStore | null> {
  if (typeof indexedDB === 'undefined') return null;

  let db: IDBDatabase;
  try {
    db = await openHandleDatabase();
  } catch {
    return null;
  }

  return {
    async read() {
      const store = db.transaction(HANDLE_STORE, 'readonly').objectStore(HANDLE_STORE);
      const value: unknown = await request(store.get(HANDLE_KEY));
      return isHandleRecord(value) ? value : null;
    },
    async write(record) {
      await runTransaction(db, (store) => store.put(record, HANDLE_KEY));
    },
    async remove() {
      await runTransaction(db, (store) => store.delete(HANDLE_KEY));
    },
  };
}

function runTransaction(db: IDBDatabase, run: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HANDLE_STORE, 'readwrite');
    run(transaction.objectStore(HANDLE_STORE));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 写入失败'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 写入被中断'));
  });
}

let cachedHandleStore: Promise<FolderHandleStore | null> | null = null;

/** 每个会话只开一次库；打不开就整条功能降级，而不是每次操作都重试一次失败的 open */
function resolveHandleStore(): Promise<FolderHandleStore | null> {
  if (cachedHandleStore === null) cachedHandleStore = createIndexedDbHandleStore();
  return cachedHandleStore;
}

/**
 * 测试用：清掉「每会话只开一次库」的缓存。
 * 每个用例都会装一份新的假 indexedDB，缓存不清的话第二个用例会接着用上一个库。
 */
export function resetFolderBackupStore(): void {
  cachedHandleStore = null;
}

// ---------------------------------------------------------------- 授权与写入

async function hasPermission(
  handle: FileSystemDirectoryHandle,
  requestGrant: boolean,
): Promise<boolean> {
  const capable = handle as unknown as PermissionCapableHandle;
  const query = capable.queryPermission;
  // 老实现没有这两个方法时无法预判，只能先按「可以写」处理，真被拒会在写入时抛错
  if (typeof query !== 'function') return true;

  try {
    const state = await query.call(capable, { mode: 'readwrite' });
    if (state === 'granted') return true;
    if (!requestGrant || state === 'denied') return false;

    const ask = capable.requestPermission;
    if (typeof ask !== 'function') return false;
    return (await ask.call(capable, { mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

/** 写一份备份进去，返回写入时间；失败会抛异常，由调用方决定怎么提示 */
async function writeBackupFile(
  handle: FileSystemDirectoryHandle,
  data: BackupData,
  now: Date,
): Promise<string> {
  const file = await handle.getFileHandle(FOLDER_BACKUP_FILE, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(serializeBackup(data, now));
  } finally {
    // close() 才是真正落盘的那一步，异常路径上也要走，否则流会一直挂着
    await writable.close();
  }
  return now.toISOString();
}

function statusOf(handle: FileSystemDirectoryHandle, lastWrittenAt: string): FolderBackupStatus {
  return { folderName: handle.name, lastWrittenAt, granted: true };
}

async function readRecord(): Promise<FolderHandleRecord | null> {
  const store = await resolveHandleStore();
  return store === null ? null : store.read();
}

async function persistWritten(handle: FileSystemDirectoryHandle, lastWrittenAt: string) {
  const store = await resolveHandleStore();
  if (store !== null) await store.write({ handle, lastWrittenAt });
}

// ---------------------------------------------------------------- 对外接口

/** 当前记住的文件夹；没选过、或存储不可用时返回 null */
export async function getFolderBackupStatus(): Promise<FolderBackupStatus | null> {
  const record = await readRecord();
  if (record === null) return null;
  return {
    folderName: record.handle.name,
    lastWrittenAt: record.lastWrittenAt,
    granted: await hasPermission(record.handle, false),
  };
}

/**
 * 选文件夹 → 记住句柄 → 立刻写一份。
 * 必须由用户点击触发（浏览器要求用户手势），并且会弹出系统授权框。
 */
export async function chooseFolderBackupFolder(
  data: BackupData,
  now: Date = new Date(),
): Promise<FolderBackupStatus> {
  const pending = pickDirectory();
  if (pending === null) throw new Error('这个浏览器不支持「导出到指定文件夹」');
  const store = await resolveHandleStore();
  if (store === null) throw new Error('当前浏览器无法记住文件夹授权，请改用「导出 JSON」');

  const handle = await pending;
  if (!(await hasPermission(handle, true))) throw new Error('没有拿到这个文件夹的写入权限');

  const lastWrittenAt = await writeBackupFile(handle, data, now);
  await store.write({ handle, lastWrittenAt });
  return statusOf(handle, lastWrittenAt);
}

/** 手动「立即写入一份」。授权过期时会再问一次（同样需要用户点击） */
export async function writeFolderBackupNow(
  data: BackupData,
  now: Date = new Date(),
): Promise<FolderBackupStatus> {
  const record = await readRecord();
  if (record === null) throw new Error('还没有选择备份文件夹');
  if (!(await hasPermission(record.handle, true))) {
    throw new Error('没有拿到这个文件夹的写入权限');
  }

  const lastWrittenAt = await writeBackupFile(record.handle, data, now);
  await persistWritten(record.handle, lastWrittenAt);
  return statusOf(record.handle, lastWrittenAt);
}

/**
 * 打开应用时静默写一份。
 * 没选过文件夹、或授权已经失效，都直接返回 null —— 开机流程里绝不弹窗、绝不报错。
 */
export async function syncFolderBackupOnBoot(
  data: BackupData,
  now: Date = new Date(),
): Promise<FolderBackupStatus | null> {
  try {
    const record = await readRecord();
    if (record === null) return null;
    if (!(await hasPermission(record.handle, false))) return null;

    const lastWrittenAt = await writeBackupFile(record.handle, data, now);
    await persistWritten(record.handle, lastWrittenAt);
    return statusOf(record.handle, lastWrittenAt);
  } catch {
    // 写不进目标文件夹（U 盘拔了、目录被删）不该影响应用启动
    return null;
  }
}

/** 忘掉这个文件夹；已经写出去的备份文件不动 */
export async function forgetFolderBackupFolder(): Promise<void> {
  const store = await resolveHandleStore();
  if (store !== null) await store.remove();
}

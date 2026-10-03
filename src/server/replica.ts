/**
 * 副本存储：`replica.json` 的内存模型、载入与原子落盘。
 *
 * 形状沿用备份信封，另加一个 `sync` 段。**`data` 段的键严格等于 `BACKUP_MODULES`**
 * （23 条，见 `config.ts` 的 `SYNC_MODULES`）—— 一个不多、一个不少，没有例外行。
 * `settings`（主题 / 皮肤 / 密度 / 侧栏折叠）**不在其中**：它是每台设备各自的 UI 状态，
 * 一份共享副本装谁的都是随机的（定案见 spec「`settings` 键不进副本」）。
 *
 * 多出来的 `sync` 键会被客户端导入路径忽略（`parseBackup` 只挑它认识的模块名），
 * 所以副本文件**可以当备份导入**；但它不是逐字段完整的备份（少了 `settings` 那几项）。
 *
 * 服务端**不校验业务字段**：zod schema 是客户端的资产，把它 import 进来会把服务端
 * 绑死在客户端构建链上，与「独立进程、零依赖」相冲。这里只做结构守卫。
 */
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { SERVER_SCHEMA_VERSION, SYNC_MODULES } from './config.ts';

/** 副本文件名。工单 07 往 mirrorDir 写的那份叫 `life-manager-server-replica.json`，是另一个东西。 */
export const REPLICA_FILE = 'replica.json';
export const BACKUPS_DIR = 'backups';

/** 墓碑：整条记录被删的占位。**只服务于「整条记录」的删除**（打卡那种内嵌映射不产生墓碑）。 */
export interface Tombstone {
  module: string;
  key: string;
  rev: number;
  deletedAt: string;
}

/** 已注册的设备。工单 05 用它判断「所有设备都拉过没有」。 */
export interface DeviceRecord {
  deviceId: string;
  label: string;
  lastSeenAt: string;
  lastSeq: number;
}

export interface SyncMeta {
  /** 全局单调递增的变更序号，增量拉取的游标 */
  seq: number;
  /** 墓碑被物理清掉到哪个 seq（单调不减）。工单 05 维护 */
  purgedThroughSeq: number;
  /** 每条记录当前的 rev：`module:key` → rev */
  rev: Record<string, number>;
  tombstones: Tombstone[];
  devices: DeviceRecord[];
}

export interface ReplicaEnvelope {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  data: Record<string, Array<Record<string, unknown>>>;
  sync: SyncMeta;
}

/** 失败的两种原因分开：调用方要能分辨「文件坏了」与「客户端太新」。 */
export type ReplicaError =
  | { kind: 'schema_too_new'; clientVersion: number; serverVersion: number }
  | { kind: 'unknown_module'; module: string }
  | { kind: 'bad_record'; module: string; reason: string };

export interface Replica {
  /**
   * 当前信封。**直接改它**（`replica.envelope.sync.seq += 1`）然后 `save()` ——
   * 工单 03–05 就是这么用的。`isDirty` 靠与载入时的快照比对得出，所以不必手工标脏。
   */
  envelope: ReplicaEnvelope;
  /** 落盘。写失败会抛出（调用方决定是告警还是中止） */
  save: () => void;
  /**
   * 带版本守卫的落盘：客户端声明的 `schemaVersion` 高于服务端支持值时**不写盘**，
   * 返回错误。工单 03 的 push 走这个入口。
   *
   * 「拒绝时副本逐字节不变」是验收里明写的一条 —— 所以这里在写之前返回，
   * 而不是写完再回滚（回滚会短暂暴露出被污染的内容，且失败时可能回不去）。
   */
  saveChecked: (clientSchemaVersion: unknown) => ReplicaError | null;
  /** 相对载入时是否有改动 */
  isDirty: () => boolean;
}

/**
 * 文件系统适配器。
 *
 * 可注入是**测试的硬需求**，不是洁癖：工单 02 的验收要求「注入一个在 `rename` 前抛错的
 * fs 适配器 → 副本仍是上一个好版本」。没有这个接缝，就只能靠真去制造磁盘故障来测原子性。
 */
export interface FsAdapter {
  exists: (path: string) => boolean;
  readFile: (path: string) => string;
  writeFileSync: (path: string, contents: string) => void;
  /** 建目录（递归） */
  mkdirp: (path: string) => void;
  rename: (from: string, to: string) => void;
  /** 打开、fsync、关闭一个文件；原子写要靠它保证内容真的落到盘上 */
  fsyncFile: (path: string) => void;
  /** 列目录。救援路径（从 backups/ 顶替）要用它，所以它必须在接缝里 ——
   *  否则注入替身时那一步会偷偷读到真磁盘，救援路径就测不了。 */
  readdir: (path: string) => string[];
}

/** 真 fs 适配器。原子写的顺序：临时文件 → fsync → rename。 */
export const nodeFs: FsAdapter = {
  exists: (path) => existsSync(path),
  readFile: (path) => readFileSync(path, 'utf8'),
  writeFileSync: (path, contents) => {
    const fd = openSync(path, 'w');
    try {
      writeSync(fd, contents);
    } finally {
      closeSync(fd);
    }
  },
  mkdirp: (path) => {
    mkdirSync(path, { recursive: true });
  },
  rename: (from, to) => renameSync(from, to),
  fsyncFile: (path) => {
    const fd = openSync(path, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  },
  readdir: (path) => readdirSync(path).map(String),
};

/** 空副本：`seq = 0`，`data` 段每个模块都是空数组，一个不多一个不少。 */
export function emptyReplica(now: Date = new Date()): ReplicaEnvelope {
  const data: Record<string, Array<Record<string, unknown>>> = {};
  for (const module of SYNC_MODULES) data[module] = [];
  return {
    app: 'life-manager',
    schemaVersion: SERVER_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data,
    sync: { seq: 0, purgedThroughSeq: 0, rev: {}, tombstones: [], devices: [] },
  };
}

/**
 * `module:key` → rev 表的键。
 *
 * 工单 02 自己不用它（还没有写入路径），但 `sync.rev` 的形状在这里一次定好，
 * 工单 03–05 读写 rev 表时必须用同一个拼法 —— 所以定在这里，不留到各自去拼。
 */
export function revKey(module: string, key: string): string {
  return `${module}:${key}`;
}

/**
 * 这两类**不是「带 `id` 的记录」**，key 的取法单独定死（spec「同步单位」表后）：
 *
 * - `dietGoals` 是**模块单值**：整个模块就一份 `{calories, protein}`，key 固定为模块名本身，
 *   整块替换、不产生 `delete`（清空等于写回默认目标）。
 * - `dietWater` 是**日期键映射**：key 是日期串（如 `2026-10-02`），值是该天杯数。
 *
 * 它们的结构守卫只查「key 是非空字符串 + 值是 JSON」，**不要求有 `id`** ——
 * 套用记录那套会让客户端**每一次**推饮水/目标都被拒（实测过：这是最容易漏的一处）。
 */
export const KEYED_MODULES: readonly string[] = ['dietWater', 'dietGoals'];

/** 这个模块是不是「不是记录数组」的那两类。 */
export function isKeyedModule(module: string): boolean {
  return KEYED_MODULES.includes(module);
}

/** `dietGoals` 的 key 固定为模块名本身（spec 定死）。 */
export const DIET_GOALS_KEY = 'dietGoals';

/**
 * 结构守卫：**不校验业务字段**。
 *
 * 记录类模块只查三件事：模块名在册、`id` 是非空字符串、记录是对象。其余字段原样存。
 * 两个 keyed 模块（饮水 / 目标）另按上一条走：不要求 `id`。
 * 理由见文件头 —— 服务端拿不到客户端的 zod schema，也没有能力做用户可读的修复；
 * 坏记录的兜底是「客户端推之前先过自己的 schema」+ 服务端的每日快照与历史版本。
 */
export function validateRecord(module: string, record: unknown): ReplicaError | null {
  if (!(SYNC_MODULES as readonly string[]).includes(module)) {
    return { kind: 'unknown_module', module };
  }
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return { kind: 'bad_record', module, reason: '记录应为对象' };
  }
  // keyed 模块（饮水按日期、目标按模块名）：没有 id 是正常的，到此为止
  if (isKeyedModule(module)) return null;

  const id = (record as Record<string, unknown>).id;
  if (typeof id !== 'string' || id.trim() === '') {
    return { kind: 'bad_record', module, reason: 'id 应为非空字符串' };
  }
  return null;
}

/** 客户端声明的版本高于服务端支持值 → 拒绝。低了就接受（缺字段由客户端的归一化层补齐）。 */
export function checkSchemaVersion(clientVersion: unknown): ReplicaError | null {
  if (typeof clientVersion !== 'number' || !Number.isFinite(clientVersion)) {
    // 没声明版本：当作最低版本处理，缺字段由客户端归一化补齐
    return null;
  }
  if (clientVersion > SERVER_SCHEMA_VERSION) {
    return {
      kind: 'schema_too_new',
      clientVersion,
      serverVersion: SERVER_SCHEMA_VERSION,
    };
  }
  return null;
}

/**
 * 把读到的东西收敛成合法信封。
 *
 * 损坏 / 缺字段时**尽量保留已有数据**（与客户端 `migrateState` 的取向一致：
 * 只补齐缺字段，绝不因为一处坏就丢掉整份）。`data` 段总是补齐成 23 个键。
 */
function coerceEnvelope(raw: unknown): {
  envelope: ReplicaEnvelope;
  recovered: boolean;
  /** 被剔掉的畸形条目（模块 → 条数）。调用方负责告警，绝不能静默 */
  dropped: Array<{ module: string; count: number }>;
} {
  const blank = emptyReplica();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { envelope: blank, recovered: true, dropped: [] };
  }
  const root = raw as Record<string, unknown>;
  const rawData =
    typeof root.data === 'object' && root.data !== null && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : {};

  let recovered = root.app !== 'life-manager';
  const data: Record<string, Array<Record<string, unknown>>> = {};
  /** 被剔掉的畸形条目：数目与所在模块。**必须告警** —— 静默丢数据是本仓库的头号禁忌 */
  const dropped: Array<{ module: string; count: number }> = [];
  for (const module of SYNC_MODULES) {
    const value = rawData[module];
    if (Array.isArray(value)) {
      const kept = value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      );
      if (kept.length !== value.length) {
        dropped.push({ module, count: value.length - kept.length });
      }
      data[module] = kept;
    } else {
      data[module] = [];
      // 模块缺失不算「损坏」：legacy 副本或刚建的都这样
    }
  }
  // 不在册的键（例如 settings）直接丢掉 —— 它们本来就不该在副本里
  if (Object.keys(rawData).some((key) => !(SYNC_MODULES as readonly string[]).includes(key))) {
    recovered = true;
  }

  const rawSync =
    typeof root.sync === 'object' && root.sync !== null && !Array.isArray(root.sync)
      ? (root.sync as Record<string, unknown>)
      : {};
  const seq = typeof rawSync.seq === 'number' && rawSync.seq >= 0 ? Math.floor(rawSync.seq) : 0;
  const purged =
    typeof rawSync.purgedThroughSeq === 'number' && rawSync.purgedThroughSeq >= 0
      ? Math.floor(rawSync.purgedThroughSeq)
      : 0;

  const schemaVersion =
    typeof root.schemaVersion === 'number' && Number.isFinite(root.schemaVersion)
      ? root.schemaVersion
      : SERVER_SCHEMA_VERSION;
  return {
    envelope: {
      app: 'life-manager',
      schemaVersion,
      exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : blank.exportedAt,
      data,
      sync: {
        seq,
        purgedThroughSeq: purged,
        rev: isPlainObject(rawSync.rev) ? (rawSync.rev as Record<string, number>) : {},
        tombstones: Array.isArray(rawSync.tombstones)
          ? (rawSync.tombstones.filter(
              (item): item is Tombstone =>
                typeof item === 'object' && item !== null && !Array.isArray(item),
            ) as Tombstone[])
          : [],
        devices: Array.isArray(rawSync.devices)
          ? (rawSync.devices.filter(
              (item): item is DeviceRecord =>
                typeof item === 'object' && item !== null && !Array.isArray(item),
            ) as DeviceRecord[])
          : [],
      },
    },
    recovered: recovered || dropped.length > 0,
    dropped,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 副本文件与本目录下的 backups/ 路径。 */
export function replicaPaths(dataDir: string): {
  replica: string;
  backupsDir: string;
} {
  return { replica: join(dataDir, REPLICA_FILE), backupsDir: join(dataDir, BACKUPS_DIR) };
}

export interface LoadOptions {
  dataDir: string;
  fs?: FsAdapter;
  /** 时钟可注入，测试才能拿到稳定的 `exportedAt` */
  now?: () => Date;
  /** 载入时发现问题（半写文件、坏副本）时调一次，由调用方决定记日志还是告警 */
  onWarn?: (message: string) => void;
}

export interface LoadResult {
  replica: Replica;
  /** 副本文件是新生成的（而不是读出来的） */
  created: boolean;
}

/**
 * 载入副本；不存在就生成一份空的并落盘。
 *
 * **半写文件的处理**：`replica.json` 解析不出来时，退到 `backups/` 里最近一份好备份顶上，
 * 并告警。都不可用时才落回空副本 —— 那等于丢数据，所以这一步一定会告警（不能静默）。
 */
export function loadReplica(options: LoadOptions): LoadResult {
  const fs = options.fs ?? nodeFs;
  const now = options.now ?? (() => new Date());
  const { replica: replicaPath, backupsDir } = replicaPaths(options.dataDir);

  fs.mkdirp(options.dataDir);

  let envelope: ReplicaEnvelope;
  let created = false;
  /** 磁盘上那份有问题、已被救援或收敛 —— 需要立刻写回一份干净的 */
  let repaired = false;

  if (!fs.exists(replicaPath)) {
    envelope = emptyReplica(now());
    created = true;
    // 副本不存在，但 backups/ 里有东西 —— 说明以前有过数据、副本却不见了。
    // 这是「静默丢数据」唯一还剩的形状，必须说一声（正常首启时 backups/ 是空的）。
    if (fs.exists(backupsDir)) {
      options.onWarn?.(
        '副本文件不存在，但 backups/ 里有历史备份 —— 若这不是首次启动，说明副本丢了，请检查数据目录',
      );
    }
  } else {
    // 读不到也不能抛出去：权限、文件锁（Windows 常见）、路径是个目录，都会在这里失败。
    // 与「解析失败」走同一条救援路径 —— 同一类故障不该有两种待遇。
    let raw: string | null = null;
    try {
      raw = fs.readFile(replicaPath);
    } catch (error) {
      options.onWarn?.(
        `副本文件读不出来（${error instanceof Error ? error.message : String(error)}），将尝试用备份顶替`,
      );
    }

    let parsed: unknown = null;
    let parseFailed = raw === null;
    if (raw !== null) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parseFailed = true;
      }
    }

    if (parseFailed) {
      const rescued = rescueFromBackups(fs, backupsDir);
      if (rescued) {
        options.onWarn?.(`副本文件解析失败（半写文件？），已用最近一份备份顶上：${rescued.name}`);
        envelope = rescued.envelope;
      } else {
        options.onWarn?.(
          '副本文件解析失败，且 backups/ 里没有可用备份；已回退为空副本（数据可能已丢）',
        );
        envelope = emptyReplica(now());
      }
      repaired = true;
    } else {
      const { envelope: coerced, recovered, dropped } = coerceEnvelope(parsed);
      // 副本比本服务端新：**照样载入**（数据比版本标签重要），但要说一声 ——
      // 否则旧服务端会拿自己的版本号盖掉新版标注，静默降级没人知道。
      if (coerced.schemaVersion > SERVER_SCHEMA_VERSION) {
        options.onWarn?.(
          `副本的 schemaVersion 是 ${coerced.schemaVersion}，高于本服务端支持的 ` +
            `${SERVER_SCHEMA_VERSION} —— 已照常载入，但建议先升级服务端再写入`,
        );
      }
      if (recovered) {
        options.onWarn?.('副本结构不完整或含不在册的模块，已按可读部分收敛');
        repaired = true;
      }
      // 剔掉的畸形条目必须单独说清是哪些模块、几条 —— 静默丢数据是本仓库的头号禁忌
      if (dropped.length > 0) {
        const detail = dropped.map((item) => `${item.module} ${item.count} 条`).join('、');
        options.onWarn?.(`副本里有 ${detail} 不是合法对象，已剔除（这些记录丢了）`);
        repaired = true;
      }
      envelope = coerced;
    }
  }

  const replica = makeReplica(envelope, replicaPath, fs, now);
  // 首次生成、或救援成功后**立刻把修好的内容写回去**：
  // 不然磁盘上一直留着那份半写文件，下次启动又要再救一遍；
  // 而且「启动后副本等于那份备份」这条验收只对内存模型成立、对文件不成立，是骗人的。
  if (created || repaired) {
    try {
      replica.save();
    } catch (error) {
      // 写不回去不是致命的（内存里已经是好数据），但必须说一声
      options.onWarn?.(
        `修好的副本写不回去：${error instanceof Error ? error.message : String(error)}（内存里已是好数据，磁盘上仍是坏文件）`,
      );
    }
  }
  return { replica, created };
}

/** 从 backups/ 取最近一份能解析的备份（文件名按时间排序，取最后一个好的）。 */
function rescueFromBackups(
  fs: FsAdapter,
  backupsDir: string,
): { name: string; envelope: ReplicaEnvelope } | null {
  if (!fs.exists(backupsDir)) return null;
  let names: string[];
  try {
    names = fs.readdir(backupsDir).filter((name) => name.endsWith('.json'));
  } catch {
    return null;
  }
  // 文件名形如 `replica-<ISO>.json`，字典序即时间序
  for (const name of names.sort().reverse()) {
    const path = join(backupsDir, name);
    try {
      const parsed = JSON.parse(fs.readFile(path)) as unknown;
      const { envelope } = coerceEnvelope(parsed);
      return { name, envelope };
    } catch {
      // 这份也坏了，继续往前找
    }
  }
  return null;
}

function makeReplica(
  envelope: ReplicaEnvelope,
  replicaPath: string,
  fs: FsAdapter,
  now: () => Date,
): Replica {
  /**
   * 脏判定的基准：**排除 `exportedAt`**。
   *
   * 它是落盘时盖的时间戳（簿记），不是用户数据 —— 每存一次都会变。若把它算进去，
   * `save()` 之后必然「仍然脏」，工单 07 的去抖镜像写入就会每 30 秒无条件重写一次
   * 第二份副本，在同步盘上变成一个上传循环（ADR-0002 警告过的那种成本）。
   *
   * 用值语义（序列化后比对）而不是手工标脏：改回去也算干净，调用方不必记着复位。
   */
  const fingerprint = (target: ReplicaEnvelope): string =>
    JSON.stringify({ ...target, exportedAt: '' });

  let loaded = fingerprint(envelope);

  const replica: Replica = {
    envelope,
    isDirty: () => fingerprint(replica.envelope) !== loaded,
    save: () => {
      replica.envelope.exportedAt = now().toISOString();
      atomicWrite(fs, replicaPath, JSON.stringify(replica.envelope, null, 2));
      // 存完就把基准刷新到当前状态，否则 isDirty 永远为真
      loaded = fingerprint(replica.envelope);
    },
    saveChecked: (clientSchemaVersion) => {
      const error = checkSchemaVersion(clientSchemaVersion);
      // 拒绝时**一个字节都不写** —— 临时文件都不建，免得留下痕迹
      if (error !== null) return error;
      replica.save();
      return null;
    },
  };
  return replica;
}

/**
 * 原子写：临时文件 → fsync → rename。
 *
 * `rename` 在同一文件系统内是原子的，所以任何时刻磁盘上的 `replica.json` 要么是旧的完整内容、
 * 要么是新的完整内容，不会是半截。fsync 是为了让内容真的落盘再改名 —— 只 rename 不 fsync
 * 时断电可能留下一个「名字对、内容是空的」文件。
 *
 * 失败时**不动目标文件**：临时文件残留没关系（下次覆盖），目标仍是上一个好版本。
 *
 * **fsync 失败不抛**：某些文件系统不支持（网络盘、部分同步盘目录），拿它当致命错误会让
 * 整个服务写不进去 —— 那比「可能丢最近一次写入」更糟。但真 fsync 失败（EIO / ENOSPC）
 * 也走这条路径，所以调用方应当把日志里的 `replica.save 失败` 当成需要人看的信号。
 */
export function atomicWrite(fs: FsAdapter, targetPath: string, contents: string): void {
  const tempPath = `${targetPath}.tmp`;
  fs.writeFileSync(tempPath, contents);
  try {
    fs.fsyncFile(tempPath);
  } catch {
    // 见上：不支持 fsync 的文件系统不该让写入失败，顺序（先写后改名）本身已经保证不半截
  }
  fs.rename(tempPath, targetPath);
}

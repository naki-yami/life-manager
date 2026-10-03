/**
 * push：唯一的写入口。
 *
 * 三条语义在这里定死（spec「幂等」与「冲突：按条目 LWW，服务端定序」）：
 *
 * 1. **rev 只在服务端赋值** —— 客户端时钟永远不参与比较。没有 `updatedAt` 可用（ADR-0002
 *    记过：只有写作 / 复盘 / 日记三类记录有，且多处 `updateX` 直接绕过），所以第一版靠
 *    「内容哈希基线」找改动，重推是常态、不是异常。
 * 2. **幂等**：`op: 'put'` 且内容与现存记录**完全一致** → `noop`，不产生新 rev、不写历史、
 *    `seq` 不变。这是「重推是常态」能成立的前提。
 * 3. **冲突**：`baseRev < 服务端当前 rev` → **仍然接受**（后到者赢，拿到更大的新 rev），
 *    但结果标 `conflict`，被覆盖的那一份进历史。客户端收到只提示一行，不阻塞。
 *
 * 第 3 条「总是接受」不会酿成灾难，前提是**客户端只推自己改过的条目**（基线哈希差集），
 * 不推全量 —— 一台离线一个月的设备回来时，动的是它真改过的那几十条。
 */
import { SYNC_MODULES } from './config.ts';
import {
  checkSchemaVersion,
  DIET_GOALS_KEY,
  isKeyedModule,
  revKey,
  validateRecord,
  type Replica,
  type ReplicaError,
} from './replica.ts';

/**
 * 一次改动。`record` 在 `op: 'delete'` 时可以不带（墓碑归工单 05）。
 *
 * `baseRev` 是必填的（HTTP 层会拒掉缺失的请求），但 `handlePush` 自己也把 `undefined`
 * 当作 0 显式处理 —— 两条路径对同一份输入给出同一结论，免得直接调 `handlePush` 的调用方
 * （测试、工单 06 的 restore）踩到「undefined < 0 恒为 false，于是永远不算冲突」。
 */
export interface PushChange {
  module: string;
  key: string;
  baseRev: number;
  op: 'put' | 'delete';
  record?: Record<string, unknown>;
}

export interface PushRequest {
  deviceId: string;
  baseSeq?: number;
  schemaVersion?: number;
  changes: PushChange[];
}

/** 单条改动的结果。`applied` = 真的写进去了；`noop` = 内容没变；`conflict` = 覆盖了别人的版本。 */
export type ChangeOutcome = 'applied' | 'noop' | 'conflict' | 'rejected';

export interface ChangeResult {
  module: string;
  key: string;
  outcome: ChangeOutcome;
  /** 服务端赋值后的 rev；被拒时是当前 rev（或 0） */
  rev: number;
  /** 仅 `rejected` 时有值：为什么拒 */
  error?: string;
}

export interface PushResponse {
  /** 处理完这一批之后的全局 seq */
  seq: number;
  results: ChangeResult[];
  /** 这一批里有多少条是覆盖（用于客户端那行提示与日志统计） */
  conflicts: number;
}

/** 历史里的一条旧版本。落盘（`history.jsonl`）归工单 06，这里先给出形状与内存队列。 */
export interface HistoryEntry {
  module: string;
  key: string;
  rev: number;
  /** 被覆盖的那份记录；`delete` 覆盖时为 null（表示「那时它不存在」） */
  record: Record<string, unknown> | null;
  replacedAt: string;
  reason: 'conflict' | 'overwritten';
}

/** 历史接收器。工单 06 会换成「追加写 history.jsonl + 30 天保留」。 */
export type HistorySink = (entry: HistoryEntry) => void;

export interface PushContext {
  replica: Replica;
  now?: () => Date;
  /** 历史落点。默认什么都不做 —— 工单 06 接上 */
  onHistory?: HistorySink;
  /** 可选日志。HTTP 层传入；纯逻辑测试可以不传。 */
  logger?: { warn: (message: string) => void };
}

/**
 * 「朴素对象」判定：原型必须是 `Object.prototype` 或 `null`。
 *
 * **不能只写 `typeof === 'object' && !Array.isArray`** —— 那样 `Date` / `Map` / `Set` / `RegExp`
 * 都会被算成对象，而它们的 `Object.keys()` 是**空数组**，于是「两个不同的 Date」会判为相等，
 * 真实改动被当成 `noop` 丢掉（实测过）。走 HTTP 时 JSON 不会产出这些类型，所以这是潜伏缺陷；
 * 但直接调 `handlePush` 的调用方（包括工单 06 的 restore 路径）会踩到。
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
};

/** 内容相等：键序无关的深比较。用它判幂等 —— 客户端重推时键序可能不同，但内容一样。 */
export function sameContent(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): boolean {
  if (a === b) return true;
  if (!isPlainObject(a) || !isPlainObject(b)) return false;

  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return false;
    if (!sameValue(a[aKeys[i]!], b[bKeys[i]!])) return false;
  }
  return true;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isPlainObject(a) && isPlainObject(b)) return sameContent(a, b);
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  }
  // Date / RegExp / Map / Set 的内部状态不看 `Object.keys()`（都是空数组），
  // 所以必须逐个显式比 —— 尤其 Map/Set 的 JSON.stringify 都是 `{}`，光靠序列化仍会误判相等。
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }
  if (a instanceof Map && b instanceof Map) {
    return (
      a.size === b.size && [...a.entries()].every(([k, v]) => b.has(k) && sameValue(v, b.get(k)))
    );
  }
  if (a instanceof Set && b instanceof Set) {
    return a.size === b.size && [...a].every((item) => b.has(item));
  }
  // 其余非朴素对象（函数、类实例…）退回序列化比较。走 HTTP 时不会出现这些类型。
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * keyed 模块在 `data` 段里怎么存。
 *
 * 记录类模块存记录本身（identity 在 `id` 里）；keyed 模块的值里**没有身份信息**
 * （饮水是 `{glasses: 8}`、目标是 `{calories, protein}`），所以存的时候把 key 一并带上 ——
 * 否则从副本里读不回来「这 8 杯是哪一天的」。`rev` 表也按同一个 key 记账，两处一致。
 */
function incomingForStore(
  keyed: boolean,
  key: string,
  record: Record<string, unknown>,
): Record<string, unknown> {
  return keyed ? { ...record, key } : record;
}

/** 在当前模块数组里找一条记录的下标。 */
function indexOfRecord(records: Array<Record<string, unknown>>, key: string): number {
  return records.findIndex((record) => record.id === key);
}

/**
 * keyed 模块（饮水 / 目标）在 `data` 段里不是「一条条记录」，而是自带 `key` 的单元。
 * 找法因此与记录类不同。
 */
function indexOfKeyed(
  records: Array<Record<string, unknown>>,
  module: string,
  key: string,
): number {
  if (module === DIET_GOALS_KEY) {
    // 模块单值：整个模块只有一项
    return records.findIndex((record) => record.key === key || records.length === 1);
  }
  return records.findIndex((record) => record.key === key);
}

/** keyed 模块的 key 拼法（spec 定死）：目标固定用模块名，饮水必须是日期串。 */
function validateKeyedKey(module: string, key: string): string | null {
  if (module === DIET_GOALS_KEY && key !== DIET_GOALS_KEY) {
    return `${module} 的 key 固定为模块名本身，收到的是「${key}」`;
  }
  if (module === 'dietWater' && !/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return `${module} 的 key 应为日期串（YYYY-MM-DD），收到的是「${key}」`;
  }
  return null;
}

/**
 * 处理一次 push。
 *
 * 逐条处理、互不影响：一条被拒不会拖累同批其它条目（验收明写）。
 * 整批只落盘一次 —— 逐条写盘在磁盘上会放大失败面，且没必要。
 */
export function handlePush(context: PushContext, request: PushRequest): PushResponse {
  const { replica } = context;
  const now = context.now ?? (() => new Date());
  const envelope = replica.envelope;
  const results: ChangeResult[] = [];
  let conflicts = 0;

  // 客户端声明的版本高于服务端支持值 → 整批拒绝，**一个字节都不写**（工单 02 的 saveChecked 同理）
  const versionError: ReplicaError | null = checkSchemaVersion(request.schemaVersion);
  if (versionError !== null && versionError.kind === 'schema_too_new') {
    return {
      seq: envelope.sync.seq,
      conflicts: 0,
      results: request.changes.map((change) => ({
        module: change.module,
        key: change.key,
        outcome: 'rejected' as const,
        rev: currentRev(envelope.sync.rev, change.module, change.key),
        error: `schemaVersion ${versionError.clientVersion} 高于服务端支持的 ${versionError.serverVersion}，请先升级服务端`,
      })),
    };
  }

  // 设备表在整批处理**之后**再登记（见文件末尾）—— 见那里的注释：
  // 一个从没成功写过任何东西的设备不该被算成「已注册」。

  for (const change of request.changes) {
    const key = revKey(change.module, change.key);
    // `baseRev` 缺失时按 0（= 客户端认为服务端还没有这条）—— 显式归一，不靠
    // `undefined < 0 === false` 这种巧合，否则缺失会被当成「不落后」而永远不标冲突。
    const baseRev = typeof change.baseRev === 'number' ? change.baseRev : 0;

    if (!(SYNC_MODULES as readonly string[]).includes(change.module)) {
      results.push({
        module: change.module,
        key: change.key,
        outcome: 'rejected',
        rev: 0,
        error: `模块名不在册：${change.module}`,
      });
      continue;
    }

    const records = envelope.data[change.module]!;
    const keyed = isKeyedModule(change.module);
    // 记录类模块按 `id` 找；饮水（日期键）与目标（模块单值）按各自定的 key 找
    const index = keyed
      ? indexOfKeyed(records, change.module, change.key)
      : indexOfRecord(records, change.key);
    const existing = index >= 0 ? records[index]! : null;
    const rev = typeof envelope.sync.rev[key] === 'number' ? envelope.sync.rev[key]! : 0;

    if (change.op === 'delete') {
      // 墓碑的生命周期归工单 05；这里只处理「已经在服务端的记录被删」这一半。
      if (existing === null) {
        results.push({ module: change.module, key: change.key, outcome: 'noop', rev });
        continue;
      }

      /*
       * 删除同样参与 LWW 判定 —— **这一条曾经漏掉，会静默毁掉更新的记录**：
       * B 端只见过 v1，它拿 baseRev=0 来删，而服务端已经是 v2（rev 2）。
       * 不做这条判定，B 的删除会把 A 更新的 v2 直接抹掉、还回 `applied`，客户端不会看到任何提示
       * —— 正是 ADR-0002 排在最高优先级的「同步导致记录丢失」。
       *
       * 判定与 put 完全一致：baseRev 落后就仍然执行（后到的删赢），但标 conflict，
       * 让客户端知道「你删的时候服务端已经有更新的版本了，那份已进历史」。
       */
      const deleteConflict = baseRev < rev;
      pushHistory(context, {
        module: change.module,
        key: change.key,
        rev,
        record: existing,
        replacedAt: now().toISOString(),
        reason: deleteConflict ? 'conflict' : 'overwritten',
      });
      if (deleteConflict) conflicts += 1;
      records.splice(index, 1);
      envelope.sync.rev[key] = rev + 1;
      envelope.sync.seq += 1;
      results.push({
        module: change.module,
        key: change.key,
        outcome: deleteConflict ? 'conflict' : 'applied',
        rev: rev + 1,
      });
      continue;
    }

    // op: 'put' —— 结构守卫沿用工单 02；不过就整条拒，不影响同批其它条目
    const guard = validateRecord(change.module, change.record);
    if (guard !== null) {
      results.push({
        module: change.module,
        key: change.key,
        outcome: 'rejected',
        rev,
        error: guard.kind === 'bad_record' ? guard.reason : `模块名不在册：${change.module}`,
      });
      continue;
    }
    const incoming = change.record!;

    // 记录里的 id 必须与 key 一致，否则会在数组里造出「两条同 id」或找不到的幽灵记录。
    // keyed 模块（饮水 / 目标）没有 id 这个概念，跳过这条。
    if (!keyed && incoming.id !== change.key) {
      results.push({
        module: change.module,
        key: change.key,
        outcome: 'rejected',
        rev,
        error: `record.id 与 key 不一致（id=${String(incoming.id)}）`,
      });
      continue;
    }

    // keyed 模块的 key 必须与规定的一致：目标只能用模块名，饮水只能用日期串。
    // 不收这条，客户端把一个拼错的 key 推上来会在副本里堆出无数个「幽灵单元」。
    if (keyed) {
      const keyProblem = validateKeyedKey(change.module, change.key);
      if (keyProblem !== null) {
        results.push({
          module: change.module,
          key: change.key,
          outcome: 'rejected',
          rev,
          error: keyProblem,
        });
        continue;
      }
    }

    // 幂等：内容完全一致 → noop。不产生新 rev、不写历史、seq 不变。
    // keyed 模块存的是「带 key 的单元」，所以比对时要拿同一形状比，否则永远不相等。
    if (existing !== null && sameContent(existing, incomingForStore(keyed, change.key, incoming))) {
      results.push({ module: change.module, key: change.key, outcome: 'noop', rev });
      continue;
    }

    const isConflict = existing !== null && baseRev < rev;
    if (isConflict) {
      pushHistory(context, {
        module: change.module,
        key: change.key,
        rev,
        record: existing,
        replacedAt: now().toISOString(),
        reason: 'conflict',
      });
      conflicts += 1;
    }

    const stored = incomingForStore(keyed, change.key, incoming);
    if (index >= 0) records[index] = stored;
    else records.push(stored);
    envelope.sync.rev[key] = rev + 1;
    envelope.sync.seq += 1;
    results.push({
      module: change.module,
      key: change.key,
      outcome: isConflict ? 'conflict' : 'applied',
      rev: rev + 1,
    });
  }

  /*
   * 设备表：只为**真的写进去过东西**的设备登记。
   *
   * 为什么不能无条件登记：工单 05 的墓碑清理守卫是「**所有已注册设备**都拉过 ≥ 该墓碑的 seq」。
   * 一个整批都被拒、从没成功写过的设备如果被登记成「已注册」，它永远不会来拉，
   * 墓碑就永远清不掉 —— 一个拼错 deviceId 的客户端足以让墓碑无限堆积。
   */
  const wroteSomething = results.some(
    (item) => item.outcome === 'applied' || item.outcome === 'conflict',
  );
  if (wroteSomething) {
    touchDevice(envelope, request.deviceId, now(), envelope.sync.seq);
  }

  return { seq: envelope.sync.seq, conflicts, results };
}

function currentRev(revTable: Record<string, number>, module: string, key: string): number {
  const value = revTable[revKey(module, key)];
  return typeof value === 'number' ? value : 0;
}

function pushHistory(context: PushContext, entry: HistoryEntry): void {
  context.onHistory?.(entry);
}

/** 设备表：没有就登记，有就更新 `lastSeenAt`。`lastSeq` 由调用方在整批处理后写。 */
/** 设备表：没有就登记，有就更新 `lastSeenAt` 与 `lastSeq`（都取整批处理后的 seq）。 */
function touchDevice(envelope: Replica['envelope'], deviceId: string, at: Date, seq: number): void {
  const existing = envelope.sync.devices.find((item) => item.deviceId === deviceId);
  if (existing) {
    existing.lastSeenAt = at.toISOString();
    existing.lastSeq = seq;
    return;
  }
  envelope.sync.devices.push({
    deviceId,
    label: '',
    lastSeenAt: at.toISOString(),
    lastSeq: seq,
  });
}

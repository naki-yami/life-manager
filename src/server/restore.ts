/**
 * `POST /v1/restore`：从每日备份或历史条目取回一版数据。
 *
 * **核心不变量：恢复不倒退 `seq`、不改已有 rev**（工单 06 的定案）。
 * 把那一版当成**一次新的写入集**写回 —— 每条记录拿新 rev、分配新 seq。
 *
 * 为什么不能图省事直接 `seq = 0` 或回退：在线设备的 `lastSeq` 会永远大于新 `seq`，
 * 它们的增量拉取再也不会返回任何东西，而本地那份是旧的 —— 静默停在旧状态。
 * 当成新写入集之后，恢复本身也变成一条正常的变更，所有设备自然收敛，不需要「游标失效」的约定。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SYNC_MODULES } from './config.ts';
import { isKeyedModule, DIET_GOALS_KEY, emptyModuleValue, type Replica } from './replica.ts';
import { readHistory, writeDailyBackup, type HistoryRecord } from './history.ts';

export type RestoreSource = 'backup' | 'history';

export interface RestoreRequest {
  confirm?: unknown;
  source?: unknown;
  ref?: unknown;
}

export interface RestoreOk {
  ok: true;
  /** 恢复之后新的 seq（必然大于恢复前） */
  seq: number;
  /** 恢复了多少条记录 */
  restored: number;
  /** 落回之前那份副本存到了哪个备份文件 */
  safetyBackup: string;
}

export interface RestoreFail {
  ok: false;
  status: number;
  error: string;
}

/**
 * 校验请求。
 *
 * `confirm` 必须**逐字**等于 `'restore'` —— 这是防手滑，不是鉴权（鉴权在 HTTP 层）。
 */
export function validateRestoreRequest(body: RestoreRequest): RestoreFail | null {
  if (body.confirm !== 'restore') {
    return { ok: false, status: 400, error: "confirm 必须逐字等于 'restore'" };
  }
  if (body.source !== 'backup' && body.source !== 'history') {
    return { ok: false, status: 400, error: "source 应为 'backup' 或 'history'" };
  }
  if (typeof body.ref !== 'string' || body.ref.trim() === '') {
    return { ok: false, status: 400, error: 'ref 应为非空字符串' };
  }
  return null;
}

/** 读一份备份文件的 `data` 段。**必须在写安全备份之前调用**（同日会互相覆盖）。 */
function readBackupFile(
  dataDir: string,
  ref: string,
): { ok: true; backupData: Record<string, unknown> } | { ok: false; error: RestoreFail } {
  const path = join(dataDir, 'backups', ref);
  if (!existsSync(path)) {
    return { ok: false, error: { ok: false, status: 404, error: `没有这份备份：${ref}` } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { ok: false, error: { ok: false, status: 400, error: `备份文件读不出来：${ref}` } };
  }
  const target = (parsed as { data?: unknown }).data;
  if (typeof target !== 'object' || target === null || Array.isArray(target)) {
    return {
      ok: false,
      error: { ok: false, status: 400, error: `备份文件里没有 data 段：${ref}` },
    };
  }
  return { ok: true, backupData: target as Record<string, unknown> };
}

/** 读一条历史。**必须在写安全备份之前调用**。 */
function readHistoryEntries(
  dataDir: string,
  at: Date,
  ref: string,
): { ok: true; history: HistoryRecord[] } | { ok: false; error: RestoreFail } {
  const entries = readHistory(dataDir, at, ref);
  if (entries.length === 0) {
    return { ok: false, error: { ok: false, status: 404, error: `没有这条历史：${ref}` } };
  }
  return { ok: true, history: entries };
}

/** 从历史条目还原出「那一刻这条记录是什么」，再折算成要写回的模块数据。 */
function applyHistoryRecord(envelope: Replica['envelope'], entry: HistoryRecord): boolean {
  const module = entry.module;
  if (!(SYNC_MODULES as readonly string[]).includes(module)) return false;

  if (entry.record === null) {
    // 那次操作是删除 → 恢复成「不存在」
    if (isKeyedModule(module)) {
      envelope.data[module] = emptyModuleValue(module);
    } else {
      const records = envelope.data[module];
      if (Array.isArray(records)) {
        envelope.data[module] = records.filter((record) => record.id !== entry.key);
      }
    }
    return true;
  }

  if (isKeyedModule(module)) {
    envelope.data[module] = module === DIET_GOALS_KEY ? { ...entry.record } : { ...entry.record };
    return true;
  }
  const records = envelope.data[module];
  if (!Array.isArray(records)) return false;
  const index = records.findIndex((record) => record.id === entry.key);
  if (index >= 0) records[index] = { ...entry.record };
  else records.push({ ...entry.record });
  return true;
}

/**
 * 执行恢复。
 *
 * 步骤固定为：**先把当前副本存一份到 backups/**（否则恢复错了就没退路），
 * 再把目标版本当成一次新的写入集写回，每条分配新 rev 与新 seq。
 */
export function restoreReplica(
  replica: Replica,
  request: RestoreRequest,
  dataDir: string,
  now: () => Date = () => new Date(),
): RestoreOk | RestoreFail {
  const invalid = validateRestoreRequest(request);
  if (invalid !== null) return invalid;

  const source = request.source as RestoreSource;
  const ref = request.ref as string;
  const envelope = replica.envelope;

  /*
   * **先把要恢复的那一版读进来，再写安全备份** —— 顺序反了会毁掉恢复源。
   *
   * 踩过的坑：`writeDailyBackup` 按**日期**命名（同一天只留一份），所以「先写安全备份」
   * 会把今天那份备份覆盖成**当前**状态。若恢复源恰好就是今天那份（很常见：今天上午的
   * 备份、下午恢复），读到的已经是被覆盖后的内容 —— 用户以为回到了上午，实际拿到的是
   * 刚刚的坏状态，而且唯一那份备份也没了。
   */
  const sourceSnapshot =
    source === 'backup' ? readBackupFile(dataDir, ref) : readHistoryEntries(dataDir, now(), ref);
  if (!sourceSnapshot.ok) return sourceSnapshot.error;

  // 目标确认可读之后，再留退路：当前这份副本进 backups/
  const at = now();
  const safety = writeDailyBackup(dataDir, envelope, at);

  let restored = 0;

  if (source === 'backup') {
    const target = (sourceSnapshot as { ok: true; backupData: Record<string, unknown> }).backupData;
    for (const module of SYNC_MODULES) {
      const value = target[module];
      if (value === undefined) continue;
      envelope.data[module] = value as never;
      restored += 1;
    }
  } else {
    const entries = (sourceSnapshot as { ok: true; history: ReturnType<typeof readHistory> })
      .history;
    for (const entry of entries) {
      if (applyHistoryRecord(envelope, entry)) restored += 1;
    }
  }

  /*
   * 当成一次新的写入集：给**每条记录**分配新 rev、并各占一个新 seq，
   * 同时把变更写进日志 —— 这样在线设备的增量拉取会自然收敛到恢复后的状态。
   */
  for (const module of SYNC_MODULES) {
    const value = envelope.data[module];
    if (Array.isArray(value)) {
      for (const record of value) {
        const id = typeof record.id === 'string' ? record.id : '';
        if (id === '') continue;
        bump(envelope, module, id, record);
      }
    } else if (isKeyedModule(module)) {
      const holder = value as Record<string, unknown>;
      if (module === DIET_GOALS_KEY) {
        bump(envelope, module, DIET_GOALS_KEY, holder);
      } else {
        for (const [key, glasses] of Object.entries(holder)) {
          bump(envelope, module, key, { [key]: glasses });
        }
      }
    }
  }

  return { ok: true, seq: envelope.sync.seq, restored, safetyBackup: safety.name };
}

/** 一条记录占一个新 rev + 一个新 seq，并进变更日志。 */
function bump(
  envelope: Replica['envelope'],
  module: string,
  key: string,
  record: Record<string, unknown>,
): void {
  const revKey = `${module}:${key}`;
  const nextRev = (envelope.sync.rev[revKey] ?? 0) + 1;
  envelope.sync.rev[revKey] = nextRev;
  envelope.sync.seq += 1;
  envelope.sync.changes.push({
    seq: envelope.sync.seq,
    module,
    key,
    rev: nextRev,
    op: 'put',
    record,
  });
}

/**
 * 自带备份与历史 —— ADR 要求「不能只依赖客户端的自动快照」。
 *
 * 两样东西，用途不同：
 * - `backups/`：**每日一份整份副本**，保留 10 份。用于「服务端把数据搞坏了，回到某一天」。
 * - `history.jsonl`：**被 LWW 覆盖或删除的单条旧版本**，保留 30 天。用于
 *   「同步把某几条改坏了，把那一版捞回来」—— 粒度比每日快照细得多。
 *
 * 恢复**不倒退 `seq`、不改已有 rev**：把那一版当成一次新的写入集写回（每条拿新 rev、
 * 分配新 seq）。这样在线设备的增量拉取自然收敛到恢复后的状态，不需要任何「游标失效」约定。
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Replica } from './replica.ts';
import { nodeFs, type FsAdapter } from './replica.ts';

/** 每日备份留几份（与客户端 `MAX_AUTO_BACKUPS` 同量级）。 */
export const MAX_DAILY_BACKUPS = 10;
/** 历史条目留多久。 */
export const HISTORY_RETENTION_DAYS = 30;

export const HISTORY_FILE = 'history.jsonl';

/**
 * 历史里的一条。`id` 让 `/v1/restore` 能按 `ref` 寻址。
 *
 * 字段与 `push.ts` 的 `HistoryEntry` 对齐（`at` 对应那边的 `replacedAt`）——
 * 两处分开定义是因为 `history.ts` 这层管落盘、`push.ts` 那层管语义，
 * 但形状必须一致，否则接起来要到处做适配。
 */
export interface HistoryRecord {
  id: string;
  replacedAt: string;
  module: string;
  key: string;
  rev: number;
  /** 被覆盖的那份；删除时表示「删之前它是这样」 */
  record: Record<string, unknown> | null;
  reason: 'conflict' | 'overwritten';
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function historyPath(dataDir: string): string {
  return join(dataDir, HISTORY_FILE);
}

/** 每日备份的文件名：用**日期**而不是时间戳，同一天多次调用会覆盖同一份。 */
export function dailyBackupName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `replica-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/**
 * 写一份每日备份，并按文件名（= 日期）裁剪到 `MAX_DAILY_BACKUPS` 份。
 *
 * 同一天重复调用只覆盖那一份 —— 否则一天开十次服务就攒十份。
 */
export function writeDailyBackup(
  dataDir: string,
  envelope: Replica['envelope'],
  now: Date,
  fs: FsAdapter = nodeFs,
): { name: string; removed: string[] } {
  const dir = join(dataDir, 'backups');
  mkdirSync(dir, { recursive: true });
  const name = dailyBackupName(now);
  fs.writeFileSync(join(dir, name), JSON.stringify(envelope, null, 2));

  const removed = pruneDailyBackups(dir, fs);
  return { name, removed };
}

/** 只留最新的 `MAX_DAILY_BACKUPS` 份。文件名是 `replica-YYYY-MM-DD.json`，字典序即时间序。 */
export function pruneDailyBackups(dir: string, fs: FsAdapter = nodeFs): string[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter(
      (name) => name.endsWith('.json') && name.startsWith('replica-'),
    );
  } catch {
    return [];
  }
  const sorted = names.sort();
  const doomed = sorted.slice(0, Math.max(0, sorted.length - MAX_DAILY_BACKUPS));
  for (const name of doomed) {
    try {
      unlinkSync(join(dir, name));
    } catch {
      // 删不掉就算了（下次再删），不该让备份动作失败
    }
  }
  void fs;
  return doomed;
}

/** 列出可用的每日备份，新到旧。 */
export function listBackups(dataDir: string): string[] {
  const dir = join(dataDir, 'backups');
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** 追加一条历史。`id` 由时间 + 递增序号拼，保证同一毫秒内多条也不撞。 */
let historySeq = 0;
export function appendHistory(dataDir: string, entry: Omit<HistoryRecord, 'id'>): HistoryRecord {
  const id = `${entry.replacedAt}-${historySeq++}`;
  const full: HistoryRecord = { id, ...entry };
  mkdirSync(dataDir, { recursive: true });
  appendFileSync(historyPath(dataDir), `${JSON.stringify(full)}\n`, 'utf8');
  return full;
}

/**
 * 读历史，可按 `ref` 过滤。
 *
 * 顺手做过期裁剪（超过 30 天的不返回）—— 真正的物理清理在 `pruneHistory`。
 * 坏行直接跳过：一条写坏的 JSON 不该让整个历史读不出来。
 */
export function readHistory(
  dataDir: string,
  now: Date = new Date(),
  ref?: string,
): HistoryRecord[] {
  const path = historyPath(dataDir);
  if (!existsSync(path)) return [];
  const cutoff = now.getTime() - HISTORY_RETENTION_DAYS * DAY_MS;

  const out: HistoryRecord[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const parsed = JSON.parse(line) as HistoryRecord;
      if (typeof parsed.id !== 'string') continue;
      const at = new Date(parsed.replacedAt).getTime();
      if (Number.isFinite(at) && at < cutoff) continue;
      out.push(parsed);
    } catch {
      // 坏行跳过
    }
  }
  return ref === undefined ? out : out.filter((entry) => entry.id === ref);
}

/** 物理清理超过 30 天的历史行。启动时与每天各跑一次。 */
export function pruneHistory(dataDir: string, now: Date = new Date()): number {
  const path = historyPath(dataDir);
  if (!existsSync(path)) return 0;
  const cutoff = now.getTime() - HISTORY_RETENTION_DAYS * DAY_MS;
  const lines = readFileSync(path, 'utf8').split('\n');
  const keep: string[] = [];
  let removed = 0;
  for (const line of lines) {
    if (line.trim() === '') continue;
    try {
      const parsed = JSON.parse(line) as HistoryRecord;
      const at = new Date(parsed.replacedAt).getTime();
      if (Number.isFinite(at) && at < cutoff) {
        removed += 1;
        continue;
      }
      keep.push(line);
    } catch {
      // 坏行保留原样，别因为一行坏就把历史清空
      keep.push(line);
    }
  }
  if (removed > 0) {
    nodeFs.writeFileSync(path, keep.length > 0 ? `${keep.join('\n')}\n` : '');
  }
  return removed;
}

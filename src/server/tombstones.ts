/**
 * 墓碑的生命周期、休眠设备的兜底、以及清理水位。
 *
 * 墓碑解决的是「A 删了、B 还不知道」：整条记录被删时留一个占位，让删除能传到第二台设备。
 * 但墓碑不能无限期占空间，所以要清；而清理会造出 `seq` 空洞 —— 一台仍活跃、只是 `lastSeq`
 * 落后的设备既收不到 `delete`、也不会被要求全量对账，它本地的旧副本就永远留着。
 *
 * 定案（见工单 05 与 spec）：**保留 `purgedThroughSeq` 水位**。清墓碑时把水位推到这批墓碑里
 * 最大的 `seq`，此后任何 `since < 水位` 的拉取一律要求全量对账 —— 这与休眠设备走同一条分支。
 *
 * **打卡不产生墓碑**：习惯打卡是记录内部的 `日期 → 数值` 映射，取消打卡只是该记录的一次
 * 普通字段变更，随按条目 LWW 传播。墓碑只服务于「整条记录」的删除。
 */
import type { ChangeEntry, Replica, Tombstone } from './replica.ts';

/** 休眠多久算「回来必须全量对账」。 */
export const DORMANT_DAYS = 90;
/** 墓碑最多留多久（另一条清理守卫是「所有设备都拉过」）。 */
export const TOMBSTONE_MAX_AGE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 记一个墓碑。
 *
 * `seq` 用**当前**的全局序号 —— 它标记「这个删除发生在哪个位置」，清理守卫要拿它
 * 跟各设备的 `lastSeq` 比。
 */
export function recordTombstone(
  envelope: Replica['envelope'],
  module: string,
  key: string,
  rev: number,
  now: Date,
): Tombstone {
  const tombstone: Tombstone = {
    module,
    key,
    rev,
    deletedAt: now.toISOString(),
    // 变更日志刚记过这次删除，当前 seq 就是它。**存在墓碑上**，不靠回头查日志
    seq: envelope.sync.seq,
  };
  envelope.sync.tombstones.push(tombstone);
  return tombstone;
}

/**
 * 撤掉一条墓碑：记录又被写回来了。
 *
 * LWW 的固有语义是「晚到的写能复活已删记录」；但墓碑要跟着撤，
 * 否则下次清理会继续把它当「已删」传出去，客户端刚写回来的东西会被当成该删的。
 */
export function clearTombstone(
  envelope: Replica['envelope'],
  module: string,
  key: string,
): boolean {
  const before = envelope.sync.tombstones.length;
  envelope.sync.tombstones = envelope.sync.tombstones.filter(
    (tombstone) => !(tombstone.module === module && tombstone.key === key),
  );
  return envelope.sync.tombstones.length !== before;
}

/**
 * 墓碑对应的 `seq`。
 *
 * 直接读墓碑上记的值（`recordTombstone` 写入时记的）。老副本里没有这个字段时，
 * 退回「在日志里找**最后一条**匹配的 delete」——
 * 取最后一条而不是第一条，因为删→复活→再删之后同一个 key 有两条 delete，
 * 只有最后那条才属于现在这个墓碑（早先用 `.find()` 取第一条，实测真实 seq 4 却查成 2）。
 * 都查不到就退回 0，与旧行为一致（那它会被「都拉过」守卫立刻放行）。
 */
export function tombstoneSeq(envelope: Replica['envelope'], tombstone: Tombstone): number {
  if (typeof tombstone.seq === 'number' && Number.isFinite(tombstone.seq)) return tombstone.seq;

  for (let i = envelope.sync.changes.length - 1; i >= 0; i -= 1) {
    const change = envelope.sync.changes[i]!;
    if (
      change.op === 'delete' &&
      change.module === tombstone.module &&
      change.key === tombstone.key
    ) {
      return change.seq;
    }
  }
  return 0;
}

export interface PurgeResult {
  /** 清掉了多少条墓碑 */
  purgedTombstones: number;
  /** 裁掉了多少条变更日志 */
  trimmedChanges: number;
  /** 水位推到了哪 */
  purgedThroughSeq: number;
}

export interface PurgeOptions {
  /** 时钟可注入（与 `loadReplica` / `handlePush` 同一约定：传函数，不是 Date） */
  now?: () => Date;
}

/**
 * 安全水位：**所有「还需要增量」的设备都已经拉过的位置**。
 *
 * = 未休眠设备里 `lastSeq` 的最小值。低于它的日志条目与墓碑，不会再被任何设备需要：
 * - 已拉过的设备不会再回头要；
 * - 落后于它的设备一律被要求全量对账（见 `readChanges`），所以也不需要那些条目；
 * - 休眠设备（> 90 天没出现）本来就走全量对账，**不该让它把水位钉死** ——
 *   这正是「超 90 天」那条守卫的意义。
 *
 * 没有任何未休眠设备时返回当前 `seq`：没有别人需要这些条目了。
 * （新设备第一次来必然是全量对账 —— 它本来就没有本地状态。）
 */
export function safeWatermark(
  envelope: Replica['envelope'],
  now: () => Date = () => new Date(),
): number {
  const active = envelope.sync.devices.filter((device) => !isDormant(device, now));
  if (active.length === 0) return envelope.sync.seq;
  return Math.min(...active.map((device) => device.lastSeq));
}

/**
 * 清理墓碑、裁掉用不到的变更日志、推进水位。
 *
 * 两条守卫取先到者：
 * 1. **所有还需要增量的设备都拉过 ≥ 该墓碑的 seq**（即 `seq <= safeWatermark`）；
 * 2. **墓碑本身超过 90 天** —— 防止一台永远不上线的设备把墓碑钉死。
 *
 * **日志的裁剪与墓碑无关**（这一点我一开始做错了，实测会无界增长）：
 * 早先的实现在「没有墓碑可清」时直接返回，于是**只增不删**的用法（最常见的那种 ——
 * 加的东西远多于删的）日志会一路涨到 `seq`，副本文件无界变大。现在裁剪由
 * `safeWatermark` 独立驱动：只要设备都拉过了，那些条目就没用了，与有没有墓碑无关。
 */
export function purgeTombstones(
  envelope: Replica['envelope'],
  options: PurgeOptions = {},
): PurgeResult {
  const now = options.now ?? (() => new Date());
  const at = now();
  const watermark = safeWatermark(envelope, now);

  const keep: Tombstone[] = [];
  let purged = 0;
  let highestPurgedSeq = envelope.sync.purgedThroughSeq;

  for (const tombstone of envelope.sync.tombstones) {
    const seq = tombstoneSeq(envelope, tombstone);
    const ageMs = at.getTime() - new Date(tombstone.deletedAt).getTime();
    const tooOld = Number.isFinite(ageMs) && ageMs > TOMBSTONE_MAX_AGE_DAYS * DAY_MS;
    const everyoneAcked = seq <= watermark;

    if (tooOld || everyoneAcked) {
      purged += 1;
      if (seq > highestPurgedSeq) highestPurgedSeq = seq;
    } else {
      keep.push(tombstone);
    }
  }

  // 水位取「已推进的」与「安全水位」里更高的那个：
  // 前者可能因为一条老墓碑被推得更高（那台落后设备会被要求全量对账），
  // 后者保证「只增不删」的用法也能持续裁日志。水位单调不减。
  const nextWatermark = Math.max(highestPurgedSeq, watermark);
  const watermarkMoved = nextWatermark > envelope.sync.purgedThroughSeq;

  if (purged === 0 && !watermarkMoved) {
    return {
      purgedTombstones: 0,
      trimmedChanges: 0,
      purgedThroughSeq: envelope.sync.purgedThroughSeq,
    };
  }

  envelope.sync.tombstones = keep;
  envelope.sync.purgedThroughSeq = nextWatermark;

  // 裁日志：水位以下不会再被消费
  const before = envelope.sync.changes.length;
  envelope.sync.changes = envelope.sync.changes.filter(
    (change: ChangeEntry) => change.seq > envelope.sync.purgedThroughSeq,
  );
  const trimmed = before - envelope.sync.changes.length;

  return {
    purgedTombstones: purged,
    trimmedChanges: trimmed,
    purgedThroughSeq: envelope.sync.purgedThroughSeq,
  };
}

/**
 * 这台设备是不是「休眠」了 —— 上次出现距今超过 90 天。
 *
 * 休眠设备回来时**不做增量**：它本地可能留着早就该删的记录，而对应的墓碑早被清了，
 * 给增量它只会把旧数据复活。要求它走全量对账（拉 `/v1/snapshot`）。
 */
export function isDormant(
  device: { lastSeenAt: string },
  now: () => Date = () => new Date(),
): boolean {
  const seen = new Date(device.lastSeenAt).getTime();
  if (!Number.isFinite(seen)) return false;
  return now().getTime() - seen > DORMANT_DAYS * DAY_MS;
}

/** 推的时候刷新设备的 `lastSeenAt`（push 已做），这里只查状态。 */
export function deviceNeedsFullResync(
  envelope: Replica['envelope'],
  deviceId: string,
  now: () => Date = () => new Date(),
): boolean {
  const device = envelope.sync.devices.find((item) => item.deviceId === deviceId);
  if (!device) return false; // 没见过的设备：它没有本地状态，走正常增量即可
  return isDormant(device, now);
}

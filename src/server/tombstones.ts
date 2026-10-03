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
  };
  envelope.sync.tombstones.push(tombstone);
  return tombstone;
}

/** 某设备是否已经拉过这条墓碑（`lastSeq` 到了它之后）。 */
export function deviceAcked(
  tombstone: Tombstone,
  lastSeq: number,
  seqOfTombstone: number,
): boolean {
  void tombstone;
  return lastSeq >= seqOfTombstone;
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
 * 墓碑对应的 `seq` 从哪来。
 *
 * 墓碑本身不存 `seq`（工单 05 定的形状是 `{module,key,rev,deletedAt}`），
 * 但清理守卫必须知道「这条删除发生在哪个 seq」，否则没法跟设备的 `lastSeq` 比。
 * 从变更日志里查 —— 删除一定有一条 `op: 'delete'` 的日志条目，它的 `seq` 就是答案。
 * 找不到（例如日志已经被裁到水位以下）时退回 0，那它会被「所有设备都拉过」这条守卫立刻放行。
 */
export function tombstoneSeq(envelope: Replica['envelope'], tombstone: Tombstone): number {
  const entry = envelope.sync.changes.find(
    (change) =>
      change.op === 'delete' && change.module === tombstone.module && change.key === tombstone.key,
  );
  return entry?.seq ?? 0;
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
  /** 视为「已拉过」的设备序号表；缺省用副本里的 `devices` */
  deviceAcks?: Array<{ deviceId: string; lastSeq: number }>;
}

/**
 * 清理墓碑，并顺手裁掉水位以下的变更日志。
 *
 * 两条守卫取先到者：
 * 1. **所有已注册设备都拉过 ≥ 该墓碑的 seq** —— 没人还需要它了；
 * 2. **超过 90 天** —— 防止一台永远不上线的设备把墓碑钉死。
 *
 * 同一个动作里把 `purgedThroughSeq` 推到这批墓碑里最大的 `seq`，并丢掉
 * `seq <= purgedThroughSeq` 的日志条目：水位以下不会再被谁消费（落后于水位的拉取
 * 一律被要求全量对账），留着只是让副本文件无界增长。
 *
 * **没有可清的东西时什么都不做** —— 否则每次同步都把水位往前推，会平白让一堆设备
 * 被要求全量对账。
 */
export function purgeTombstones(
  envelope: Replica['envelope'],
  options: PurgeOptions = {},
): PurgeResult {
  const now = options.now ?? (() => new Date());
  const at = now();
  const acks =
    options.deviceAcks ??
    envelope.sync.devices.map((d) => ({ deviceId: d.deviceId, lastSeq: d.lastSeq }));

  const keep: Tombstone[] = [];
  let purged = 0;
  let highestPurgedSeq = envelope.sync.purgedThroughSeq;

  for (const tombstone of envelope.sync.tombstones) {
    const seq = tombstoneSeq(envelope, tombstone);
    const ageMs = at.getTime() - new Date(tombstone.deletedAt).getTime();
    const tooOld = Number.isFinite(ageMs) && ageMs > TOMBSTONE_MAX_AGE_DAYS * DAY_MS;
    // 没有注册设备时「所有设备都拉过」是真空真 —— 但那意味着还没有第二台设备，
    // 此时删掉的记录不需要墓碑（没有别人要知道），所以也允许清。
    const everyoneAcked = acks.every((device) => device.lastSeq >= seq);

    if (tooOld || everyoneAcked) {
      purged += 1;
      if (seq > highestPurgedSeq) highestPurgedSeq = seq;
    } else {
      keep.push(tombstone);
    }
  }

  if (purged === 0) {
    return {
      purgedTombstones: 0,
      trimmedChanges: 0,
      purgedThroughSeq: envelope.sync.purgedThroughSeq,
    };
  }

  envelope.sync.tombstones = keep;
  envelope.sync.purgedThroughSeq = highestPurgedSeq;

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

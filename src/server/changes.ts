/**
 * 拉取：增量 `/v1/changes` 与整份 `/v1/snapshot`。
 *
 * 增量靠 `seq` 游标：客户端说「我拉到 N 了」，服务端把 `seq > N` 的变更按升序给它。
 * 这是**唯一**的「拉到哪了」表达方式 —— `rev` 管谁赢（每条记录一个），`seq` 管拉到哪（全局一个）。
 *
 * 关键不变量：**分页不能漏也不能重**。所以游标只按 `seq` 走，
 * 且返回的 `nextSince` 永远是这一页最后一条的 `seq`（不是「请求的 since + 页大小」）。
 */
import type { ChangeEntry, Replica } from './replica.ts';
import { deviceNeedsFullResync } from './tombstones.ts';

/** 一页最多给多少条。客户端可以传更小的值，但服务端有上限。 */
export const DEFAULT_LIMIT = 500;
export const MAX_LIMIT = 2000;

export interface ChangesQuery {
  /** 客户端已经拉到的位置；缺省 / 非法时视为 0 */
  since: number;
  /** 本页最多几条 */
  limit: number;
  /** 发起这次拉取的设备（可选）。给了就顺带检查它是不是休眠太久 */
  deviceId?: string;
}

/** 从查询串里解析 `since` / `limit` / `deviceId`，非法值退回默认而不是报错。 */
export function parseChangesQuery(params: URLSearchParams): ChangesQuery {
  const rawSince = Number(params.get('since') ?? '0');
  const rawLimit = Number(params.get('limit') ?? String(DEFAULT_LIMIT));
  const since = Number.isFinite(rawSince) && rawSince > 0 ? Math.floor(rawSince) : 0;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;
  const deviceId = params.get('deviceId');
  return deviceId ? { since, limit, deviceId } : { since, limit };
}

export interface ChangesPage {
  changes: ChangeEntry[];
  /** 还有下一页吗 */
  more: boolean;
  /** 客户端下次该拿这个值当 `since` —— 本页最后一行的 seq；无变更时原样返回 `since` */
  nextSince: number;
  /** 当前服务端的 seq，方便客户端一次请求就知道自己落后多少 */
  seq: number;
  /**
   * `since` 落在清理水位之前 → 增量已经不可用，客户端必须改走全量对账。
   *
   * 这条**不能只是返回空数组**：那与「你已经是最新的」无法区分，
   * 客户端会以为自己追平了，而它本地还留着早该删掉的记录。
   */
  needFullResync: boolean;
  purgedThroughSeq: number;
}

/**
 * 记下这台设备拉到了哪，并刷新它的「还活着」时间。
 *
 * - `lastSeq` 的语义是「拉到哪了」，**只能由拉取路径推进**（推送不代表拉取）。
 *   它是「日志与墓碑能裁到哪」的唯一依据：裁早了会让设备拉不到它还需要的东西，
 *   裁晚了副本文件一直涨。所以只在一页**成功返回之后**推进，且只前进不后退。
 * - `lastSeenAt` 推与拉**都刷新**。早先只有 push 刷，于是「定期同步但本地没改动」的设备
 *   （引擎在没有 diff 时跳过 push）会被永远判成休眠 —— 每次同步都重下全量快照，自己好不了。
 */
export function recordPullProgress(
  replica: Replica,
  deviceId: string | undefined,
  pulledTo: number,
  at: Date = new Date(),
): void {
  if (!deviceId) return;
  const device = replica.envelope.sync.devices.find((item) => item.deviceId === deviceId);
  if (!device) return;
  if (pulledTo > device.lastSeq) device.lastSeq = pulledTo;
  device.lastSeenAt = at.toISOString();
}

/**
 * 取一页增量。
 *
 * 两条「要求全量对账」的分支，优先级都高于正常增量：
 * 1. `since < purgedThroughSeq` —— 那段 `seq` 里的墓碑已被清掉，增量已经不完整；
 * 2. 发起设备**休眠太久**（> 90 天没出现）—— 它本地可能留着早该删的记录，
 *    而对应的墓碑早被清了，给增量它只会把旧数据复活。
 *
 * 两条都**不能只是返回空数组**：空数组与「你已经是最新的」无法区分。
 */
export function readChanges(
  replica: Replica,
  query: ChangesQuery,
  now: () => Date = () => new Date(),
): ChangesPage {
  const { sync } = replica.envelope;

  /*
   * **把 `since` 夹进 `[0, seq]`。**
   *
   * 客户端可以传任意有限正数：`since=1e15` 会被原样收进 `nextSince`，
   * 而 `http.ts` 又把它写进这台设备的 `lastSeq` → `safeWatermark` 跟着变成 1e15
   * → 水位被永久钉在 1e15，此后每一次拉取都被判成「落后于水位」、强制全量对账。
   * 一条数据都不用丢，就足以让同步永远退化成全量。
   *
   * 超过 `seq` 的 `since` 语义上等于「我已经拉完了」，夹到 `seq` 即可。
   */
  const since = Math.min(Math.max(0, Math.floor(query.since)), sync.seq);

  const belowWatermark = since < sync.purgedThroughSeq;
  const dormant = query.deviceId
    ? deviceNeedsFullResync(replica.envelope, query.deviceId, now)
    : false;

  if (belowWatermark || dormant) {
    return {
      changes: [],
      more: false,
      nextSince: since,
      seq: sync.seq,
      needFullResync: true,
      purgedThroughSeq: sync.purgedThroughSeq,
    };
  }

  // 日志按 seq 升序维护，所以「seq > since」就是从头截断；再取 limit 条
  const pending = sync.changes.filter((entry) => entry.seq > since);
  const page = pending.slice(0, query.limit);
  const last = page[page.length - 1];

  return {
    changes: page,
    more: pending.length > page.length,
    nextSince: last ? last.seq : since,
    seq: sync.seq,
    needFullResync: false,
    purgedThroughSeq: sync.purgedThroughSeq,
  };
}

/**
 * 整份副本，供换机首同步、休眠太久、或 `since` 落后于水位时的全量对账。
 *
 * 直接返回副本信封 —— 它的 `data` 段与客户端备份同形（这是刻意的，见 `replica.ts`
 * 的 `ModuleValue` 注释），所以客户端能拿它直接落库。
 */
export function readSnapshot(replica: Replica): Replica['envelope'] {
  return replica.envelope;
}

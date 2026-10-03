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

/** 一页最多给多少条。客户端可以传更小的值，但服务端有上限。 */
export const DEFAULT_LIMIT = 500;
export const MAX_LIMIT = 2000;

export interface ChangesQuery {
  /** 客户端已经拉到的位置；缺省 / 非法时视为 0 */
  since: number;
  /** 本页最多几条 */
  limit: number;
}

/** 从查询串里解析 `since` / `limit`，非法值退回默认而不是报错（探针与手测更省事）。 */
export function parseChangesQuery(params: URLSearchParams): ChangesQuery {
  const rawSince = Number(params.get('since') ?? '0');
  const rawLimit = Number(params.get('limit') ?? String(DEFAULT_LIMIT));
  const since = Number.isFinite(rawSince) && rawSince > 0 ? Math.floor(rawSince) : 0;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;
  return { since, limit };
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
 * 取一页增量。
 *
 * 水位判定优先于一切：`since < purgedThroughSeq` 时**不返回任何变更**，
 * 只回 `needFullResync`（工单 05 的定案：保留水位而不是让墓碑永不删）。
 */
export function readChanges(replica: Replica, query: ChangesQuery): ChangesPage {
  const { sync } = replica.envelope;

  if (query.since < sync.purgedThroughSeq) {
    return {
      changes: [],
      more: false,
      nextSince: query.since,
      seq: sync.seq,
      needFullResync: true,
      purgedThroughSeq: sync.purgedThroughSeq,
    };
  }

  // 日志按 seq 升序维护，所以「seq > since」就是从头截断；再取 limit 条
  const pending = sync.changes.filter((entry) => entry.seq > query.since);
  const page = pending.slice(0, query.limit);
  const last = page[page.length - 1];

  return {
    changes: page,
    more: pending.length > page.length,
    nextSince: last ? last.seq : query.since,
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

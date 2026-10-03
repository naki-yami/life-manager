import { useSyncStore } from '../../store/syncStore';
import { createAutoSnapshot } from '../backup';
import { baselineFromSnapshotData } from './baseline';
import {
  applySnapshot,
  computeAndCommitDiff,
  fetchSnapshot,
  fromRevTable,
  revsFromSnapshot,
  runSync,
  type SyncHttp,
  type SyncOutcome,
} from './engine';

/**
 * 首次开启的对账，与「基线作废之后的重对账」。
 *
 * 这一模块**只做逻辑**，不含界面：它回答「该弹什么」与「三个选项各做什么」，
 * 设置卡（工单 06）负责把返回的东西渲染出来。所以下面每个函数都是「调用它 → 拿到结果」，
 * 自己不弹任何东西。
 *
 * ## 为什么首次开启不能是静默推送
 *
 * 服务端已经有数据时（`seq > 0`），「静默全量推」等于**拿本机覆盖另一台设备**——
 * 那正是 ADR-0002 排在最高优先级的「同步导致记录丢失」。所以必须让用户明确选一次：
 * 哪边为准，还是先不玩。**取消不视为错误**，只是没开。
 */

/** 「以服务端为准」覆盖本机之前留下的那份本地快照的 reason */
export const SERVER_AUTHORITATIVE_SNAPSHOT_REASON = 'sync-server-authoritative';

/** 首次开启时该做什么 */
export type FirstEnablePlan =
  /** 服务端是空的：直接全量推，不用问 */
  | { kind: 'push-all'; seq: 0 }
  /** 服务端已有数据：必须让用户选一次 */
  | { kind: 'needs-choice'; seq: number; serverModules: string[] }
  /** 连不上或没配置：什么都没做 */
  | { kind: 'unavailable'; reason: string };

/**
 * 开启同步前的第一步：连上服务端、看清那边有没有数据。
 *
 * **只读**：这条路径上只发 `GET /v1/health`（免令牌），**不写任何东西** ——
 * 于是「取消」能真的做到零写请求。
 */
export async function planFirstEnable(
  http: SyncHttp,
  options: { baseUrl?: string } = {},
): Promise<FirstEnablePlan> {
  const state = useSyncStore.getState();
  const baseUrl = options.baseUrl ?? state.baseUrl;

  if (baseUrl === '') return { kind: 'unavailable', reason: '还没填服务地址' };

  try {
    const health = (await http.request({
      url: `${baseUrl}/v1/health`,
      method: 'GET',
      // health 免令牌 —— 它是探针，不含用户数据
      token: '',
    })) as { ok?: boolean; seq?: number; modules?: string[] };

    if (health?.ok !== true) return { kind: 'unavailable', reason: '服务端未就绪' };

    const seq = typeof health.seq === 'number' && health.seq > 0 ? health.seq : 0;
    // 服务端空 → 全量推本地数据（那边本来就没有东西可以被覆盖）
    if (seq === 0) return { kind: 'push-all', seq: 0 };

    return { kind: 'needs-choice', seq, serverModules: health.modules ?? [] };
  } catch (error) {
    return {
      kind: 'unavailable',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 用户对「服务端已有数据」的三个选择 */
export type FirstEnableChoice = 'local-wins' | 'server-wins' | 'cancel';

/**
 * 执行用户的选择。
 *
 * - `local-wins`：全量推本机数据（**会覆盖服务端**）。把基线与 rev 都当空的，
 *   于是 diff 得出的就是「全部新增」—— 这是用户明确选过的破坏性动作。
 * - `server-wins`：**先留一份本机快照**，再拉 `/v1/snapshot` 覆盖本机。
 * - `cancel`：**一个请求都不发**，开关保持关闭。
 */
export async function applyFirstEnableChoice(
  choice: FirstEnableChoice,
  http: SyncHttp,
  options: {
    /** 覆盖可注入，测试用来断言「快照确实先落了一份」 */
    createSnapshot?: (reason: string) => Promise<string | null>;
  } = {},
): Promise<SyncOutcome> {
  const state = useSyncStore.getState();

  if (choice === 'cancel') {
    /*
     * 取消 = 没开。**一个请求都不发** —— 连 health 都不重发：
     * 调用方（`planFirstEnable`）已经把服务端状态问过一次了，再问一次没有任何新信息。
     */
    state.setEnabled(false);
    return {
      ok: false,
      reason: '已取消（开关保持关闭）',
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      lastSeq: state.lastSeq,
    };
  }

  if (choice === 'local-wins') {
    // 覆盖语义：把基线当空的、rev 全按 0 —— 于是「本机全部数据」都算新增，全推
    const outcome = await computeAndCommitDiff(http, { ignoreBaseline: true });
    if (outcome.ok) state.setEnabled(true);
    return outcome;
  }

  return adoptServer(http, options.createSnapshot ?? createAutoSnapshot);
}

/**
 * 「以服务端为准」：先留本机快照，再拿服务端那份覆盖本机。
 *
 * **快照是硬前提。** `createAutoSnapshot` 写不进去时返回 `null`，那时**一律中止覆盖**：
 * 关掉同步、保留本机数据、提示「没能在覆盖前留下快照，已取消」。
 * 绝不能在快照为 null 的情况下继续 —— 那正好造成 ADR-0002 最优先要防的不可恢复丢失
 * （给了破坏性按钮却没有恢复口，等于设陷阱）。
 */
async function adoptServer(
  http: SyncHttp,
  createSnapshot: (reason: string) => Promise<string | null>,
): Promise<SyncOutcome> {
  const state = useSyncStore.getState();
  const lastSeq = state.lastSeq;

  // ① 先留快照。失败就到此为止，一个覆盖动作都不做
  const key = await createSnapshot(SERVER_AUTHORITATIVE_SNAPSHOT_REASON);
  if (key === null) {
    // 关掉同步、保留本机数据 —— 这是「中止」而不是「失败后照常继续」
    state.setEnabled(false);
    return {
      ok: false,
      reason: '没能在覆盖前留下快照，已取消（本机数据未改动）',
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      lastSeq,
    };
  }

  // ② 快照到手了，才拉服务端那份并覆盖
  try {
    const snapshot = await fetchSnapshot(http, state.baseUrl, state.token);
    const applied = applySnapshot(snapshot.data ?? {});
    const seq = typeof snapshot.sync?.seq === 'number' ? snapshot.sync.seq : 0;

    /*
     * 覆盖之后基线取**服务端那份**（快照的 data），rev 表取快照的 `sync.rev`。
     *
     * 用服务端那份而不是重算本机那份，理由与 `reconcile` 里写的一样：
     * 覆盖之后本机 ≈ 服务端，但**本机可能有服务端没有的记录**（快照是 upsert，不删本机多余的）。
     * 拿本机那份当基线，那些记录会被算成「没动」→ 永远推不上去。
     */
    const baseline = await baselineFromSnapshotData(snapshot.data ?? {});
    useSyncStore.getState().commitSync(seq, baseline, fromRevTable(revsFromSnapshot(snapshot)));
    state.setEnabled(true);

    return { ok: true, reason: '', pushed: 0, pulled: applied, conflicts: 0, lastSeq: seq };
  } catch (error) {
    // 覆盖失败：本机数据可能已经落了一半，但快照在手，用户能回滚
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      lastSeq,
    };
  }
}

/**
 * 基线作废之后由用户点的「重新对账」。
 *
 * **语义是「对齐」而不是「覆盖」**：先拉 `/v1/snapshot` 落库看清服务端有什么，
 * 再让 `runSync` 推本机相对它的差集。于是推上去的只剩**用户真的改过**的条目。
 *
 * ## 为什么这样就消掉了 `dietGoals` 那条假改动
 *
 * `dietGoals` 是模块单值，而 store 里**恒有默认值**，所以空基线下它必然产生一条 `put`。
 * 若本机仍是默认值（用户从没设过）而服务端已有真实目标，推上去会被判 `conflict` ——
 * 用户什么都没改，却看到一行莫名其妙的冲突提示。
 *
 * 先落服务端那份之后，本机 `dietGoals` 就**变成服务端那份**（不再是默认值）——
 * 于是这一轮根本不会再推它。这是「对齐」相对「覆盖」的价值：不必给单值模块写一套
 * 特例，先对齐自然就没有那条假改动。
 */
export async function reconcile(http: SyncHttp): Promise<SyncOutcome> {
  const state = useSyncStore.getState();
  const { baseUrl, token, lastSeq } = state;

  if (baseUrl === '' || token === '') {
    return {
      ok: false,
      reason: '还没填服务地址或令牌',
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      lastSeq,
    };
  }

  try {
    // ① 先拉服务端那份、落库。这一步之后本机就「和服务端一样了」
    const snapshot = await fetchSnapshot(http, baseUrl, token);
    const applied = applySnapshot(snapshot.data ?? {});
    const seq = typeof snapshot.sync?.seq === 'number' ? snapshot.sync.seq : 0;

    /*
     * ② 基线取**服务端那一份**，不是本机这份。
     *
     * 这一步是「对齐」的全部要点：基线 = 服务端现状，于是随后的 diff 得出的正是
     * 「本机有、服务端没有」的条目 —— 用户真正改过的东西会被推上去，
     * 而本机与它一致的部分一条都不推。
     *
     * 若这里错用 `computeBaseline()`（本机那份：刚 upsert 完，已经含本机独有的记录），
     * 那些本机独有的记录会被算进基线 → diff 认为「没动」→ **永远推不到服务端**，
     * 而且没有任何报错。
     */
    const baseline = await baselineFromSnapshotData(snapshot.data ?? {});
    useSyncStore.getState().commitSync(seq, baseline, fromRevTable(revsFromSnapshot(snapshot)));

    // ③ 推本机独有的改动（此时 dietGoals 已是服务端那份，推不出那条假 put）
    const outcome = await runSync(http);

    state.clearNeedsReconcile();

    return { ...outcome, pulled: outcome.pulled + applied };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      lastSeq,
    };
  }
}

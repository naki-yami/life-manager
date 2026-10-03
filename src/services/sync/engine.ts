import { useSyncStore, type SyncConflict } from '../../store/syncStore';
import { applyChanges, type AppliedChange } from './apply';
import {
  computeBaseline,
  diffAgainstBaseline,
  type RevTable,
  type SyncChange,
} from './baseline';

/**
 * 同步引擎：把一轮同步编排起来。
 *
 * ## 一轮的顺序固定「先推后拉」，五步
 *
 * 1. `GET /v1/health` —— 连不上就到此为止（**离线是正常状态，不是错误**）；
 * 2. 算 diff → `POST /v1/push`（每条带 `baseRev` 与 `deviceId`）；
 * 3. 记下 `conflict` 的条目（进 `lm:sync.conflicts`，只留最近一次）；
 * 4. `GET /v1/changes?since=<lastSeq>` 分页拉完 → 逐条落库（`put` / `delete`）；
 * 5. **全部成功之后**才更新 `lastSeq`、基线与 rev 表。
 *
 * ## 为什么第 5 步是「全部成功之后」
 *
 * 任何一步失败都不推进游标、不动基线、不动 rev 表 —— 于是这一轮可以被安全地重来：
 * 已经落库的条目保持落库（落库是幂等的 upsert / delete），下一轮从头再算一遍 diff。
 * 反过来，若中途失败却推进了游标，那些**没拉到**的改动会被记成「已经拉过了」，
 * 下一轮就不再拉 —— 那是静默丢数据。
 *
 * ## 本模块不进首屏包
 *
 * 它 import 了 HTTP 与哈希代码。触发点（开机一次）用**动态 import** 引它进来，
 * 别让同步拖慢打开速度（首屏预算 300 KB）。
 */

/** 一轮同步的结果。调用方（设置卡 / 日志）据此显示「成功 / 失败 / 冲突几条」。 */
export interface SyncOutcome {
  ok: boolean;
  /** 失败原因；`ok` 为 true 时是空串。离线也算失败，但**不是错误** */
  reason: string;
  /** 推上去的条数 */
  pushed: number;
  /** 拉下来落库的条数 */
  pulled: number;
  /** 服务端判为冲突的条数 */
  conflicts: number;
  /** 这一轮结束后的游标（失败时是原值） */
  lastSeq: number;
}

/** 可注入的 HTTP 层。默认用全局 `fetch`；测试在 fetch 层打桩。 */
export interface SyncHttp {
  /** 发一个请求并解析 JSON；非 2xx 与网络错误都抛 */
  request: (options: HttpRequest) => Promise<unknown>;
}

export interface HttpRequest {
  /** 完整 URL（已拼好 baseUrl 与查询串） */
  url: string;
  method: 'GET' | 'POST';
  /** 令牌；`/v1/health` 不需要，传空串即不带这个头 */
  token: string;
  body?: unknown;
}

/** 一页增量（服务端 `/v1/changes` 的响应形状） */
interface ChangesPage {
  changes: ChangeEntry[];
  more: boolean;
  nextSince: number;
  seq: number;
  needFullResync: boolean;
  purgedThroughSeq: number;
}

/** 服务端变更日志里的一条 */
interface ChangeEntry {
  seq: number;
  module: string;
  key: string;
  rev: number;
  op: 'put' | 'delete';
  record?: Record<string, unknown>;
}

/** `/v1/health` 的响应 */
interface HealthResponse {
  ok: boolean;
  seq: number;
  schemaVersion: number;
  modules: string[];
}

/** `/v1/push` 的响应 */
interface PushResponse {
  seq: number;
  results: Array<{
    module: string;
    key: string;
    outcome: 'applied' | 'noop' | 'conflict' | 'rejected';
    rev: number;
    error?: string;
  }>;
  conflicts: number;
}

/**
 * 默认 HTTP 实现：全局 `fetch`。
 *
 * 非 2xx 一律抛 —— 把「服务端拒绝了」与「拿到了数据」分开，免得解析一个错误体的字段
 * 才发现不对劲。**网络错误也照常抛**，由 `runSync` 统一收成「这一轮失败」。
 */
function createFetchHttp(fetchImpl: typeof fetch = fetch): SyncHttp {
  return {
    request: async ({ url, method, token, body }) => {
      const headers: Record<string, string> = {};
      if (token !== '') headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers['Content-Type'] = 'application/json';

      const response = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (!response.ok) {
        // 401 要说清是令牌问题 —— 这是用户最可能填错的一项，笼统的「同步失败」帮不上忙
        if (response.status === 401) throw new Error('令牌不对（服务端返回 401）');
        throw new Error(`服务端返回 ${response.status}`);
      }
      return (await response.json()) as unknown;
    },
  };
}

/** 把 `module:key` 的扁平 rev 表转成 diff 用的嵌套形状 */
function toRevTable(revs: Record<string, number>): RevTable {
  const table: RevTable = {};
  for (const [composite, rev] of Object.entries(revs)) {
    // 键是 `module:key` —— 模块名里不会有 `:`，所以第一个冒号就是分隔点
    const at = composite.indexOf(':');
    if (at <= 0) continue;
    const module = composite.slice(0, at);
    const key = composite.slice(at + 1);
    if (key === '') continue;
    table[module] = { ...table[module], [key]: rev };
  }
  return table;
}

/** 把 diff 用的嵌套 rev 表拍回 `module:key` 的扁平形状 */
function fromRevTable(table: RevTable): Record<string, number> {
  const revs: Record<string, number> = {};
  for (const [module, entries] of Object.entries(table)) {
    for (const [key, rev] of Object.entries(entries)) {
      revs[`${module}:${key}`] = rev;
    }
  }
  return revs;
}

/**
 * 挑一条记录在界面上认得出的标题。
 *
 * 冲突只给**一行提示**（模块 + 条目标题 + 服务端那份的时间），所以需要一个人读得懂的
 * 名字。各模块的「标题字段」并不统一（任务用 `title`、备忘用 `content`、书用 `title`…），
 * 这里按常见的几个字段依次找，找不到就退回 key —— 宁可显示一个 id，
 * 也不要给用户一行空白。
 */
function recordTitle(record: Record<string, unknown> | undefined, key: string): string {
  if (record === undefined) return key;
  for (const field of ['title', 'name', 'content', 'text', 'label']) {
    const value = record[field];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return key;
}

/**
 * 跑一轮同步，并在一轮全部成功之后提交游标 / 基线 / rev 表。
 *
 * 这是**唯一**会推进 `lastSeq` 的入口。返回的结果总是「这一轮发生了什么」，
 * 不抛异常 —— 离线、令牌错、服务端 500 都是正常会发生的状态，调用方要能显示它们。
 */
export async function runSync(http: SyncHttp = createFetchHttp()): Promise<SyncOutcome> {
  const state = useSyncStore.getState();
  const { enabled, baseUrl, token, deviceId, lastSeq } = state;

  // 开关关着 = 纯本地。**一个请求都不发** —— 这是「关闭时零网络请求」的落点
  if (!enabled) return failure('同步未开启', lastSeq);
  if (baseUrl === '' || token === '') return failure('还没填服务地址或令牌', lastSeq);
  if (deviceId === '') return failure('设备标识缺失', lastSeq);

  const revTable = toRevTable(state.revs);

  try {
    // 1. 连不上就到此为止。离线是正常状态，不是错误
    const health = (await http.request({
      url: `${baseUrl}/v1/health`,
      method: 'GET',
      token: '',
    })) as HealthResponse;

    if (health?.ok !== true) return failure('服务端未就绪', lastSeq);

    // 2. 算 diff 并推上去
    const changes = await diffAgainstBaseline(
      state.baseline,
      (module, key) => revTable[module]?.[key] ?? 0,
    );
    const pushed = await pushChanges(http, baseUrl, token, deviceId, changes, revTable);

    // 3. 记下冲突（只留最近一次）；界面上给一行提示，不阻塞、不弹模态
    state.setConflicts(pushed.conflicts);
    if (pushed.rejected.length > 0) {
      // 被服务端拒的条目：说清是哪些，不静默 —— 它们下一轮还会被推
      return failure(`服务端拒绝了 ${pushed.rejected.length} 条改动`, lastSeq);
    }

    // 4. 拉增量、分页拉完、逐条落库。
    // 带上 push 收来的 rev（含 noop 那一份），落库时再叠加拉取给的 rev
    const pulled = await pullChanges(http, baseUrl, token, deviceId, lastSeq, pushed.revs);

    /*
     * 5. 成功之后才提交。
     *
     * 基线要对**落库之后**的本机数据重算：这一轮拉下来的远端记录也是本机现在的状态，
     * 下一轮与它们比对才知道「自那以后有没有再改」。
     */
    const baseline = await computeBaseline();
    state.commitSync(pulled.lastSeq, baseline, fromRevTable(pulled.revs));

    return {
      ok: true,
      reason: '',
      pushed: changes.length,
      pulled: pulled.applied,
      conflicts: pushed.conflicts.length,
      lastSeq: pulled.lastSeq,
    };
  } catch (error) {
    // 任何一步失败：不动 lastSeq、不动基线、不动 revs —— 幂等，下一轮重来即可
    return failure(error instanceof Error ? error.message : String(error), lastSeq);
  }
}

/** 组装一个失败结果（游标保持原值） */
function failure(reason: string, lastSeq: number): SyncOutcome {
  return { ok: false, reason, pushed: 0, pulled: 0, conflicts: 0, lastSeq };
}

/**
 * 推本地改动；返回冲突条目、被拒条目，以及从结果里收回的 rev。
 *
 * **`rev` 的三种结果都要收**（`applied` / `noop` / `conflict`）：
 * - `applied` 与 `conflict` 给的是**新的** rev，收下来下一轮才不会误判落后；
 * - `noop` 是「内容与现存记录完全一致，不产生新 rev」，它给的是**当前那一版**——
 *   这一条最容易漏：不记的话下一轮还带旧 `baseRev`，被服务端判成落后 →
 *   每次同步都误报一行冲突，而用户什么也没做错。
 */
async function pushChanges(
  http: SyncHttp,
  baseUrl: string,
  token: string,
  deviceId: string,
  changes: readonly SyncChange[],
  revs: RevTable,
): Promise<{ conflicts: SyncConflict[]; rejected: string[]; revs: RevTable }> {
  // 没有改动就不要发这个请求：一条空 push 只会让服务端写一条日志、白跑一趟
  if (changes.length === 0) return { conflicts: [], rejected: [], revs };

  const response = (await http.request({
    url: `${baseUrl}/v1/push`,
    method: 'POST',
    token,
    body: {
      deviceId,
      changes: changes.map((change) => ({
        module: change.module,
        key: change.key,
        baseRev: change.baseRev,
        op: change.op,
        // delete 不带 record（服务端按 key 删本地那份）
        ...(change.record === undefined ? {} : { record: change.record }),
      })),
    },
  })) as PushResponse;

  const conflicts: SyncConflict[] = [];
  const rejected: string[] = [];
  const nextRevs: RevTable = { ...revs };

  for (const result of response.results ?? []) {
    if (result.outcome === 'rejected') {
      rejected.push(`${result.module}:${result.key}`);
      continue;
    }

    // applied / noop / conflict 三种都由服务端给了权威 rev，一律收下
    recordRev(nextRevs, result.module, result.key, result.rev);

    if (result.outcome !== 'conflict') continue;

    // 冲突条目：模块 + 条目标题 + 服务端那一份的时间（取本机这份的字段做标题）
    const local = changes.find(
      (change) => change.module === result.module && change.key === result.key,
    );
    conflicts.push({
      module: result.module,
      key: result.key,
      title: recordTitle(local?.record, result.key),
      serverUpdatedAt: '',
    });
  }

  return { conflicts, rejected, revs: nextRevs };
}

/**
 * 把一条 rev 记进 rev 表。键形状是「模块 → key → rev」。
 *
 * 负值与非有限值直接丢掉：留一条脏 rev 会让下一轮带一个不存在的版本号去推，
 * 冲突判定就建立在假前提上了。
 */
function recordRev(revs: RevTable, module: string, key: string, rev: number): void {
  if (!Number.isFinite(rev) || rev < 0) return;
  revs[module] = { ...revs[module], [key]: Math.floor(rev) };
}

/** 拉增量并落库；返回落库条数与推进后的游标 */
async function pullChanges(
  http: SyncHttp,
  baseUrl: string,
  token: string,
  deviceId: string,
  lastSeq: number,
  revTable: RevTable,
): Promise<{ applied: number; lastSeq: number; revs: RevTable }> {
  const revs: RevTable = { ...revTable };
  let since = lastSeq;
  let applied = 0;

  // 分页拉完。上限只是防御 —— 正常情况下 `more` 会先变 false
  for (let page = 0; page < MAX_PAGES; page += 1) {
    /*
     * `deviceId` **必须带上**：服务端靠它判「这台设备是不是休眠太久」。
     * 不带的话那道守卫静默失效（服务端拿不到设备名就没法判），
     * 一台离线很久的设备会拿到不完整的增量、把早该删的记录复活。
     */
    const query = new URLSearchParams({
      since: String(since),
      deviceId,
    });
    const response = (await http.request({
      url: `${baseUrl}/v1/changes?${query.toString()}`,
      method: 'GET',
      token,
    })) as ChangesPage;

    // 增量不可用（水位之前 / 设备休眠太久）→ 不是错误，走全量对账
    if (response.needFullResync) {
      return fullResync(http, baseUrl, token, revs);
    }

    const entries = response.changes ?? [];
    if (entries.length > 0) {
      applied += applyEntries(entries, revs);
    }

    // 游标用响应给的 `nextSince`，**不要自己算 since + limit** ——
    // 服务端只按 seq 走，自己算会在「这一页不足 limit」时跳过没拿到的条目
    since = response.nextSince ?? since;

    if (!response.more) {
      // 服务端当前进度可能比 nextSince 更靠前（本机已经是最新的），取两者较大者
      return { applied, lastSeq: Math.max(since, response.seq ?? 0), revs };
    }
  }

  throw new Error(`增量拉取超过 ${MAX_PAGES} 页，已中止（避免无限循环）`);
}

/** 一页增量的条数上限，纯防御；服务端自己的上限是 2000 */
const MAX_PAGES = 1000;

/**
 * 全量对账：拉 `/v1/snapshot`，把 `data` 段按单元表拆开落库。
 *
 * 这是 `needFullResync: true` 的落点 —— **它不是错误**，是服务端一次成功的协商结果
 * （水位之前 / 设备休眠太久）。完事把游标置为快照信封里的 `seq`。
 */
async function fullResync(
  http: SyncHttp,
  baseUrl: string,
  token: string,
  revs: RevTable,
): Promise<{ applied: number; lastSeq: number; revs: RevTable }> {
  const snapshot = (await http.request({
    url: `${baseUrl}/v1/snapshot`,
    method: 'GET',
    token,
  })) as { data?: Record<string, unknown>; sync?: { seq?: number; rev?: Record<string, number> } };

  const data = snapshot.data ?? {};
  const applied = applySnapshot(data);

  // 快照里带了完整的 rev 表（`sync.rev`，键是 `module:key`），照它重设。
  // 这份是权威的：它描述的是快照那一刻服务端每条记录的版本。
  const nextRevs: RevTable = {};
  for (const [composite, rev] of Object.entries(snapshot.sync?.rev ?? {})) {
    if (typeof rev !== 'number') continue;
    const at = composite.indexOf(':');
    if (at <= 0) continue;
    const module = composite.slice(0, at);
    const key = composite.slice(at + 1);
    if (key === '') continue;
    nextRevs[module] = { ...nextRevs[module], [key]: Math.floor(rev) };
  }

  return {
    applied,
    lastSeq: typeof snapshot.sync?.seq === 'number' ? snapshot.sync.seq : 0,
    // 快照没给 rev 就保留原有的（比清空好：清空等于下一轮全部误报冲突）
    revs: Object.keys(nextRevs).length > 0 ? nextRevs : revs,
  };
}

/**
 * 把快照的 `data` 段按单元表拆成变更并落库。
 *
 * 形状直接复用备份的模块形状（`replica.ts` 的 `ModuleValue`）：
 * 记录类模块是数组、`dietWater` 是扁平的 date → 数字、`dietGoals` 是模块单值。
 */
function applySnapshot(data: Record<string, unknown>): number {
  const changes: AppliedChange[] = [];

  for (const [module, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      for (const record of value) {
        if (typeof record !== 'object' || record === null || Array.isArray(record)) continue;
        const item = record as Record<string, unknown>;
        const key = typeof item.id === 'string' ? item.id : '';
        if (key === '') continue;
        changes.push({ module, key, op: 'put', record: item });
      }
      continue;
    }

    if (typeof value !== 'object' || value === null) continue;

    if (module === 'dietWater') {
      // 扁平 date → 数字：一天一个单元
      for (const [date, glasses] of Object.entries(value as Record<string, unknown>)) {
        if (typeof glasses !== 'number') continue;
        changes.push({ module, key: date, op: 'put', record: { [date]: glasses } });
      }
      continue;
    }

    // 模块单值（dietGoals）：key 固定为模块名
    changes.push({ module, key: module, op: 'put', record: value as Record<string, unknown> });
  }

  return applyChanges(changes).applied;
}

/**
 * 落一页增量的条目，并记下每条最新的 rev。
 *
 * 返回成功落库的条数。
 */
function applyEntries(entries: readonly ChangeEntry[], revs: RevTable): number {
  const changes: AppliedChange[] = [];

  for (const entry of entries) {
    if (entry.module === undefined || entry.key === undefined) continue;

    changes.push({
      module: entry.module,
      key: entry.key,
      op: entry.op === 'delete' ? 'delete' : 'put',
      ...(entry.record === undefined ? {} : { record: entry.record }),
    });
  }

  const result = applyChanges(changes);

  /*
   * rev 只在**落库成功**之后记。
   *
   * 顺序反了的话：落库失败的条目 rev 却前进到服务端那一版，下一轮本机再改它时
   * 会带一个「服务端还没有的版本」去推 —— 冲突判定就建立在假前提上了。
   */
  for (const entry of entries) {
    if (entry.module === undefined || entry.key === undefined) continue;
    const skipped = result.skipped.some(
      (item) => item.module === entry.module && item.key === entry.key,
    );
    if (skipped) continue;
    recordRev(revs, entry.module, entry.key, entry.rev);
  }

  return result.applied;
}

/** 默认 HTTP（全局 fetch）。测试用 `runSync({ request })` 注入桩 */
export const defaultHttp: SyncHttp = createFetchHttp();

export { createFetchHttp };

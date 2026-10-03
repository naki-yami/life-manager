import { SYNC_UNITS, readUnits } from './units';

/**
 * 内容哈希基线：在没有 `updatedAt` 可用的前提下回答「哪些条目改过」。
 *
 * ## 为什么比对内容
 *
 * 这个仓库的 `updatedAt` 只覆盖写作项目、复盘、日记三类记录，且由各 action 手工维护、
 * 多个 `updateX` 直接绕过（ADR-0002 记过）。同步第一版明确不补这个字段，所以只剩一条路：
 * **每次同步成功后把「模块 → 条目 key → 内容哈希」记下来，下次对当前数据算同样的哈希再比。**
 *
 * | 基线 | 当前         | 判定 | 动作        |
 * | ---- | ------------ | ---- | ----------- |
 * | 无   | 有           | 新增 | 推 `put`    |
 * | 有   | 有且哈希不同 | 改过 | 推 `put`    |
 * | 有   | 无           | 删了 | 推 `delete` |
 * | 有   | 有且哈希相同 | 没动 | 什么都不做  |
 *
 * ## 基线是可丢弃的派生物
 *
 * 删掉 `lm:sync` 只会让下次同步退化成**全量比对**（基线上全是「新增」），
 * 而且因为**「基线里没有的 key 不产生 `delete`」**，它不会误删任何东西 ——
 * 这是这个设计能成立的关键，`baseline.test.ts` 有专门的用例守着。
 *
 * 反过来说：`delete` 只能由「基线里有、当前没有」推出。基线的可信度就是删除的可信度，
 * 所以**基线只在一轮同步全部成功之后才更新**（见 `syncStore.commitSync` 的注释）。
 */

/** 一个待推送的改动。`record` 在 `op: 'delete'` 时不带 —— 服务端按 key 删本地那份。 */
export interface SyncChange {
  module: string;
  key: string;
  op: 'put' | 'delete';
  record?: Record<string, unknown>;
  /**
   * 客户端所知的、服务端这条记录当前的记录版本。
   *
   * 服务端拿它判冲突：`baseRev` 小于服务端当前 rev 时**仍然接受**本次写入
   * （后到者赢），但在结果里标 `conflict`。所以它必须如实反映「我上次看到的是哪一版」——
   * 恒填 0 会让每一次推送都被标冲突，把提示栏淹掉。
   *
   * 值的来源见 `RevTable`：**与哈希一起**记录（哈希判「本机改没改」，
   * rev 判「服务端那一版是几」），由同一轮同步一起更新。
   */
  baseRev: number;
}

/** 基线表：模块 → 条目 key → 内容哈希。形状与 `lm:sync.baseline` 一致 */
export type Baseline = Record<string, Record<string, string>>;

/**
 * 记录版本表：模块 → 条目 key → 服务端给的 rev。
 *
 * **为什么与基线分开存**：两者判的是两件事，而且失效条件不同 ——
 * 哈希管「本机这一条改没改」，rev 管「服务端那一版是几」。分开的好处是
 * `lm:sync` 里已有的 `baseline` 字段形状不动（老存档照常读），rev 表可以独立演进。
 *
 * **它与基线由同一轮同步一起更新**，但两者的失效条件不同，这点容易搞混：
 * - 本机**改了内容** → 哈希变了（会推 `put`），而 rev **仍然有效** ——
 *   因为服务端那一版确实还是它。带上这个 rev 正是「两边都改过」能被服务端标成
 *   `conflict` 的前提（恒填 0 会让每次推送都被标冲突，把提示栏淹掉）。
 * - 只有**拉到了新的一版**（`/v1/changes` 或 `/v1/snapshot` 给了更大的 rev）才更新 rev。
 * - 删掉 `lm:sync` 时两张表一起丢，退化成「rev 全 0」，等价于首次全量推送。
 */
export type RevTable = Record<string, Record<string, number>>;

/**
 * 不产生 `delete` 的模块（模块单值）。
 *
 * spec 定死 `dietGoals` 是模块单值、整块替换：清空等于写回默认目标，删掉整个模块没有意义。
 * 从 `units.ts` 的读取器看它恒定产出单键、走不到删除分支，但删除是不可逆方向，
 * 这里显式挡住而不是依赖那个巧合。
 */
const BASELINE_SINGLETON_MODULES: ReadonlySet<string> = new Set(['dietGoals']);

/**
 * `module:key` → rev 的查询函数；查不到返回 0（= 客户端认为服务端还没有这条）。
 *
 * 默认实现从 rev 表里读（见 `revTableResolver`）。单独的接缝是给测试与
 * 「首次全量推送」这类场景用的 —— 那时表是空的，一律 0。
 */
export type RevResolver = (module: string, key: string) => number;

/** 从 rev 表做一个解析器：查不到就是 0 */
export function revTableResolver(revs: RevTable): RevResolver {
  return (module, key) => revs[module]?.[key] ?? 0;
}

/**
 * 规范化：递归按键名排序后再序列化。
 *
 * **这一步不能省。** `JSON.stringify` 的输出取决于对象的键**构造顺序**，
 * 同一条记录经由不同路径构造（例如导入时 `{...a, ...b}` 与 store 的 `map` 重建）
 * 会得到不同的字符串 —— 直接哈希就会让同一条记录算出两个值，
 * 于是每次同步都把它当成「改过」重推一遍（幂等靠服务端兜，但基线形同虚设）。
 *
 * 数组**保持原序**：数组的顺序有语义（例如食物清单、打卡日志的先后），
 * 排序会抹掉真实差异 —— 那是另一个方向的错误。
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/** 递归按键名排序；数组逐项递归但保持顺序 */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value !== 'object' || value === null) return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortValue((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/** 哈希取前 16 个十六进制字符：够避免碰撞（64 bit），又比全量 64 字符省一半空间 */
export const HASH_LENGTH = 16;

/**
 * 内容哈希：`SHA-256(规范化 JSON)` 的前 16 个十六进制字符。
 *
 * 用 `crypto.subtle`（WebCrypto）。它在**安全上下文**（localhost / https）里可用 ——
 * 本应用正是跑在 localhost，与 `utils/id.ts` 用 `crypto.randomUUID` 是同一个前提。
 */
export async function contentHash(value: unknown): Promise<string> {
  const canonical = canonicalize(value);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, HASH_LENGTH);
}

/**
 * 对当前本机数据算一份基线（内容哈希表）。
 *
 * 这是「一轮同步成功后」要写进 `lm:sync.baseline` 的那份东西 ——
 * 它记录的正是**刚刚推上去／拉下来的状态**，所以下一轮与它比对得到的就是「自那以后改了什么」。
 *
 * 它与 rev 表（`RevTable`）由同一轮同步一起更新：哈希回答「改没改」，
 * rev 回答「服务端那一版是几」，合起来才是下一轮推送要的全部信息。
 */
export async function computeBaseline(): Promise<Baseline> {
  const units = readUnits();
  const baseline: Baseline = {};

  for (const [module, entries] of Object.entries(units)) {
    const hashes: Record<string, string> = {};
    for (const [key, record] of Object.entries(entries)) {
      hashes[key] = await contentHash(record);
    }
    baseline[module] = hashes;
  }
  return baseline;
}

/**
 * 比出本机相对基线的改动。
 *
 * 四种判定按 spec 那张表；**没动的条目一个都不进结果**（「没动」的意义就在这里：
 * 一次同步只推真的改过的那几条，而不是把整库按旧值盖章 ——
 * 服务端 spec 明写「一台离线一个月的设备回来时，动的是它真改过的那几十条」）。
 *
 * `revOf` 提供每条记录的 `baseRev`。不传就是**一律 0**（= 服务端还没有这条），
 * 对应「首次全量推送」；常规调用传 `revTableResolver(revs)`。
 */
export async function diffAgainstBaseline(
  baseline: Baseline,
  revOf: RevResolver = () => 0,
): Promise<SyncChange[]> {
  const units = readUnits();
  const changes: SyncChange[] = [];

  for (const [module, entries] of Object.entries(units)) {
    const known = baseline[module] ?? {};

    // 当前有的：与基线比哈希，判「新增」或「改过」
    for (const [key, value] of Object.entries(entries)) {
      const hash = await contentHash(value);
      if (known[key] === hash) continue; // 没动 → 什么都不做
      changes.push({
        module,
        key,
        op: 'put',
        record: toPushRecord(module, key, value),
        baseRev: revOf(module, key),
      });
    }

    // 基线里有、当前没有：删了。
    // **注意方向**：只遍历基线（不是当前），所以「基线里没有的 key 永远推不出 delete」——
    // 这条是「删掉 lm:sync 不会误删任何东西」的实现保证。
    for (const key of Object.keys(known)) {
      if (key in entries) continue;
      // 模块单值（`dietGoals`）不产生 `delete`：spec 定死「清空等于写回默认目标」。
      // 它的读取器恒定产出一个单键，所以这里本来就走不到 —— 但删除是不可逆方向，
      // 不靠「反正走不到」这种巧合，显式挡住。真值仍会经哈希分支推出 `put`。
      if (BASELINE_SINGLETON_MODULES.has(module)) continue;
      changes.push({ module, key, op: 'delete', baseRev: revOf(module, key) });
    }
  }

  return changes;
}

/** 单元的 kind 表；用来决定推送载荷里 `record` 该长什么样 */
const UNIT_KINDS: ReadonlyMap<string, string> = new Map(
  SYNC_UNITS.map((unit) => [unit.module, unit.kind]),
);

/**
 * 把单元的值包成推送载荷要的 `record`。
 *
 * 三种单元的**值形状并不一样**，不能一律原样塞进 `record`：
 * - 记录集合：值就是那条记录本身 → 原样。
 * - `dietGoals`（模块单值）：值就是整块目标对象 → 原样。
 * - `dietWater`（日期键映射）：值是**裸数字**（那天几杯），而服务端要的 `record` 是
 *   **单键对象** `{ '2026-10-02': 8 }` —— 服务端的 `waterValueOf` 就是按
 *   「单键对象里取那个数字」写的，直接推裸数字会让它取不到值。
 *
 * 这一步漏掉的话，饮水会静默推成 `record: 8`，服务端把它当无法解析的形状。
 */
function toPushRecord(module: string, key: string, value: unknown): Record<string, unknown> {
  if (UNIT_KINDS.get(module) === 'dateMap') return { [key]: value };
  return value as Record<string, unknown>;
}

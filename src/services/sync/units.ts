import { useBookStore } from '../../store/bookStore';
import { useBodyStore } from '../../store/bodyStore';
import { useDevStore } from '../../store/devStore';
import { useDietStore } from '../../store/dietStore';
import { useFitnessStore } from '../../store/fitnessStore';
import { useFocusStore } from '../../store/focusStore';
import { useGameStore } from '../../store/gameStore';
import { useGoalStore } from '../../store/goalStore';
import { useHabitStore } from '../../store/habitStore';
import { useJournalStore } from '../../store/journalStore';
import { useLibraryStore } from '../../store/libraryStore';
import { useReviewStore } from '../../store/reviewStore';
import { useTaskStore } from '../../store/taskStore';
import { useWritingStore } from '../../store/writingStore';

/**
 * 同步单位表：以「哪个 store → 怎么切成单元」列死。
 *
 * 表来自 `.scratch/sync-service/spec.md` 的「同步单位（三档 + 不同步项）」，
 * **两份必须一致** —— `units.test.ts` 会断言这里覆盖了服务端那份模块清单里的每一个模块。
 * 服务端那份清单（`src/server/config.ts` 的 `SYNC_MODULES`）与备份模块名
 * （`src/services/schemas.ts` 的 `BACKUP_MODULES`）逐字相等，所以下面用的就是**备份的模块名**。
 *
 * 三种单元类型：
 * - **记录集合**（绝大多数）：key = 记录的 `id`，可以 upsert 也可以 delete。
 * - **日期键映射**：只有 `dietWater`，key = 日期串（如 `2026-10-02`），值是**裸数字**（那天几杯）。
 * - **模块单值**：只有 `dietGoals`，key 固定为模块名本身，整块替换、**不产生 delete**
 *   （清空等于写回默认目标，删掉整个模块没有意义）。
 *
 * ## 不同步项（一个都不在本表里，逐条写明为什么）
 *
 * - **`lm:theme` / `lm:ui`**（明暗 / 皮肤 / 主题色 / 密度 / 侧栏折叠）：每台设备各自的 UI 状态。
 *   三台设备有三套合理值，而服务端只有一份共享副本 —— 装谁的都是随机的，拉下来就是拿一台设备的
 *   偏好盖掉另一台的。**它们仍然随备份导出**（换机恢复外观只有手动导备份这一条路）。
 * - **`lm:focus` 的 `active`**：正在跑的专注计时器是**瞬时状态**。同步它会在另一台设备上
 *   凭空冒出一个假的计时（那边没有人真的在专注），而 `focusSessions` 流水才是要同步的东西。
 * - **`lm:library` 的 `recent*Names`**（`recentFoodNames` / `recentExerciseNames`）：
 *   这些名字是**由使用过程重新长出来的**（选择器顶部的一键直达），重建不了才需要同步。
 *   用户真正创造的数据是 `customFoods` / `customExercises`，那两个在表里。
 * - **`settings`**：`readAllData()` 会产出它，但它**不是同步单元** —— 理由与 `lm:theme` / `lm:ui`
 *   同一条（每台设备各自的 UI 状态），定案见服务端 spec「`settings` 键不进副本」。
 *   服务端的结构守卫里它不在册，推上去会按「模块名不在册」被拒。
 */

/** 一个单元怎么读、怎么写。上面三种类型的公共形状。 */
export interface SyncUnit {
  /** 备份 / 副本里的模块名 */
  module: string;
  /** 单元类型的判别字段，也让「这类 key 怎么来的」在类型上可见 */
  kind: 'collection' | 'dateMap' | 'singleton';
  /** 读出这个模块的全部单元：单元 key → 该单元的整份内容 */
  read: () => Record<string, unknown>;
}

/** 记录集合的一个单元：整条记录，key 是记录的 `id` */
export interface SyncRecord {
  id: string;
  [field: string]: unknown;
}

/**
 * 把「记录的 `id`」当 key 读出整个集合。
 *
 * 没有 `id`（或 `id` 不是非空字符串）的条目**直接跳过** —— 服务端的结构守卫会拒收它们，
 * 而推一条必然被拒的载荷只会让整轮同步失败。这些条目在界面上本来就当不了 key 用，
 * `store/normalize.ts` 的归一化层也已经在读盘时给它们补过 id。
 */
function keyById(records: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!Array.isArray(records)) return result;

  for (const record of records) {
    if (typeof record !== 'object' || record === null || Array.isArray(record)) continue;
    const id = (record as Record<string, unknown>).id;
    if (typeof id !== 'string' || id.trim() === '') continue;
    result[id] = record;
  }
  return result;
}

/**
 * 记录集合单元的读法：从某个 store 取一个数组字段。
 *
 * 用 `getState()` 而不是订阅：同步是「按下按钮才发生」的一次性动作，
 * 订阅只会让调用方跟着每次改动重渲染，`getState()` 也天然避开了闭包过期
 * （与 `services/appData.ts` 的 `readAllData()` 同一取向）。
 */
function collection(module: string, getRecords: () => unknown): SyncUnit {
  return { module, kind: 'collection', read: () => keyById(getRecords()) };
}

/**
 * `dietWater`：日期键映射，key = 日期串，值是**裸数字**。
 *
 * 形状绝不能包一层 `{ glasses: 8 }`：客户端 `sanitizeWater`（`utils/diet.ts`）
 * 只认数字值，包一层会把每一个键都当脏值剔掉，用户的饮水**静默变空**
 * （服务端 spec 行 147 一度写成包一层，2026-10-03 已更正为扁平）。
 */
function dateMap(module: string, getMap: () => Record<string, unknown>): SyncUnit {
  return {
    module,
    kind: 'dateMap',
    read: () => {
      const result: Record<string, unknown> = {};
      for (const [date, glasses] of Object.entries(getMap())) {
        if (date === '') continue;
        if (typeof glasses !== 'number' || !Number.isFinite(glasses)) continue;
        result[date] = glasses;
      }
      return result;
    },
  };
}

/**
 * `dietGoals`：模块单值，key 固定为模块名本身，整块替换、不产生 `delete`。
 *
 * 读出来是 `{ [module]: value }` 这样一个单键的单元表，好让上游对三种类型只有一套 diff 逻辑。
 */
function singleton(module: string, getValue: () => unknown): SyncUnit {
  return {
    module,
    kind: 'singleton',
    read: () => ({ [module]: getValue() }),
  };
}

/**
 * 同步单位表。**顺序按 store 分组**（便于对照阅读），与服务端 `SYNC_MODULES` 的顺序不同 ——
 * 两边分组方式不同（服务端按备份模块名列出），而模块顺序在两边都不承重：
 * 没有任何地方按下标取模块、也没有逐字节比对 `data` 段的键序。
 * `parity-verify.test.ts` 断言的是**集合**相等（一个模块都不能少、不能多）。
 *
 * 每个条目对应服务端 spec「同步单位」表里的一个单元 —— 那张表的一行可能切出多个单元
 * （例如 `lm:diet` 一行切出四个）。`units.test.ts` 断言这里覆盖了全部 23 个模块。
 */
export const SYNC_UNITS: readonly SyncUnit[] = [
  // lm:tasks
  collection('tasks', () => useTaskStore.getState().tasks),
  collection('memos', () => useTaskStore.getState().memos),
  // lm:books
  collection('books', () => useBookStore.getState().books),
  collection('readingSessions', () => useBookStore.getState().sessions),
  // lm:dev
  collection('devProjects', () => useDevStore.getState().projects),
  collection('workSessions', () => useDevStore.getState().sessions),
  // lm:writing
  collection('writingProjects', () => useWritingStore.getState().projects),
  // lm:fitness
  collection('fitnessPlans', () => useFitnessStore.getState().plans),
  collection('fitnessRecords', () => useFitnessStore.getState().records),
  // lm:body
  collection('bodyMetrics', () => useBodyStore.getState().records),
  // lm:diet —— 记录集合 + 日期键映射 + 模块单值三档都在这一个 store 里
  collection('dietRecords', () => useDietStore.getState().records),
  collection('mealTemplates', () => useDietStore.getState().templates),
  dateMap('dietWater', () => useDietStore.getState().water),
  singleton('dietGoals', () => useDietStore.getState().goals),
  // lm:games
  collection('games', () => useGameStore.getState().games),
  collection('gameSessions', () => useGameStore.getState().sessions),
  // lm:habits —— 打卡日志内嵌在记录里（`Habit.log`），不单独成单元
  collection('habits', () => useHabitStore.getState().habits),
  // lm:focus —— 只同步 sessions；active 是瞬时状态，见文件头「不同步项」
  collection('focusSessions', () => useFocusStore.getState().sessions),
  // lm:review
  collection('reviews', () => useReviewStore.getState().reviews),
  // lm:journal
  collection('journal', () => useJournalStore.getState().entries),
  // lm:goals
  collection('goals', () => useGoalStore.getState().goals),
  // lm:library —— 只同步用户自建的两个集合；recent*Names 见文件头「不同步项」
  collection('customFoods', () => useLibraryStore.getState().customFoods),
  collection('customExercises', () => useLibraryStore.getState().customExercises),
];

/** 按模块名取单元，给「拿到一条远端变更，该往哪落」用 */
export const SYNC_UNIT_BY_MODULE: ReadonlyMap<string, SyncUnit> = new Map(
  SYNC_UNITS.map((unit) => [unit.module, unit]),
);

/** 表里所有模块名（与服务端的 `SYNC_MODULES` 应当逐字且顺序一致） */
export function syncUnitModules(): string[] {
  return SYNC_UNITS.map((unit) => unit.module);
}

/**
 * 读出当前本机数据，按「模块 → 单元 key → 整份内容」铺平。
 *
 * 这是内容哈希基线的输入：同步引擎对每个单元算哈希、与上一轮的基线比对，
 * 得出「新增 / 改过 / 删了 / 没动」四种判定。**基线是可丢弃的派生物**，
 * 所以这个函数只读不写，随时可以重算。
 */
export function readUnits(): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const unit of SYNC_UNITS) {
    result[unit.module] = unit.read();
  }
  return result;
}

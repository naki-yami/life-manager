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
import { SYNC_UNIT_BY_MODULE } from './units';

/**
 * 把远端的整条记录写回 store：**唯一的落库入口**。
 *
 * ## 为什么走 `setState` 而不是各模块的 action
 *
 * 远端那份记录是**另一台设备写完、而且经过客户端 schema 校验的整条记录**。
 * 走各模块自己的 `updateRecord` 会把派生字段按**本机逻辑**重算一遍
 * （例如饮食记录的四个合计数、开发项目的 `hoursSpent`），两端反而可能算出不同结果 ——
 * 于是同一条记录在两台设备上长得不一样，而「落库后逐字段等于服务端那一份」这条验收就不成立。
 *
 * 代价是**落库不重跑 store 的业务不变式**。这是知情接受的取舍（client spec「落库方式」一节）：
 * 记录本身带合计数，正常路径上没有差异；换来的好处是同步写入不碰 16 个 store 的内部，
 * 不必为了同步去重构数据层。
 *
 * ## 只碰目标那一条
 *
 * 每个 upsert 都只按 key 替换 / 追加**那一条**，其余记录**原样引用传递**（不重建、不重算）——
 * 「只变那一条，另一条逐字段不变」正是 client spec Testing Decisions 第 2 条要锁住的东西。
 */

/** 落库的一条变更。`record` 在 `op: 'delete'` 时不带。 */
export interface AppliedChange {
  module: string;
  key: string;
  op: 'put' | 'delete';
  record?: Record<string, unknown>;
}

/** 落库结果：被跳过的条目要能被调用方看见，绝不静默吞掉 */
export interface ApplyResult {
  applied: number;
  /**
   * 被跳过的条目与原因。
   *
   * 「静默丢数据是本仓库的头号禁忌」—— 落不下去的条目必须回报，
   * 由同步引擎决定记日志、计数还是提示用户。
   */
  skipped: Array<{ module: string; key: string; reason: string }>;
}

/**
 * 在记录数组里按 key upsert 一条：找得到就就地替换，找不到就追加。
 *
 * 返回新数组，**其余条目原样引用**（没被碰过的那条在两个数组里是同一个对象）。
 */
function upsertInArray(
  records: readonly unknown[],
  key: string,
  record: Record<string, unknown>,
): unknown[] {
  const index = records.findIndex(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      !Array.isArray(item) &&
      (item as Record<string, unknown>).id === key,
  );

  if (index === -1) return [...records, record];
  return records.map((item, at) => (at === index ? record : item));
}

/** 从记录数组里按 key 删一条；找不到就原样返回（幂等，重复投递同一墓碑不会出错） */
function deleteFromArray(records: readonly unknown[], key: string): unknown[] {
  const next = records.filter(
    (item) =>
      !(
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) &&
        (item as Record<string, unknown>).id === key
      ),
  );
  // 没删掉任何东西时把原数组原样交回去，避免下游拿到一个恒新的引用
  return next.length === records.length ? (records as unknown[]) : next;
}

/** 记录集合的落库：写某个 store 的数组字段 */
function applyToArray(
  getArray: () => unknown[],
  setArray: (next: unknown[]) => void,
  change: AppliedChange,
): void {
  const current = getArray();
  if (change.op === 'delete') {
    setArray(deleteFromArray(current, change.key));
    return;
  }
  if (change.record === undefined) return;
  setArray(upsertInArray(current, change.key, change.record));
}

/**
 * `dietWater` 的落库：日期 → 杯数。
 *
 * 值必须是**裸数字**（`sanitizeWater` 只认数字）。`record` 按服务端的口径可能是
 * 单键对象 `{ '2026-10-02': 8 }`（整条记录 = 那一天的单元），此时取 `record[key]`；
 * 也容忍直接给数字或给旧形状 `{ glasses: 8 }`。
 *
 * 取不出有限数字时**不写**并回报跳过 —— 写一个 `undefined` 进去，
 * 下次读盘会被 `sanitizeWater` 剔掉，等于静默丢一天的数据。
 */
function applyToWater(key: string, record: Record<string, unknown> | undefined): boolean {
  const glasses = extractGlasses(key, record);
  if (glasses === null) return false;

  useDietStore.setState((state) => ({ water: { ...state.water, [key]: glasses } }));
  return true;
}

/** 从各种可能的形状里取那天的杯数；取不到返回 null */
function extractGlasses(key: string, record: Record<string, unknown> | undefined): number | null {
  if (record === undefined) return null;

  const direct = record[key];
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;

  const fromGlasses = record.glasses;
  if (typeof fromGlasses === 'number' && Number.isFinite(fromGlasses)) return fromGlasses;

  // 单值对象：整条记录只有一个值且是数字
  const values = Object.values(record);
  if (values.length === 1 && typeof values[0] === 'number' && Number.isFinite(values[0])) {
    return values[0];
  }
  return null;
}

/**
 * 落一条远端变更到本地 store。
 *
 * 返回被跳过的原因（`null` 表示落库成功）。调用方负责收集与上报。
 */
function applyOne(change: AppliedChange): string | null {
  const unit = SYNC_UNIT_BY_MODULE.get(change.module);
  // 服务端只发在册模块，走到这里说明两边模块清单漂移了 —— 必须说出来
  if (unit === undefined) return `模块 ${change.module} 不在同步单位表里`;

  if (unit.kind === 'singleton') return applySingleton(change);
  if (unit.kind === 'dateMap') return applyDateMap(change);

  if (change.op === 'put' && change.record === undefined) return 'put 没有带 record';
  applyRecordUnit(change);
  return null;
}

/** 模块单值：整块替换。**不产生 delete** —— 清空等于写回默认目标 */
function applySingleton(change: AppliedChange): string | null {
  if (change.op === 'delete') {
    // 服务端 spec 明确：`dietGoals` 是模块单值，整块替换、不产生 delete。
    // 真收到就跳过并回报，而不是把整个模块删掉（那会让用户的每日目标消失）。
    return 'dietGoals 是模块单值，不产生 delete';
  }
  if (change.record === undefined) return 'put 没有带 record';

  useDietStore.setState({ goals: change.record as { calories: number; protein: number } });
  return null;
}

/** 日期键映射（饮水）：按日期键写一个数字 */
function applyDateMap(change: AppliedChange): string | null {
  if (change.op === 'delete') {
    useDietStore.setState((state) => {
      const water = { ...state.water };
      delete water[change.key];
      return { water };
    });
    return null;
  }

  if (!applyToWater(change.key, change.record)) {
    return '饮水的值不是有限数字';
  }
  return null;
}

/** 记录集合：按 `id` upsert / delete 那个数组字段 */
function applyRecordUnit(change: AppliedChange): void {
  switch (change.module) {
    case 'tasks':
      return applyToArray(
        () => useTaskStore.getState().tasks,
        (next) => useTaskStore.setState({ tasks: next as never }),
        change,
      );
    case 'memos':
      return applyToArray(
        () => useTaskStore.getState().memos,
        (next) => useTaskStore.setState({ memos: next as never }),
        change,
      );
    case 'books':
      return applyToArray(
        () => useBookStore.getState().books,
        (next) => useBookStore.setState({ books: next as never }),
        change,
      );
    case 'readingSessions':
      return applyToArray(
        () => useBookStore.getState().sessions,
        (next) => useBookStore.setState({ sessions: next as never }),
        change,
      );
    case 'devProjects':
      return applyToArray(
        () => useDevStore.getState().projects,
        (next) => useDevStore.setState({ projects: next as never }),
        change,
      );
    case 'workSessions':
      return applyToArray(
        () => useDevStore.getState().sessions,
        (next) => useDevStore.setState({ sessions: next as never }),
        change,
      );
    case 'writingProjects':
      return applyToArray(
        () => useWritingStore.getState().projects,
        (next) => useWritingStore.setState({ projects: next as never }),
        change,
      );
    case 'fitnessPlans':
      return applyToArray(
        () => useFitnessStore.getState().plans,
        (next) => useFitnessStore.setState({ plans: next as never }),
        change,
      );
    case 'fitnessRecords':
      return applyToArray(
        () => useFitnessStore.getState().records,
        (next) => useFitnessStore.setState({ records: next as never }),
        change,
      );
    case 'bodyMetrics':
      return applyToArray(
        () => useBodyStore.getState().records,
        (next) => useBodyStore.setState({ records: next as never }),
        change,
      );
    case 'dietRecords':
      return applyToArray(
        () => useDietStore.getState().records,
        (next) => useDietStore.setState({ records: next as never }),
        change,
      );
    case 'mealTemplates':
      return applyToArray(
        () => useDietStore.getState().templates,
        (next) => useDietStore.setState({ templates: next as never }),
        change,
      );
    case 'games':
      return applyToArray(
        () => useGameStore.getState().games,
        (next) => useGameStore.setState({ games: next as never }),
        change,
      );
    case 'gameSessions':
      return applyToArray(
        () => useGameStore.getState().sessions,
        (next) => useGameStore.setState({ sessions: next as never }),
        change,
      );
    case 'habits':
      return applyToArray(
        () => useHabitStore.getState().habits,
        (next) => useHabitStore.setState({ habits: next as never }),
        change,
      );
    case 'focusSessions':
      return applyToArray(
        () => useFocusStore.getState().sessions,
        (next) => useFocusStore.setState({ sessions: next as never }),
        change,
      );
    case 'reviews':
      return applyToArray(
        () => useReviewStore.getState().reviews,
        (next) => useReviewStore.setState({ reviews: next as never }),
        change,
      );
    case 'journal':
      return applyToArray(
        () => useJournalStore.getState().entries,
        (next) => useJournalStore.setState({ entries: next as never }),
        change,
      );
    case 'goals':
      return applyToArray(
        () => useGoalStore.getState().goals,
        (next) => useGoalStore.setState({ goals: next as never }),
        change,
      );
    case 'customFoods':
      return applyToArray(
        () => useLibraryStore.getState().customFoods,
        (next) => useLibraryStore.setState({ customFoods: next as never }),
        change,
      );
    case 'customExercises':
      return applyToArray(
        () => useLibraryStore.getState().customExercises,
        (next) => useLibraryStore.setState({ customExercises: next as never }),
        change,
      );
    default:
      // 表里有这个模块、这里却没有分支 —— 只有加模块时漏改才会发生，别静默
      throw new Error(`模块 ${change.module} 在同步单位表里，但 apply 没有对应的落库分支`);
  }
}

/**
 * 落一批远端变更。
 *
 * **逐条独立**：一条失败不影响后面的条目（一条脏记录不该让整轮拉取白跑），
 * 失败的原因收集在返回值的 `skipped` 里由调用方上报。
 */
export function applyChanges(changes: readonly AppliedChange[]): ApplyResult {
  const skipped: ApplyResult['skipped'] = [];
  let applied = 0;

  for (const change of changes) {
    const reason = applyOne(change);
    if (reason === null) applied += 1;
    else skipped.push({ module: change.module, key: change.key, reason });
  }

  return { applied, skipped };
}

/** 落一条远端变更；等价于 `applyChanges([change])`，给调用方少写一层数组 */
export function applyChange(change: AppliedChange): ApplyResult {
  return applyChanges([change]);
}

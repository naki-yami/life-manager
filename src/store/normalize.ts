import { z } from 'zod';
import { createId } from '../utils/id';

/**
 * 逐条记录的结构归一化。
 *
 * 背景：`migrateState()` 只做「store 根级」的浅合并，数组里单条记录新增的字段
 * （例如给 Task 加 subtasks）不会被回填。以前是靠 bump 版本号 + 在 migrate 里手写
 * map 补字段，但 zustand 只在版本号变化时才调用 migrate —— 版本号一旦升到最新，
 * 那段补字段的代码就再也不会执行了。
 *
 * 这里复用 `src/services/schemas.ts` 里那套（导入备份时已经在用的）zod schema，
 * 把归一化做成**幂等、每次 rehydrate 都跑**的一步，于是：
 * - 不管数据是什么时候存的、中间跨了几版，读出来一定是当前结构；
 * - 各页面里那些 `task.subtasks ?? []` 的兜底可以逐步删掉。
 */

/** 把任意持久化数据安全地当成对象来读 */
export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/** 读一个布尔开关；读到脏数据时退回默认值，界面不会因为 undefined 变样 */
export function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** 读一个有限数字（用于设置项，例如每日热量目标） */
export function pickNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 读一个枚举值；不在允许集合里就退回默认值 */
export function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** 读一个「日期 -> 数字」的映射（饮水打卡等），顺手剔掉非数字的脏值 */
export function pickNumberMap(value: unknown): Record<string, number> {
  const entries = Object.entries(asRecord(value)).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]),
  );
  return Object.fromEntries(entries);
}

interface ShapefulSchema {
  shape?: Record<string, z.ZodTypeAny>;
}

/**
 * 字段级修补：把「类型不对、会导致整条记录校验失败」的字段换成 schema 里的默认值。
 * 例如 subtasks 被写成了字符串，就退回 []，而不是让整条任务被丢掉。
 */
function repairFields(schema: z.ZodTypeAny, raw: Record<string, unknown>): Record<string, unknown> {
  const shape = (schema as ShapefulSchema).shape;
  if (!shape) return raw;

  const repaired: Record<string, unknown> = { ...raw };
  for (const [key, field] of Object.entries(shape)) {
    if (field.safeParse(repaired[key]).success) continue;
    const fallback = field.safeParse(undefined);
    if (fallback.success) repaired[key] = fallback.data;
  }
  return repaired;
}

/** 丢了 id 的记录在界面上没法当 key 用，直接重发一个，总比整条丢掉好 */
function repairId(schema: z.ZodTypeAny, raw: Record<string, unknown>): void {
  const shape = (schema as ShapefulSchema).shape;
  if (!shape?.id) return;
  if (shape.id.safeParse(raw.id).success) return;
  raw.id = createId();
}

/** 归一化单条记录；结构已经坏到修不回来时返回 null */
export function normalizeRecord<S extends z.ZodTypeAny>(
  schema: S,
  raw: unknown,
): z.infer<S> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;

  const candidate = { ...(raw as Record<string, unknown>) };
  repairId(schema, candidate);

  const direct = schema.safeParse(candidate);
  if (direct.success) {
    // 用原始对象打底再覆盖解析结果：schema 会剥掉未知字段，
    // 而未知字段可能是更高版本写下的，留着才能安全回退。
    return { ...candidate, ...(direct.data as Record<string, unknown>) } as z.infer<S>;
  }

  const repaired = schema.safeParse(repairFields(schema, candidate));
  if (repaired.success) {
    return { ...candidate, ...(repaired.data as Record<string, unknown>) } as z.infer<S>;
  }

  return null;
}

let droppedRecords = 0;

/**
 * 归一化一个记录数组。
 *
 * 读不到数组（字段缺失 / 类型不对）时返回空数组 —— 和导入逻辑一致：
 * 只有「明确的数组」才被当作数据。
 *
 * 修不回来的单条记录会被丢弃。这是有意的取舍：留着一条 subtasks 是 undefined 的任务，
 * 页面下次读它就会崩，比少一条记录更糟。丢弃数量可以通过 getDroppedRecordCount() 观察。
 */
export function normalizeArray<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S>[] {
  if (!Array.isArray(raw)) return [];

  const items: z.infer<S>[] = [];
  for (const entry of raw) {
    const normalized = normalizeRecord(schema, entry);
    if (normalized === null) {
      droppedRecords += 1;
      continue;
    }
    items.push(normalized);
  }
  return items;
}

/** 归一化过程中被丢弃的记录条数（诊断用） */
export function getDroppedRecordCount(): number {
  return droppedRecords;
}

export function resetNormalizeStats(): void {
  droppedRecords = 0;
}

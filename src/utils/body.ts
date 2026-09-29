import type { BodyMetric } from '../types';
import { isDayKey } from './date';
import type { DayPoint } from './stats';

/**
 * 身体指标（体重 / 体脂 / 围度）的读写与统计。
 *
 * 三个约定：
 * - 数值一律**保留一位小数**：家用体脂秤与软尺的精度就到这里，多存的小数位只是浮点噪声；
 * - **非正数视为「没记」**：0kg 不是有效读数，统一收成 undefined，
 *   读取处就不必到处写 `> 0` 判断，也不会在趋势图上画出一个假的 0；
 * - `measurements` 的键允许自建，未知部位原样保留，只在展示时回退成键名。
 */

export interface BodyFieldMeta {
  /** 字段键；内置围度部位与 `measurements` 的键共用同一套命名 */
  key: string;
  label: string;
  unit: string;
  /** 输入框步进 */
  step: number;
  /**
   * 输入框与存储共用的边界：
   * min 只要求「是个正数」（1），max 用来挡「把身高填进胸围」这类脏数据。
   * 两处共用一套数字，界面上能填的就一定能存下去，不会出现「填了却没记上」。
   */
  min: number;
  max: number;
}

/** 体脂率是百分比，超过 100 一定是脏数据 */
export const MAX_BODY_FAT = 100;
/** 体重与围度的存储上限：够宽容到装下任何真人，又能挡住「把身高填进胸围」这类脏数据 */
export const MAX_BODY_READING = 500;
/** 一条记录最多存这么多围度部位，避免脏数据把单条记录撑爆 */
const MAX_MEASUREMENT_COUNT = 20;
const MAX_PART_KEY_LENGTH = 24;

/** 任何身体读数的下界：0 与负数不是读数，是「没记」 */
export const MIN_BODY_READING = 1;

/** 体重：高频项，所以是独立字段而不是塞进 measurements */
export const WEIGHT_META: BodyFieldMeta = {
  key: 'weight',
  label: '体重',
  unit: 'kg',
  step: 0.1,
  min: MIN_BODY_READING,
  max: MAX_BODY_READING,
};

/** 体脂率：同为高频项 */
export const BODY_FAT_META: BodyFieldMeta = {
  key: 'bodyFat',
  label: '体脂率',
  unit: '%',
  step: 0.1,
  min: MIN_BODY_READING,
  max: MAX_BODY_FAT,
};

/** 两个独立字段，按界面顺序排列 */
export const BODY_FIELDS: readonly BodyFieldMeta[] = [WEIGHT_META, BODY_FAT_META];

/** 内置围度部位，顺序即界面顺序（胸 → 腰 → 臀 → 臂 → 腿） */
export const MEASUREMENT_PARTS: readonly BodyFieldMeta[] = [
  {
    key: 'chest',
    label: '胸围',
    unit: 'cm',
    step: 0.5,
    min: MIN_BODY_READING,
    max: MAX_BODY_READING,
  },
  {
    key: 'waist',
    label: '腰围',
    unit: 'cm',
    step: 0.5,
    min: MIN_BODY_READING,
    max: MAX_BODY_READING,
  },
  {
    key: 'hip',
    label: '臀围',
    unit: 'cm',
    step: 0.5,
    min: MIN_BODY_READING,
    max: MAX_BODY_READING,
  },
  {
    key: 'arm',
    label: '臂围',
    unit: 'cm',
    step: 0.5,
    min: MIN_BODY_READING,
    max: MAX_BODY_READING,
  },
  {
    key: 'thigh',
    label: '腿围',
    unit: 'cm',
    step: 0.5,
    min: MIN_BODY_READING,
    max: MAX_BODY_READING,
  },
];

/** 保留一位小数；非有限值原样返回，由调用方决定怎么处理 */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 部位键 → 中文标签；自定义部位没有预设标签，回退成键名本身 */
export function measurementLabel(key: string): string {
  return MEASUREMENT_PARTS.find((part) => part.key === key)?.label ?? key;
}

/**
 * 把任意输入读成一个有效读数：非数字、非正数一律给 undefined（= 那天没记这一项），
 * 超出上限的按上限收（体脂 100%，其余 500），并统一保留一位小数。
 */
export function readMetric(
  value: unknown,
  key: 'weight' | 'bodyFat' | 'measurement',
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  const max = key === 'bodyFat' ? MAX_BODY_FAT : MAX_BODY_READING;
  return Math.min(round1(value), max);
}

/** 清洗围度表：丢掉非法键与非法值，0 值不落盘 */
export function sanitizeMeasurements(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};

  const measurements: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(measurements).length >= MAX_MEASUREMENT_COUNT) break;
    const part = rawKey.trim();
    if (!part || part.length > MAX_PART_KEY_LENGTH) continue;
    const reading = readMetric(rawValue, 'measurement');
    if (reading === undefined) continue;
    measurements[part] = reading;
  }
  return measurements;
}

/** 按日期升序；同一天多条时用创建时间兜底，保证「较上次」的口径稳定 */
export function sortedMetrics(records: readonly BodyMetric[]): BodyMetric[] {
  return records
    .filter((record) => isDayKey(record.date))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

/** 读一条记录里的独立字段 */
export function bodyValueOf(record: BodyMetric, key: 'weight' | 'bodyFat'): number | undefined {
  return readMetric(key === 'weight' ? record.weight : record.bodyFat, key);
}

export function weightOf(record: BodyMetric): number | undefined {
  return bodyValueOf(record, 'weight');
}

export function bodyFatOf(record: BodyMetric): number | undefined {
  return bodyValueOf(record, 'bodyFat');
}

/** 生成「读某个围度部位」的取值函数，便于直接交给 bodyPoints / changeFromPrevious */
export function measurementOf(part: string): (record: BodyMetric) => number | undefined {
  return (record) => readMetric(record.measurements[part], 'measurement');
}

/** 这条记录是否真的记了点什么；全空说明用户把当天的数据清空了 */
export function hasAnyValue(record: BodyMetric): boolean {
  return (
    bodyValueOf(record, 'weight') !== undefined ||
    bodyValueOf(record, 'bodyFat') !== undefined ||
    Object.keys(record.measurements).length > 0
  );
}

/**
 * 部位排序：内置部位按定义顺序，自定义部位统一排在其后并按字母序。
 * 界面上出现的每一个部位列表都走它，保证同一个部位永远在同一个位置。
 */
export function compareMeasurementKeys(a: string, b: string): number {
  const order = (key: string): number => {
    const index = MEASUREMENT_PARTS.findIndex((part) => part.key === key);
    return index === -1 ? MEASUREMENT_PARTS.length : index;
  };
  return order(a) - order(b) || a.localeCompare(b);
}

/** 这些记录里出现过的全部围度部位，按统一顺序排列 */
export function measurementKeysOf(records: readonly BodyMetric[]): string[] {
  const keys = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record.measurements)) keys.add(key);
  }
  return [...keys].sort(compareMeasurementKeys);
}
export interface BodyEntry {
  key: string;
  label: string;
  unit: string;
  value: number;
}

/**
 * 一条记录里所有有值的项，按 体重 → 体脂 → 内置部位 → 自定义部位 展开。
 * 列表、日历与趋势选择都靠它渲染，保证同一份数据只有一种展示顺序。
 */
export function bodyEntries(record: BodyMetric): BodyEntry[] {
  const entries: BodyEntry[] = [];
  for (const field of BODY_FIELDS) {
    const value = bodyValueOf(record, field.key as 'weight' | 'bodyFat');
    if (value !== undefined) {
      entries.push({ key: field.key, label: field.label, unit: field.unit, value });
    }
  }
  const keys = Object.keys(record.measurements).sort(compareMeasurementKeys);
  for (const key of keys) {
    const value = readMetric(record.measurements[key], 'measurement');
    if (value === undefined) continue;
    entries.push({ key, label: measurementLabel(key), unit: 'cm', value });
  }
  return entries;
}

/**
 * 编辑某天时要展示的围度输入项：内置五个部位 + 这条记录里已经存在的自定义部位。
 * 自定义部位排在内置项之后，按字母序，位置稳定。
 */
export function measurementFields(record?: BodyMetric): BodyFieldMeta[] {
  const known = new Set(MEASUREMENT_PARTS.map((part) => part.key));
  const extra = Object.keys(record?.measurements ?? {})
    .filter((key) => !known.has(key))
    .sort(compareMeasurementKeys)
    .map((key) => ({
      key,
      label: key,
      unit: 'cm',
      step: 0.5,
      min: MIN_BODY_READING,
      max: MAX_BODY_READING,
    }));
  return [...MEASUREMENT_PARTS, ...extra];
}

/** 趋势图默认最多画这么多天，免得数据攒了几年后一次渲染上千个点 */
export const MAX_TREND_POINTS = 90;

/**
 * 某项指标的趋势序列（只含有记录的日子，升序）。
 *
 * 体重这类指标不能用「按天补 0」的口径 —— 补出来的 0 会把折线拽到谷底。
 * 所以这里只取真实记录点，缺测的日子留给折线自己连。
 */
export function bodyPoints(
  records: readonly BodyMetric[],
  valueOf: (record: BodyMetric) => number | undefined,
  limit: number = MAX_TREND_POINTS,
): DayPoint[] {
  const byDate = new Map<string, number>();
  for (const record of sortedMetrics(records)) {
    const value = valueOf(record);
    if (value === undefined) continue;
    byDate.set(record.date, value);
  }
  const points = [...byDate.entries()].map(([date, value]) => ({ date, value }));
  return limit > 0 && points.length > limit ? points.slice(points.length - limit) : points;
}

/** 最近一次记录点；一次都没记时返回 null */
export function latestPoint(
  records: readonly BodyMetric[],
  valueOf: (record: BodyMetric) => number | undefined,
): DayPoint | null {
  const points = bodyPoints(records, valueOf, 0);
  return points.length > 0 ? points[points.length - 1]! : null;
}

export interface BodyChange {
  /** 最近一次 − 上一次 */
  delta: number;
  current: DayPoint;
  previous: DayPoint;
}

/** 与上一次记录的差值；不足两次记录时返回 null（而不是假装 0） */
export function changeFromPrevious(
  records: readonly BodyMetric[],
  valueOf: (record: BodyMetric) => number | undefined,
): BodyChange | null {
  const points = bodyPoints(records, valueOf, 0);
  if (points.length < 2) return null;
  const current = points[points.length - 1]!;
  const previous = points[points.length - 2]!;
  return { delta: round1(current.value - previous.value), current, previous };
}

/** 一位小数并去掉没意义的 `.0`：70 → 「70」，70.5 → 「70.5」 */
export function formatMetric(value: number): string {
  const rounded = round1(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** 环比带符号：+0.4 / -0.2 / 0 */
export function formatDelta(delta: number): string {
  const rounded = round1(delta);
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '-'}${formatMetric(Math.abs(rounded))}`;
}

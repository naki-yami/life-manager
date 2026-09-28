/**
 * store 持久化的公共约定。
 *
 * STORE_VERSION 递增规则：
 * - 0：v1 旧版（key 无前缀、无 version 字段）
 * - 2：改用 lm: 前缀 + 统一迁移入口
 */
export const STORE_VERSION = 2;

/**
 * 统一的状态迁移入口。
 *
 * 原则：**只补齐缺字段，绝不丢弃已有数据**。
 * - 传入不是对象（null / 字符串 / 损坏数据）时退回默认值，避免脏数据导致白屏
 * - 显式忽略 undefined，防止把默认值覆盖成空
 * - 保留未知字段，便于将来降级/回退
 */
export function migrateState<T extends object>(persisted: unknown, defaults: T): T {
  if (typeof persisted !== 'object' || persisted === null) return defaults;

  const result = { ...defaults } as Record<string, unknown>;
  for (const [key, value] of Object.entries(persisted as Record<string, unknown>)) {
    if (value === undefined) continue;
    result[key] = value;
  }
  return result as T;
}

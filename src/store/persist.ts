/**
 * store 持久化的公共约定。
 *
 * STORE_VERSION 递增规则（每次改变任何 store 的持久化结构都要 +1）：
 * - 0：v1 旧版（key 无前缀、无 version 字段）
 * - 2：改用 lm: 前缀 + 统一迁移入口
 * - 3：主题由二态 theme 改为三态 themeMode；新增 lm:ui（密度 / 侧栏折叠）
 * - 4：games 增加 sessions（游玩流水）
 * - 5：devProjects 增加 hoursSpent；新增 dev 的 sessions（工时流水）
 * - 6：devProjects 增加技术栈 / 仓库地址 / 起止日期 / 归档标记
 *
 * 注意：zustand persist 只在「存储里的 version 与当前 version 不一致」时
 * 才调用 migrate。所以结构变更必须靠 bump 版本号触发，不能只改 migrate 函数。
 */
export const STORE_VERSION = 6;

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

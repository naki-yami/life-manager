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
 * - 7：tasks 增加子任务（subtasks）与重复规则（repeat）
 * - 8：books 增加总页数 / 开始阅读时间；新增 books 的 sessions（阅读流水）
 * - 9：饮食增加三大营养素合计、每日目标与饮水打卡
 * - 10：写作项目增加正文 / 目标字数 / 版本快照
 * - 11：开发项目增加里程碑 / 开发日志，工作项增加分类
 * - 12：健身计划增加动作清单（训练日模板）；饮食增加餐次模板
 *
 * 注意：zustand persist 只在「存储里的 version 与当前 version 不一致」时
 * 才调用 migrate。所以**根级**结构变更必须靠 bump 版本号触发。
 *
 * 而「数组里单条记录新增字段」（例如给 Task 加 subtasks、给 FitnessPlan 加 exercises）
 * 不该依赖版本号：版本号一旦升到最新，手写在 migrate 里的补字段代码就再也不会执行了。
 * 这类补齐统一交给 persistOptions() 的 normalize，它挂在 merge 上，
 * 每次 rehydrate 都会跑且幂等。
 */
import type { PersistOptions, PersistStorage } from 'zustand/middleware';
import { persistStorage } from './storage';

export const STORE_VERSION = 12;

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

type PersistConfig<S, P> = {
  name: string;
  /** 只持久化数据字段，动作函数不进存储 */
  partialize: (state: S) => P;
  /** 把持久化数据补齐成当前结构；必须幂等 */
  normalize: (persisted: unknown) => P;
};

/**
 * 各 store 共用的 persist 配置。
 *
 * 三件事集中在这里，避免每个 store 各写一遍、各漏一处：
 * 1. `storage` —— 用 storage.ts 的安全后端，写入失败不会把异常抛进 React；
 * 2. `migrate` —— 版本号变化时原样交回数据，绝不返回 undefined（那等于清空用户数据）；
 * 3. `merge` —— 挂归一化。merge 每次 rehydrate 都会执行，所以单条记录的字段补齐
 *    不再受版本号影响。
 */
export function persistOptions<S extends object, P extends object>(
  config: PersistConfig<S, P>,
): PersistOptions<S, P> {
  return {
    name: config.name,
    version: STORE_VERSION,
    storage: persistStorage as PersistStorage<P>,
    partialize: config.partialize,
    migrate: (persisted) => (persisted ?? {}) as P,
    merge: (persisted, current) => ({ ...current, ...config.normalize(persisted) }),
  };
}

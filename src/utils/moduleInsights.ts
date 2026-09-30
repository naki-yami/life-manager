/**
 * 统计页「每模块独立分析」用的派生数据。
 *
 * 放在 utils 里而不是页面内：这些都是纯函数，值得单独测；页面只管把结果摆到卡片上。
 * 读书 / 开发 / 游戏 / 饮食四个模块的逐日序列直接复用 `seriesByDay`，
 * 只有健身的「训练容量」和写作的「净增字数」需要在这里推导。
 */
import { dayKeyOf } from './date';
import { dayRange, seriesByDay } from './stats';
import type { DayPoint } from './stats';
import type { WorkoutRecord, WritingProject } from '../types';

/**
 * 一次训练的训练容量 = Σ 组数 × 次数 × 重量。
 *
 * 自重动作（重量 0）算出来就是 0，这是刻意的：与其把「三组俯卧撑」折算成一个编出来的公斤数，
 * 不如让容量只反映真的加了重量的部分。脏数据里的负数按 0 处理，不让一笔坏记录把整段趋势压成负的。
 */
export function workoutVolume(record: WorkoutRecord): number {
  return record.exercises.reduce((sum, exercise) => {
    const sets = Math.max(0, exercise.sets);
    const reps = Math.max(0, exercise.reps);
    const weight = Math.max(0, exercise.weight);
    return sum + sets * reps * weight;
  }, 0);
}

/** 逐日训练容量 */
export function volumeByDay(
  records: readonly WorkoutRecord[],
  days: number,
  endKey: string,
): DayPoint[] {
  return seriesByDay(records, days, endKey, (record) => record.date, workoutVolume);
}

/**
 * 逐日「净增字数」，依据是保存正文时留下的快照。
 *
 * 口径是**相邻两版快照的差**，记在后一版那天 —— 这样「今天写了 800 字」就是当天真的敲出来的量，
 * 而不是「字数从 0 涨到 800」那种会把区间第一天顶出一根尖峰的累计口径。
 *
 * 两处已知的近似，写在这里免得以后被当成 bug 修：
 * 1. 快照只留最近 20 版（`writingStore` 的滚动窗口），所以老项目的第一个**已知**版本
 *    可能并不是真的第一版，那天会把窗口外的存量一并算进来 —— 记成「按快照推算」的估算值；
 * 2. 删掉的字不产生负增量，「写了又删」的日子只按写下的算。
 */
export function writingDailyWords(
  projects: readonly WritingProject[],
  days: number,
  endKey: string,
): DayPoint[] {
  const gains = new Map<string, number>();

  for (const project of projects) {
    // 同一天的多次保存有先后，必须按时间戳排序，不能只按日期键 —— 否则差值会算反
    const versions = project.snapshots
      .filter((snapshot) => typeof snapshot.createdAt === 'string' && snapshot.createdAt !== '')
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

    let previous: number | null = null;
    for (const version of versions) {
      const date = dayKeyOf(version.createdAt);
      if (!date) continue;
      const words = Math.max(0, version.wordCount);
      const gain = previous === null ? words : Math.max(0, words - previous);
      if (gain > 0) gains.set(date, (gains.get(date) ?? 0) + gain);
      previous = words;
    }
  }

  return dayRange(endKey, days).map((date) => ({ date, value: gains.get(date) ?? 0 }));
}

/** 一个模块在某个区间里的三个概括数字 */
export interface ModuleSummary {
  /** 区间合计 */
  total: number;
  /** 单日最高 */
  best: number;
  /** 有记录的天数（值大于 0 的天） */
  days: number;
}

export function summarizeModule(series: readonly DayPoint[]): ModuleSummary {
  let total = 0;
  let best = 0;
  let days = 0;
  for (const point of series) {
    const value = point.value;
    total += value;
    if (value > best) best = value;
    if (value > 0) days += 1;
  }
  return { total, best, days };
}

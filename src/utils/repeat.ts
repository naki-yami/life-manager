import { addDays } from './date';
import { weekdayIndex } from './stats';
import type { RepeatRule } from '../types';

/** 月份键平移，月末日钳制到当月最后一天（1月31日 + 1个月 = 2月28日） */
function addMonthsKey(key: string, delta: number): string {
  const parts = key.split('-').map((part) => Number(part));
  const year = parts[0] ?? 1970;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const target = new Date(Date.UTC(year, month - 1 + delta, 1));
  const daysInMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const clamped = Math.min(day, daysInMonth);
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-${String(clamped).padStart(2, '0')}`;
}

/**
 * 重复任务的下一个到期日（从 from 的次日开始找，所以永远不会停在原地）。
 * - daily：每天
 * - weekdays：跳过周末
 * - weekly：指定了星期就取下一个命中的星期；没指定就整周后推
 * - monthly：下个月的同一天（月尾自动钳制）
 */
export function nextDueDate(rule: RepeatRule, from: string): string {
  if (!from) return from;

  if (rule.kind === 'daily') return addDays(from, 1);

  if (rule.kind === 'weekdays') {
    let next = addDays(from, 1);
    for (let i = 0; i < 7; i += 1) {
      if (weekdayIndex(next) <= 4) return next;
      next = addDays(next, 1);
    }
    return next;
  }

  if (rule.kind === 'weekly') {
    const weekdays = rule.weekdays ?? [];
    if (weekdays.length === 0) return addDays(from, 7);
    let next = addDays(from, 1);
    for (let i = 0; i < 8; i += 1) {
      if (weekdays.includes(weekdayIndex(next))) return next;
      next = addDays(next, 1);
    }
    return next;
  }

  return addMonthsKey(from, 1);
}

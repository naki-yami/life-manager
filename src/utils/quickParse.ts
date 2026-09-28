import { addDays } from './date';
import type { Priority } from '../types';

export interface ParsedQuickTask {
  title: string;
  priority: Priority;
  dueDate: string;
}

const PRIORITY_FLAGS: Record<string, Priority> = {
  '!高': 'high',
  '!紧急': 'high',
  '!中': 'medium',
  '!普通': 'medium',
  '!低': 'low',
};

/**
 * 解析快捷添加语法：`写周报 !高 @今天`。
 * - `!高 / !紧急 / !中 / !低`：优先级（默认 medium）
 * - `@今天 / @明天 / @YYYY-MM-DD`：截止日期（默认无）
 * - 其余内容按原顺序拼成标题
 * 无法识别的 token 原样保留在标题里，不报错。
 */
export function parseQuickTask(raw: string, today: string): ParsedQuickTask {
  let priority: Priority = 'medium';
  let dueDate = '';
  const titleWords: string[] = [];

  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    const flag = PRIORITY_FLAGS[token.toLowerCase()];
    if (flag) {
      priority = flag;
      continue;
    }
    const lower = token.toLowerCase();
    if (lower === '@今天') {
      dueDate = today;
      continue;
    }
    if (lower === '@明天') {
      dueDate = addDays(today, 1);
      continue;
    }
    if (/^@\d{4}-\d{2}-\d{2}$/.test(lower)) {
      dueDate = lower.slice(1);
      continue;
    }
    titleWords.push(token);
  }

  return { title: titleWords.join(' '), priority, dueDate };
}

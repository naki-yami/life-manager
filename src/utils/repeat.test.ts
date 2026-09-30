import { describe, expect, it } from 'vitest';
import { nextDueDate } from './repeat';

describe('nextDueDate', () => {
  it('daily：每天 +1', () => {
    expect(nextDueDate({ kind: 'daily' }, '2026-09-28')).toBe('2026-09-29');
    expect(nextDueDate({ kind: 'daily' }, '2026-09-30')).toBe('2026-10-01');
  });

  it('weekdays：跳过周末', () => {
    // 2026-09-28 是周一 → 次日周二
    expect(nextDueDate({ kind: 'weekdays' }, '2026-09-28')).toBe('2026-09-29');
    // 2026-10-02 是周五 → 跳过周末到周一
    expect(nextDueDate({ kind: 'weekdays' }, '2026-10-02')).toBe('2026-10-05');
  });

  it('weekly：指定星期取下一个命中日，未指定就整周后推', () => {
    // 0 = 周一，4 = 周五；从周一(9/28)出发，下一个命中是周五(10/2)
    expect(nextDueDate({ kind: 'weekly', weekdays: [0, 4] }, '2026-09-28')).toBe('2026-10-02');
    // 周五(10/2)出发，下一个命中是下周一(10/5)
    expect(nextDueDate({ kind: 'weekly', weekdays: [0, 4] }, '2026-10-02')).toBe('2026-10-05');
    expect(nextDueDate({ kind: 'weekly' }, '2026-09-28')).toBe('2026-10-05');
  });

  it('monthly：下个月同一天，月尾钳制到当月最后一天', () => {
    expect(nextDueDate({ kind: 'monthly' }, '2026-09-15')).toBe('2026-10-15');
    expect(nextDueDate({ kind: 'monthly' }, '2026-01-31')).toBe('2026-02-28');
  });

  it('空日期原样返回，由调用方兜底', () => {
    expect(nextDueDate({ kind: 'daily' }, '')).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import type { Habit } from '../types';
import { addDays } from './date';
import {
  goalLabel,
  habitCreatedDay,
  habitDoneCount,
  habitTarget,
  habitStrength,
  habitStreak,
  isDayKey,
  isHabitDoneOn,
  isHabitPending,
  isHabitScheduledOn,
  pendingHabits,
  sanitizeHabitLogs,
  scheduleLabel,
  strengthLabel,
  weekStartOf,
  weeklyDoneCount,
} from './habits';

/** 固定「今天」，避免用例随真实日期漂移 */
const TODAY = '2026-09-29';

function makeHabit(partial: Partial<Habit> = {}): Habit {
  return {
    id: 'habit-1',
    name: '晨跑',
    kind: 'binary',
    target: 1,
    unit: '',
    schedule: { kind: 'daily', timesPerWeek: 1, everyDays: 1 },
    logs: {},
    createdAt: '2026-09-01T12:00:00',
    ...partial,
  };
}

/** 最近 n 天的日期键，从今天往前排 */
const recentDays = (n: number, end: string = TODAY): string[] =>
  Array.from({ length: n }, (_, index) => addDays(end, -index));

/** 把一串日期键标成已达标 */
const doneLogs = (days: string[], amount = 1): Record<string, number> =>
  Object.fromEntries(days.map((day) => [day, amount]));

describe('sanitizeHabitLogs', () => {
  it('丢掉非法日期键、非正数与脏值，并把数值取整', () => {
    expect(
      sanitizeHabitLogs({
        '2026-09-29': 2,
        '2026-09-28': 0,
        '2026-09-27': -1,
        '2026-09-26': Number.NaN,
        '2026-09-25': 1.4,
        '2026-9-24': 3,
        'not-a-day': 3,
      }),
    ).toEqual({ '2026-09-29': 2, '2026-09-25': 1 });
  });

  it('不是对象时返回空日志', () => {
    expect(sanitizeHabitLogs(null)).toEqual({});
    expect(sanitizeHabitLogs('2026-09-29')).toEqual({});
    expect(sanitizeHabitLogs(['2026-09-29'])).toEqual({});
  });
});

describe('isDayKey', () => {
  it('只认 YYYY-MM-DD', () => {
    expect(isDayKey('2026-09-29')).toBe(true);
    expect(isDayKey('2026-9-29')).toBe(false);
    expect(isDayKey('2026-09-29T10:00:00Z')).toBe(false);
  });
});

describe('habitTarget', () => {
  it('binary 型固定 1，count 型至少 1 且取整', () => {
    expect(habitTarget(makeHabit({ kind: 'binary', target: 8 }))).toBe(1);
    expect(habitTarget(makeHabit({ kind: 'count', target: 8 }))).toBe(8);
    expect(habitTarget(makeHabit({ kind: 'count', target: 0 }))).toBe(1);
    expect(habitTarget(makeHabit({ kind: 'count', target: 3.6 }))).toBe(4);
  });
});

describe('weekStartOf', () => {
  it('一律落在周一（周一为一周之始）', () => {
    expect(weekStartOf('2026-09-29')).toBe('2026-09-28');
    expect(weekStartOf('2026-09-28')).toBe('2026-09-28');
    expect(weekStartOf('2026-09-27')).toBe('2026-09-21');
    expect(weekStartOf('2026-10-04')).toBe('2026-09-28');
  });
});

describe('weeklyDoneCount', () => {
  it('只数当前自然周里达标的天数', () => {
    const habit = makeHabit({
      schedule: { kind: 'weekly', timesPerWeek: 3, everyDays: 1 },
      logs: doneLogs(['2026-09-20', '2026-09-28', '2026-09-29']),
    });
    expect(weeklyDoneCount(habit, TODAY)).toBe(2);
    expect(weeklyDoneCount(habit, '2026-09-21')).toBe(0);
  });
});

describe('isHabitScheduledOn', () => {
  it('按天的习惯每天都可以打卡', () => {
    expect(isHabitScheduledOn(makeHabit(), TODAY)).toBe(true);
  });

  it('间隔型：距上次达标满 N 天才算到期，刚做完不再催', () => {
    const habit = makeHabit({
      schedule: { kind: 'interval', timesPerWeek: 1, everyDays: 3 },
      logs: doneLogs(['2026-09-26']),
    });
    expect(isHabitScheduledOn(habit, '2026-09-28')).toBe(false);
    expect(isHabitScheduledOn(habit, '2026-09-29')).toBe(true);
    expect(isHabitScheduledOn(habit, '2026-09-26')).toBe(true);
  });
});

describe('isHabitPending', () => {
  it('按天的习惯：今天没打卡就算欠着', () => {
    expect(isHabitPending(makeHabit(), TODAY)).toBe(true);
    expect(isHabitPending(makeHabit({ logs: doneLogs([TODAY]) }), TODAY)).toBe(false);
  });

  it('量化习惯只看是否达到目标量', () => {
    const half = makeHabit({ kind: 'count', target: 8, logs: { [TODAY]: 4 } });
    expect(isHabitDoneOn(half, TODAY)).toBe(false);
    expect(isHabitPending(half, TODAY)).toBe(true);

    const full = makeHabit({ kind: 'count', target: 8, logs: { [TODAY]: 8 } });
    expect(isHabitPending(full, TODAY)).toBe(false);
  });

  it('每周 N 次：本周攒够次数就不再提醒', () => {
    const schedule = { kind: 'weekly' as const, timesPerWeek: 2, everyDays: 1 };
    expect(
      isHabitPending(makeHabit({ schedule, logs: doneLogs(['2026-09-28', '2026-09-29']) }), TODAY),
    ).toBe(false);
    expect(isHabitPending(makeHabit({ schedule, logs: doneLogs(['2026-09-28']) }), TODAY)).toBe(
      true,
    );
  });

  it('间隔型：今天刚做完就不再催', () => {
    const habit = makeHabit({
      schedule: { kind: 'interval', timesPerWeek: 1, everyDays: 3 },
      logs: doneLogs([TODAY]),
    });
    expect(isHabitPending(habit, TODAY)).toBe(false);
  });

  it('pendingHabits 只挑出欠着的那些', () => {
    const done = makeHabit({ id: 'a', logs: doneLogs([TODAY]) });
    const todo = makeHabit({ id: 'b' });
    expect(pendingHabits([done, todo], TODAY).map((habit) => habit.id)).toEqual(['b']);
  });
});

describe('habitStreak', () => {
  it('连续达标的天数，今天还没打卡不算断', () => {
    const habit = makeHabit({ logs: doneLogs(recentDays(3)) });
    expect(habitStreak(habit, TODAY)).toBe(3);

    const yesterday = makeHabit({ logs: doneLogs(recentDays(2, addDays(TODAY, -1))) });
    expect(habitStreak(yesterday, TODAY)).toBe(2);

    const broken = makeHabit({ logs: doneLogs([TODAY, addDays(TODAY, -1), addDays(TODAY, -3)]) });
    expect(habitStreak(broken, TODAY)).toBe(2);
  });

  it('从未打卡就是 0', () => {
    expect(habitStreak(makeHabit(), TODAY)).toBe(0);
  });

  it('间隔型只数到期的日子，跳过中间的空档', () => {
    const habit = makeHabit({
      schedule: { kind: 'interval', timesPerWeek: 1, everyDays: 3 },
      logs: doneLogs(['2026-09-23', '2026-09-26', '2026-09-29']),
    });
    expect(habitStreak(habit, TODAY)).toBe(3);
  });

  it('每周 N 次数的是达标的周数，本周没过完不算断', () => {
    const habit = makeHabit({
      schedule: { kind: 'weekly', timesPerWeek: 2, everyDays: 1 },
      logs: doneLogs(['2026-09-16', '2026-09-17', '2026-09-23', '2026-09-24', '2026-09-28']),
    });
    // 本周只打了 1 次：不算断，只数过去两周
    expect(habitStreak(habit, TODAY)).toBe(2);
  });
});

describe('habitStrength', () => {
  it('连续做满整个窗口就是满分', () => {
    const habit = makeHabit({
      createdAt: `${addDays(TODAY, -29)}T12:00:00`,
      logs: doneLogs(recentDays(30)),
    });
    expect(habitStrength(habit, TODAY)).toBeCloseTo(1, 6);
  });

  it('只差今天没打卡，分数只掉一点点 —— 断签不清零', () => {
    const habit = makeHabit({
      createdAt: `${addDays(TODAY, -29)}T12:00:00`,
      logs: doneLogs(recentDays(30).slice(1)),
    });
    const ratio = 0.5 ** (1 / 7);
    const total = (1 - ratio ** 30) / (1 - ratio);
    expect(habitStrength(habit, TODAY)).toBeCloseTo((total - 1) / total, 6);
    expect(habitStrength(habit, TODAY)).toBeGreaterThan(0.85);
  });

  it('停签之后分数缓慢衰减，但不会归零', () => {
    const habit = makeHabit({
      createdAt: `${addDays(TODAY, -19)}T12:00:00`,
      logs: doneLogs(recentDays(20).slice(10)),
    });
    const strength = habitStrength(habit, TODAY);
    expect(strength).toBeGreaterThan(0.2);
    expect(strength).toBeLessThan(0.35);
  });

  it('新建且没打卡是 0 分，不虚高', () => {
    expect(habitStrength(makeHabit({ createdAt: `${TODAY}T09:00:00` }), TODAY)).toBe(0);
  });

  it('量化习惯按完成度打折', () => {
    const createdToday = `${TODAY}T09:00:00`;
    const half = makeHabit({
      kind: 'count',
      target: 8,
      createdAt: createdToday,
      logs: { [TODAY]: 4 },
    });
    expect(habitStrength(half, TODAY)).toBeCloseTo(0.5, 6);

    const over = makeHabit({
      kind: 'count',
      target: 8,
      createdAt: createdToday,
      logs: { [TODAY]: 20 },
    });
    expect(habitStrength(over, TODAY)).toBeCloseTo(1, 6);
  });
});

describe('habitDoneCount / habitCreatedDay', () => {
  it('数窗口内达标的天数', () => {
    const habit = makeHabit({ logs: doneLogs(recentDays(5)) });
    expect(habitDoneCount(habit, TODAY, 30)).toBe(5);
    expect(habitDoneCount(habit, TODAY, 3)).toBe(3);
  });

  it('createdAt 换算成本地日期键', () => {
    expect(habitCreatedDay(makeHabit({ createdAt: '2026-09-01T12:00:00' }))).toBe('2026-09-01');
  });
});

describe('展示文案', () => {
  it('scheduleLabel 覆盖三种节奏', () => {
    expect(scheduleLabel({ kind: 'daily', timesPerWeek: 1, everyDays: 1 })).toBe('每天');
    expect(scheduleLabel({ kind: 'weekly', timesPerWeek: 3, everyDays: 1 })).toBe('每周 3 次');
    expect(scheduleLabel({ kind: 'interval', timesPerWeek: 1, everyDays: 2 })).toBe('每 2 天');
    expect(scheduleLabel({ kind: 'interval', timesPerWeek: 1, everyDays: 1 })).toBe('每天');
  });

  it('goalLabel 区分「做到即可」与量化目标', () => {
    expect(goalLabel(makeHabit())).toBe('做到即可');
    expect(goalLabel(makeHabit({ kind: 'count', target: 8, unit: '杯' }))).toBe('8 杯');
    expect(goalLabel(makeHabit({ kind: 'count', target: 3, unit: '  ' }))).toBe('3 次');
  });

  it('strengthLabel 把分数翻译成人话', () => {
    expect(strengthLabel(0.9)).toBe('稳固');
    expect(strengthLabel(0.6)).toBe('养成中');
    expect(strengthLabel(0.3)).toBe('起步');
    expect(strengthLabel(0)).toBe('待开始');
  });
});

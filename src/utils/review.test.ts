import { describe, expect, it } from 'vitest';
import type {
  DevProject,
  FocusSession,
  Habit,
  MealRecord,
  ReadingSession,
  ReviewEntry,
  Task,
  WorkoutRecord,
  WorkSession,
  WritingProject,
} from '../types';
import { addDays, daysInRange, formatDayLabel } from './date';
import { habitProgress } from './habits';
import {
  REVIEW_ANSWERS,
  REVIEW_PERIODS,
  REVIEW_PERIOD_LABELS,
  STALLED_DAYS,
  findReview,
  hasAnswer,
  periodDays,
  periodEndOf,
  periodLabel,
  periodStartOf,
  reviewKey,
  reviewMetrics,
  reviewQuestions,
  shiftPeriod,
  stalledProjects,
} from './review';

/** 2026-09-28 是周一，2026-10-04 是周日 */
const WEEK_START = '2026-09-28';
const WEEK_END = '2026-10-04';
const WEEK_DAYS = periodDays('week', WEEK_START);

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  title: '写周报',
  description: '',
  priority: 'medium',
  status: 'pending',
  dueDate: '',
  subtasks: [],
  repeat: null,
  timebox: null,
  tags: [],
  createdAt: '2026-09-01T12:00:00',
  ...overrides,
});

const focusSession = (overrides: Partial<FocusSession> = {}): FocusSession => ({
  id: 'f1',
  date: WEEK_START,
  entityId: 't1',
  title: '写方案',
  target: 'task',
  mode: 'pomodoro',
  plannedMinutes: 25,
  minutes: 25,
  startedAt: '2026-09-28T09:00:00',
  endedAt: '2026-09-28T09:25:00',
  posted: false,
  createdAt: '2026-09-28T09:25:00',
  ...overrides,
});

const workout = (overrides: Partial<WorkoutRecord> = {}): WorkoutRecord => ({
  id: 'w1',
  date: WEEK_START,
  planName: '推日',
  exercises: [{ name: '杠铃卧推', sets: 5, reps: 5, weight: 60 }],
  notes: '',
  tags: [],
  createdAt: '2026-09-28T20:00:00',
  ...overrides,
});

const reading = (overrides: Partial<ReadingSession> = {}): ReadingSession => ({
  id: 'r1',
  bookId: 'b1',
  date: WEEK_START,
  minutes: 30,
  note: '',
  createdAt: '2026-09-28T21:00:00',
  ...overrides,
});

const meal = (overrides: Partial<MealRecord> = {}): MealRecord => ({
  id: 'm1',
  date: WEEK_START,
  type: 'lunch',
  items: [],
  totalCalories: 600,
  tags: [],
  totalProtein: 0,
  totalCarbs: 0,
  totalFat: 0,
  ...overrides,
});

const habit = (overrides: Partial<Habit> = {}): Habit => ({
  id: 'h1',
  name: '晨跑',
  kind: 'binary',
  target: 1,
  unit: '',
  schedule: { kind: 'daily', timesPerWeek: 1, everyDays: 1 },
  logs: {},
  createdAt: '2026-09-01T12:00:00',
  ...overrides,
});

const review = (overrides: Partial<ReviewEntry> = {}): ReviewEntry => ({
  id: 'r1',
  period: 'week',
  date: WEEK_START,
  best: '把复盘页写完了',
  blocker: '',
  next: '',
  createdAt: '2026-09-28T12:00:00',
  updatedAt: '2026-09-28T12:00:00',
  ...overrides,
});

const devProject = (overrides: Partial<DevProject> = {}): DevProject => ({
  id: 'd1',
  name: 'Life Manager',
  description: '',
  status: 'in-progress',
  tasks: [],
  tags: [],
  hoursSpent: 0,
  techStack: [],
  repoUrl: '',
  archived: false,
  milestones: [],
  logs: [],
  createdAt: '2026-08-01T12:00:00',
  ...overrides,
});

const workSession = (overrides: Partial<WorkSession> = {}): WorkSession => ({
  id: 's1',
  projectId: 'd1',
  date: WEEK_START,
  hours: 2,
  note: '',
  createdAt: '2026-09-28T18:00:00',
  ...overrides,
});

const writingProject = (overrides: Partial<WritingProject> = {}): WritingProject => ({
  id: 'w1',
  title: '随笔集',
  type: 'article',
  status: 'in-progress',
  wordCount: 0,
  notes: '',
  tags: [],
  content: '',
  targetWords: 0,
  snapshots: [],
  createdAt: '2026-08-01T12:00:00',
  updatedAt: '2026-08-01T12:00:00',
  ...overrides,
});

const metric = (metrics: ReturnType<typeof reviewMetrics>, key: string) => {
  const found = metrics.find((item) => item.key === key);
  if (!found) throw new Error(`没有找到 ${key} 汇总卡`);
  return found;
};

describe('周期换算', () => {
  it('周期起点：周复盘落到周一，日复盘就是当天', () => {
    // 2026-09-29 是周二
    expect(periodStartOf('week', '2026-09-29')).toBe('2026-09-28');
    expect(periodStartOf('week', '2026-09-28')).toBe('2026-09-28');
    expect(periodStartOf('day', '2026-09-29')).toBe('2026-09-29');
  });

  it('周期结束日含首含尾', () => {
    expect(periodEndOf('week', WEEK_START)).toBe(WEEK_END);
    expect(periodEndOf('day', '2026-09-29')).toBe('2026-09-29');
  });

  it('periodDays 覆盖周期内每一天', () => {
    expect(WEEK_DAYS).toHaveLength(7);
    expect(WEEK_DAYS[0]).toBe(WEEK_START);
    expect(WEEK_DAYS[6]).toBe(WEEK_END);
    expect(periodDays('day', '2026-09-29')).toEqual(['2026-09-29']);
  });

  it('shiftPeriod 按周期前后挪动', () => {
    expect(shiftPeriod('week', WEEK_START, -1)).toBe('2026-09-21');
    expect(shiftPeriod('week', WEEK_START, 1)).toBe('2026-10-05');
    expect(shiftPeriod('day', '2026-09-29', -1)).toBe('2026-09-28');
    expect(shiftPeriod('day', '2026-09-30', 1)).toBe('2026-10-01');
  });

  it('periodLabel：周显示区间，日沿用当天标题', () => {
    expect(periodLabel('week', WEEK_START)).toBe('9 月 28 日 – 10 月 4 日');
    expect(periodLabel('day', '2026-09-29')).toBe(formatDayLabel('2026-09-29'));
  });

  it('daysInRange 含首含尾，反向输入返回空', () => {
    expect(daysInRange('2026-09-28', '2026-09-30')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
    ]);
    expect(daysInRange('2026-09-29', '2026-09-29')).toEqual(['2026-09-29']);
    expect(daysInRange('2026-09-29', '2026-09-28')).toEqual([]);
  });

  it('reviewKey 与 findReview 用「周期 + 起始日」定位', () => {
    expect(reviewKey('week', WEEK_START)).toBe('week:2026-09-28');

    const reviews = [review({ id: 'a' }), review({ id: 'b', period: 'day', date: '2026-09-29' })];
    expect(findReview(reviews, 'week', WEEK_START)?.id).toBe('a');
    expect(findReview(reviews, 'day', '2026-09-29')?.id).toBe('b');
    expect(findReview(reviews, 'day', WEEK_START)).toBeUndefined();
  });

  it('周期顺序与标签固定：先周后日', () => {
    expect(REVIEW_PERIODS).toEqual(['week', 'day']);
    expect(REVIEW_PERIOD_LABELS).toEqual({ week: '每周复盘', day: '每日复盘' });
    expect(REVIEW_ANSWERS).toEqual(['best', 'blocker', 'next']);
  });
});

describe('三个固定问题', () => {
  it('周与日的措辞不同，不会出现「今天的本周」', () => {
    expect(reviewQuestions('week')).toEqual({
      best: '本周最有价值的一件事',
      blocker: '本周最大的阻碍',
      next: '下周最重要的事',
    });
    expect(reviewQuestions('day')).toEqual({
      best: '今天最有价值的一件事',
      blocker: '今天最大的阻碍',
      next: '明天最重要的事',
    });
  });

  it('hasAnswer：三个问题全空（含纯空白）视为没写', () => {
    expect(hasAnswer(review())).toBe(true);
    expect(hasAnswer(review({ best: '   ' }))).toBe(false);
    expect(hasAnswer(review({ best: '', blocker: '  ', next: '\n' }))).toBe(false);
    expect(hasAnswer(review({ best: '', blocker: '', next: '只写了一条' }))).toBe(true);
  });
});

describe('habitProgress 习惯完成率', () => {
  it('每日习惯按区间内的天数算到期与达成', () => {
    const progress = habitProgress(
      [habit({ logs: { [WEEK_START]: 1, '2026-09-30': 1 } })],
      WEEK_DAYS,
    );

    expect(progress).toEqual({ done: 2, due: 7, rate: 2 / 7 });
  });

  it('间隔习惯跳过还没到期的日子', () => {
    const progress = habitProgress(
      [
        habit({
          schedule: { kind: 'interval', timesPerWeek: 1, everyDays: 3 },
          logs: { [WEEK_START]: 1, '2026-10-01': 1 },
        }),
      ],
      WEEK_DAYS,
    );

    // 09-28 与 10-01 到期且达成，10-04 到期但没打卡，09-29/30 与 10-02/03 是间隔期
    expect(progress).toEqual({ done: 2, due: 3, rate: 2 / 3 });
  });

  it('每周习惯只有整周都落在区间里才结算', () => {
    const weekly = habit({
      schedule: { kind: 'weekly', timesPerWeek: 3, everyDays: 1 },
      logs: { [WEEK_START]: 1, '2026-09-30': 1 },
    });

    expect(habitProgress([weekly], WEEK_DAYS)).toEqual({ done: 2, due: 3, rate: 2 / 3 });
    // 半周不算：一天的数量说明不了这一周
    expect(habitProgress([weekly], WEEK_DAYS.slice(0, 3))).toEqual({ done: 0, due: 0, rate: 0 });
  });

  it('习惯建立之前的日子不算到期', () => {
    const progress = habitProgress(
      [habit({ createdAt: '2026-10-02T12:00:00', logs: { '2026-10-02': 1 } })],
      WEEK_DAYS,
    );

    expect(progress).toEqual({ done: 1, due: 3, rate: 1 / 3 });
  });

  it('没有习惯时不产生除零', () => {
    expect(habitProgress([], WEEK_DAYS)).toEqual({ done: 0, due: 0, rate: 0 });
  });
});

describe('reviewMetrics 自动汇总', () => {
  const snapshot = {
    tasks: [
      task({ id: 't1', status: 'completed', priority: 'high', completedAt: '2026-09-29T12:00:00' }),
      task({ id: 't2', status: 'completed', priority: 'low', completedAt: '2026-10-01T12:00:00' }),
      // 区间之外完成的
      task({ id: 't3', status: 'completed', priority: 'high', completedAt: '2026-09-25T12:00:00' }),
      task({ id: 't4', status: 'pending' }),
    ],
    focusSessions: [
      focusSession({ id: 'f1', minutes: 25 }),
      focusSession({ id: 'f2', date: WEEK_END, minutes: 45 }),
      focusSession({ id: 'f3', date: '2026-09-20', minutes: 90 }),
    ],
    fitnessRecords: [
      workout({
        id: 'w1',
        exercises: [
          { name: '杠铃卧推', sets: 5, reps: 5, weight: 60 },
          { name: '哑铃飞鸟', sets: 3, reps: 12, weight: 12 },
        ],
      }),
      workout({
        id: 'w2',
        date: WEEK_END,
        exercises: [{ name: '深蹲', sets: 4, reps: 8, weight: 80 }],
      }),
      workout({ id: 'w3', date: '2026-09-20' }),
    ],
    readingSessions: [
      reading({ id: 'r1', minutes: 30 }),
      reading({ id: 'r2', date: WEEK_END, minutes: 60 }),
      reading({ id: 'r3', date: '2026-09-20', minutes: 200 }),
    ],
    dietRecords: [
      meal({ id: 'm1', totalCalories: 600 }),
      meal({ id: 'm2', totalCalories: 400 }),
      meal({ id: 'm3', date: WEEK_END, totalCalories: 800 }),
      meal({ id: 'm4', date: '2026-09-20', totalCalories: 5000 }),
    ],
    habits: [
      habit({
        logs: {
          [WEEK_START]: 1,
          '2026-09-29': 1,
          '2026-09-30': 1,
          '2026-10-01': 1,
          '2026-10-02': 1,
        },
      }),
    ],
    workSessions: [],
  };

  const metrics = reviewMetrics(snapshot, WEEK_START, WEEK_END);

  it('固定六张卡，顺序与标签稳定', () => {
    expect(metrics.map((item) => item.key)).toEqual([
      'tasks',
      'focus',
      'workout',
      'reading',
      'diet',
      'habits',
    ]);
    expect(metrics.map((item) => item.label)).toEqual([
      '完成任务',
      '专注时长',
      '训练次数',
      '阅读时长',
      '热量日均',
      '习惯完成率',
    ]);
  });

  it('完成任务只算区间内完成的，并标出紧急数', () => {
    expect(metric(metrics, 'tasks')).toMatchObject({
      value: '2',
      unit: '件',
      footer: '其中紧急 1 件',
      tone: 'success',
    });
  });

  it('专注与阅读按区间累加时长', () => {
    expect(metric(metrics, 'focus')).toMatchObject({
      value: '1 小时 10 分',
      footer: '共 2 次专注',
    });
    expect(metric(metrics, 'reading')).toMatchObject({
      value: '1 小时 30 分',
      footer: '共 2 次阅读',
    });
  });

  it('训练次数与组数', () => {
    expect(metric(metrics, 'workout')).toMatchObject({
      value: '2',
      unit: '次',
      footer: '累计 12 组',
    });
  });

  it('热量按记过的天数平均，漏记的那天不拉低', () => {
    expect(metric(metrics, 'diet')).toMatchObject({
      value: '900',
      unit: 'kcal',
      footer: '按记过的 2 天算',
    });
  });

  it('习惯完成率', () => {
    expect(metric(metrics, 'habits')).toMatchObject({
      value: '71',
      unit: '%',
      footer: '5/7 次到期达成',
    });
  });

  it('空数据时给出「没有…」的说明，不出现 NaN', () => {
    const empty = reviewMetrics(
      {
        tasks: [],
        focusSessions: [],
        fitnessRecords: [],
        readingSessions: [],
        dietRecords: [],
        habits: [],
        workSessions: [],
      },
      WEEK_START,
      WEEK_END,
    );

    expect(empty.map((item) => item.value)).toEqual(['0', '0 分钟', '0', '0 分钟', '0', '0']);
    expect(metric(empty, 'tasks').footer).toBe('没有紧急任务');
    expect(metric(empty, 'focus').footer).toBe('这一段时间没有计时');
    expect(metric(empty, 'habits').footer).toBe('这一段时间没有到期习惯');
  });
});

describe('stalledProjects 停滞项目', () => {
  const end = '2026-09-29';

  it('在推进却太久没投入的会被点名', () => {
    const result = stalledProjects(
      {
        devProjects: [
          devProject({ id: 'd1', name: 'Life Manager' }),
          devProject({ id: 'd2', name: '阅读器' }),
          devProject({ id: 'd3', name: '新项目', createdAt: '2026-09-27T12:00:00' }),
          devProject({ id: 'd4', name: '从未开工', createdAt: '2026-08-01T12:00:00' }),
        ],
        workSessions: [
          workSession({ id: 's1', projectId: 'd1', date: '2026-09-10' }),
          workSession({ id: 's2', projectId: 'd2', date: '2026-09-20' }),
        ],
        writingProjects: [],
      },
      end,
    );

    // 从未投入的项目用创建日兜底，所以 d4 也停摆 59 天
    expect(result.map((item) => item.id)).toEqual(['d4', 'd1']);
    expect(result[0]).toMatchObject({ kind: 'dev', lastActive: '2026-08-01', idleDays: 59 });
    expect(result[1]).toMatchObject({
      id: 'd1',
      kind: 'dev',
      lastActive: '2026-09-10',
      idleDays: 19,
    });
  });

  it('刚好到达阈值就算停滞，归档与已完成不算', () => {
    const result = stalledProjects(
      {
        devProjects: [
          devProject({ id: 'exact' }),
          devProject({ id: 'archived', archived: true }),
          devProject({ id: 'finished', status: 'completed' }),
          devProject({ id: 'paused', status: 'paused' }),
        ],
        workSessions: [
          workSession({ id: 's1', projectId: 'exact', date: addDays(end, -STALLED_DAYS) }),
          workSession({ id: 's2', projectId: 'archived', date: '2026-01-01' }),
          workSession({ id: 's3', projectId: 'finished', date: '2026-01-01' }),
          workSession({ id: 's4', projectId: 'paused', date: '2026-01-01' }),
        ],
        writingProjects: [],
      },
      end,
    );

    expect(result.map((item) => item.id)).toEqual(['exact']);
    expect(result[0]!.idleDays).toBe(STALLED_DAYS);
  });

  it('写作项目按最后修改时间，完结的不算', () => {
    const result = stalledProjects(
      {
        devProjects: [],
        workSessions: [],
        writingProjects: [
          writingProject({ id: 'w1', title: '随笔集', updatedAt: '2026-08-01T12:00:00' }),
          writingProject({
            id: 'w2',
            title: '写完了的',
            status: 'completed',
            updatedAt: '2026-08-01T12:00:00',
          }),
        ],
      },
      end,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'w1',
      name: '随笔集',
      kind: 'writing',
      lastActive: '2026-08-01',
      idleDays: 59,
    });
  });

  it('开发与写作混在一起时按停滞天数降序', () => {
    const result = stalledProjects(
      {
        devProjects: [devProject({ id: 'd1' })],
        workSessions: [workSession({ id: 's1', projectId: 'd1', date: '2026-09-10' })],
        writingProjects: [
          writingProject({ id: 'w1', title: '长草的文章', updatedAt: '2026-07-01T12:00:00' }),
        ],
      },
      end,
    );

    expect(result.map((item) => item.id)).toEqual(['w1', 'd1']);
    expect(result[0]!.idleDays).toBeGreaterThan(result[1]!.idleDays);
  });
});

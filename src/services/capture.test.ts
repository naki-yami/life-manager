import { beforeEach, describe, expect, it } from 'vitest';
import { buildCaptureCandidates, mealTypeForNow, runCapture, type CaptureTarget } from './capture';
import { parseCapture } from '../utils/quickParse';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useDietStore } from '../store/dietStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useGameStore } from '../store/gameStore';
import { useTaskStore } from '../store/taskStore';
import { useWritingStore } from '../store/writingStore';

const TODAY = '2026-09-28';
const NOON = new Date('2026-09-28T12:00:00');

/** 解析 + 落库，返回结果，方便断言 Toast 文案与撤销 */
const capture = (raw: string, target?: CaptureTarget, now: Date = NOON) => {
  const parsed = parseCapture(raw, TODAY);
  return { parsed, result: runCapture(target ?? parsed.kind, parsed, TODAY, now) };
};

beforeEach(() => {
  useTaskStore.setState({ tasks: [], memos: [] });
  useBookStore.setState({ books: [], sessions: [] });
  useDevStore.setState({ projects: [], sessions: [] });
  useWritingStore.setState({ projects: [] });
  useFitnessStore.setState({ plans: [], records: [] });
  useDietStore.setState({ records: [] });
  useGameStore.setState({ games: [], sessions: [] });
});

describe('buildCaptureCandidates', () => {
  it('正文为空时不给候选，避免建出一条空记录', () => {
    expect(buildCaptureCandidates(parseCapture('读书', TODAY))).toEqual([]);
    expect(buildCaptureCandidates(parseCapture('   ', TODAY))).toEqual([]);
  });

  it('第一条是解析结果，第二条是兜底备忘', () => {
    const candidates = buildCaptureCandidates(parseCapture('买牛奶', TODAY));
    expect(candidates.map((candidate) => candidate.target)).toEqual(['task', 'memo']);
    expect(candidates[0]!.label).toBe('新建任务「买牛奶」');
    expect(candidates[0]!.hint).toContain('无截止日期');
    expect(candidates[1]!.hint).toContain('兜底');
  });

  it('备忘的兜底是新建任务', () => {
    const candidates = buildCaptureCandidates(parseCapture('备忘 记得买票', TODAY));
    expect(candidates.map((candidate) => candidate.target)).toEqual(['memo', 'task']);
  });

  it('候选 id 稳定且互不相同', () => {
    const ids = buildCaptureCandidates(parseCapture('《置身事内》', TODAY)).map(
      (candidate) => candidate.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('runCapture 任务与备忘', () => {
  it('新建任务并带上优先级与截止日期', () => {
    const { result } = capture('明天 交周报 !高');
    const [task] = useTaskStore.getState().tasks;
    expect(task).toMatchObject({ title: '交周报', priority: 'high', dueDate: '2026-09-29' });
    expect(result.title).toContain('交周报');
    expect(result.description).toContain('2026-09-29');
  });

  it('撤销会删掉刚建的那条', () => {
    const { result } = capture('交周报');
    expect(useTaskStore.getState().tasks).toHaveLength(1);
    result.undo?.();
    expect(useTaskStore.getState().tasks).toHaveLength(0);
  });

  it('兜底存备忘时保留原文', () => {
    capture('《置身事内》读到 120 页', 'memo');
    expect(useTaskStore.getState().memos[0]!.content).toBe('《置身事内》读到 120 页');
    expect(useBookStore.getState().books).toHaveLength(0);
  });

  it('备忘不会解析标记', () => {
    capture('备忘 明天买票 @今天 !高');
    expect(useTaskStore.getState().memos[0]!.content).toBe('明天买票 @今天 !高');
  });
});

describe('runCapture 读书', () => {
  it('新书带上进度笔记', () => {
    const { result } = capture('《置身事内》读到 120 页');
    const [book] = useBookStore.getState().books;
    expect(book).toMatchObject({ title: '置身事内', status: 'want-to-read' });
    expect(book!.notes[0]).toMatchObject({ page: 120 });
    expect(result.title).toContain('置身事内');
  });

  it('书已在库里时只是补一条笔记，不会重复建书', () => {
    useBookStore.getState().addBook('置身事内', '兰小欢', '');
    const { result } = capture('读书 置身事内 读到 90 页');
    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0]!.notes[0]).toMatchObject({ page: 90 });
    expect(result.title).toContain('已记到');
  });

  it('时长写进阅读流水', () => {
    useBookStore.getState().addBook('置身事内', '', '');
    capture('读书 置身事内 45min');
    const [session] = useBookStore.getState().sessions;
    expect(session).toMatchObject({ date: TODAY, minutes: 45 });
    expect(useBookStore.getState().books[0]!.notes).toHaveLength(0);
  });

  it('新建书 + 阅读流水时撤销会一并清掉流水', () => {
    const { result } = capture('读书 置身事内 45min');
    expect(useBookStore.getState().sessions).toHaveLength(1);
    result.undo?.();
    expect(useBookStore.getState().books).toHaveLength(0);
    expect(useBookStore.getState().sessions).toHaveLength(0);
  });
});

describe('runCapture 其余模块', () => {
  it('开发项目', () => {
    capture('开发 记账 App');
    expect(useDevStore.getState().projects[0]).toMatchObject({ name: '记账 App' });
  });

  it('写作项目默认按文章类型', () => {
    capture('写作 周报模板');
    expect(useWritingStore.getState().projects[0]).toMatchObject({
      title: '周报模板',
      type: 'article',
    });
  });

  it('训练记录的时长写进备注', () => {
    capture('跑步 30min');
    expect(useFitnessStore.getState().records[0]).toMatchObject({
      planName: '跑步',
      date: TODAY,
      notes: '30 分钟',
    });
  });

  it('饮食按当前时间选餐次，热量进条目', () => {
    capture('饮食 鸡胸肉 200kcal', undefined, new Date('2026-09-28T12:00:00'));
    const [record] = useDietStore.getState().records;
    expect(record).toMatchObject({ date: TODAY, type: 'lunch', totalCalories: 200 });
    expect(record!.items[0]).toMatchObject({ name: '鸡胸肉', calories: 200 });
  });

  it('新游戏连着记一局', () => {
    capture('游戏 星露谷 2h');
    expect(useGameStore.getState().games[0]).toMatchObject({ name: '星露谷', platform: 'PC' });
    expect(useGameStore.getState().sessions[0]).toMatchObject({ date: TODAY, hours: 2 });
  });

  it('游戏已在库里且给了时长时只记流水', () => {
    useGameStore.getState().addGame('星露谷', 'PC');
    const { result } = capture('游戏 星露谷 1.5h');
    expect(useGameStore.getState().games).toHaveLength(1);
    expect(useGameStore.getState().sessions[0]).toMatchObject({ hours: 1.5 });
    expect(result.tone).toBe('success');
  });

  it('游戏已在库里又没给时长时只提示，不写脏数据', () => {
    useGameStore.getState().addGame('星露谷', 'PC');
    const { result } = capture('游戏 星露谷');
    expect(result.tone).toBe('warning');
    expect(useGameStore.getState().sessions).toHaveLength(0);
    expect(result.undo).toBeUndefined();
  });
});

describe('mealTypeForNow', () => {
  it('按小时段划分餐次', () => {
    expect(mealTypeForNow(new Date('2026-09-28T07:00:00'))).toBe('breakfast');
    expect(mealTypeForNow(new Date('2026-09-28T12:00:00'))).toBe('lunch');
    expect(mealTypeForNow(new Date('2026-09-28T19:00:00'))).toBe('dinner');
    expect(mealTypeForNow(new Date('2026-09-28T23:00:00'))).toBe('snack');
  });
});

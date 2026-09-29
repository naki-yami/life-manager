import type { FoodItem, MealType, Priority } from '../types';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useDietStore } from '../store/dietStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useGameStore } from '../store/gameStore';
import { useTaskStore } from '../store/taskStore';
import { useWritingStore } from '../store/writingStore';
import type { CaptureAmount, CaptureKind, ParsedCapture } from '../utils/quickParse';

export type CaptureTarget = CaptureKind;

/** 命令面板「建议」组里的一条候选 */
export interface CaptureCandidate {
  /** 面板里的稳定 id，用于 aria-activedescendant */
  id: string;
  target: CaptureTarget;
  label: string;
  hint: string;
}

export interface CaptureResult {
  tone: 'success' | 'warning';
  title: string;
  description: string;
  /** 撤回这次创建；只有真的新建了记录才给 */
  undo?: () => void;
}

const PRIORITY_LABEL: Record<Priority, string> = {
  high: '高优先级',
  medium: '中优先级',
  low: '低优先级',
};

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

/** 新建记录后靠 id 差集把它捞出来 —— 各 store 的 add* 只有部分返回 id */
function findNewId<T extends { id: string }>(read: () => T[], create: () => void): string | null {
  const before = new Set(read().map((item) => item.id));
  create();
  return read().find((item) => !before.has(item.id))?.id ?? null;
}

function toMinutes(amount: CaptureAmount): number | null {
  if (amount.unit === 'minute') return Math.round(amount.value);
  if (amount.unit === 'hour') return Math.round(amount.value * 60);
  return null;
}

function toHours(amount: CaptureAmount): number | null {
  if (amount.unit === 'hour') return amount.value;
  if (amount.unit === 'minute') return Math.round((amount.value / 60) * 100) / 100;
  return null;
}

function formatAmount(amount: CaptureAmount): string {
  switch (amount.unit) {
    case 'minute':
      return `${amount.value} 分钟`;
    case 'hour':
      return `${amount.value} 小时`;
    case 'page':
      return `第 ${amount.value} 页`;
    case 'kcal':
      return `${amount.value} 千卡`;
  }
}

function truncate(text: string, max = 16): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > max ? `${single.slice(0, max)}…` : single;
}

/** 当前时间大概属于哪一餐；命令面板的「记一餐」用它挑餐次 */
export function mealTypeForNow(now: Date = new Date()): MealType {
  const hour = now.getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snack';
}

function primaryLabel(parsed: ParsedCapture): string {
  const text = truncate(parsed.text, 18);
  switch (parsed.kind) {
    case 'task':
      return `新建任务「${text}」`;
    case 'memo':
      return `存为备忘「${text}」`;
    case 'book':
      return `加入书库《${text}》`;
    case 'dev':
      return `新建开发项目「${text}」`;
    case 'writing':
      return `新建写作项目「${text}」`;
    case 'fitness':
      return `记录训练「${text}」`;
    case 'diet':
      return `记一餐「${text}」`;
    case 'game':
      return `加入游戏库「${text}」`;
  }
}

function primaryHint(parsed: ParsedCapture): string {
  switch (parsed.kind) {
    case 'task':
      return [
        parsed.dueDate ? `截止 ${parsed.dueDate}` : '无截止日期',
        PRIORITY_LABEL[parsed.priority],
      ].join(' · ');
    case 'memo':
      return '按原文保存，不做任何解析';
    case 'book': {
      const parts = [parsed.extra ? `说明：${parsed.extra}` : '作者待补充'];
      if (parsed.amount) {
        parts.push(
          parsed.amount.unit === 'page'
            ? `进度 ${formatAmount(parsed.amount)}`
            : `阅读 ${formatAmount(parsed.amount)}`,
        );
      }
      return parts.join(' · ');
    }
    case 'dev':
      return parsed.extra || '状态默认「规划中」，可到开发页补充技术栈';
    case 'writing':
      return parsed.extra ? `备注：${parsed.extra}` : '类型默认为「文章」';
    case 'fitness':
      return parsed.amount ? `时长 ${formatAmount(parsed.amount)}` : '时长待补充，可到健身页填动作';
    case 'diet':
      return parsed.amount ? `热量 ${formatAmount(parsed.amount)}` : '按当前时间选餐次，热量待补充';
    case 'game':
      return parsed.amount ? `游玩 ${formatAmount(parsed.amount)}` : '平台默认 PC，可到游戏页修改';
  }
}

/**
 * 把一句输入摊成「建议」组：第一条是按解析结果生成的记录，
 * 第二条永远是兜底选项（备忘 ↔ 任务），保证解析错了也不会丢内容。
 */
export function buildCaptureCandidates(parsed: ParsedCapture): CaptureCandidate[] {
  if (!parsed.text.trim()) return [];

  const candidates: CaptureCandidate[] = [
    {
      id: `capture:${parsed.kind}`,
      target: parsed.kind,
      label: primaryLabel(parsed),
      hint: primaryHint(parsed),
    },
  ];

  if (parsed.kind === 'memo') {
    candidates.push({
      id: 'capture:fallback-task',
      target: 'task',
      label: `新建任务「${truncate(parsed.text, 18)}」`,
      hint: '按任务处理，标题就是这段文字',
    });
  } else {
    candidates.push({
      id: 'capture:fallback-memo',
      target: 'memo',
      label: `存为备忘「${truncate(parsed.body, 18)}」`,
      hint: '解析结果不对时用它兜底，原文一字不差地存下来',
    });
  }

  return candidates;
}

function captureTask(parsed: ParsedCapture): CaptureResult {
  const id = findNewId(
    () => useTaskStore.getState().tasks,
    () =>
      useTaskStore.getState().addTask(parsed.text, parsed.extra, parsed.priority, parsed.dueDate),
  );
  return {
    tone: 'success',
    title: `已新建任务「${truncate(parsed.text, 24)}」`,
    description: [
      parsed.dueDate ? `截止 ${parsed.dueDate}` : '无截止日期',
      PRIORITY_LABEL[parsed.priority],
    ].join(' · '),
    undo: id ? () => useTaskStore.getState().deleteTask(id) : undefined,
  };
}

function captureMemo(parsed: ParsedCapture): CaptureResult {
  const content = parsed.body.trim() || parsed.text.trim();
  const id = findNewId(
    () => useTaskStore.getState().memos,
    () => useTaskStore.getState().addMemo(content),
  );
  return {
    tone: 'success',
    title: `已存为备忘「${truncate(content, 24)}」`,
    description: '在首页「快速备忘」里可以看到它',
    undo: id ? () => useTaskStore.getState().deleteMemo(id) : undefined,
  };
}

function captureBook(parsed: ParsedCapture, today: string): CaptureResult {
  const page = parsed.amount?.unit === 'page' ? parsed.amount.value : null;
  const minutes = parsed.amount ? toMinutes(parsed.amount) : null;
  const title = parsed.text.trim();
  const existing = useBookStore.getState().books.find((book) => book.title.trim() === title);

  const undos: Array<() => void> = [];
  const parts: string[] = [];

  const addProgress = (bookId: string): void => {
    if (page !== null) {
      const noteId = findNewId(
        () => useBookStore.getState().books.find((book) => book.id === bookId)?.notes ?? [],
        () => useBookStore.getState().addNote(bookId, parsed.extra || `读到第 ${page} 页`, page),
      );
      if (noteId) undos.push(() => useBookStore.getState().deleteNote(bookId, noteId));
      parts.push(`进度记到第 ${page} 页`);
    }
    if (minutes !== null) {
      const sessionId = findNewId(
        () => useBookStore.getState().sessions,
        () => useBookStore.getState().addReadingSession(bookId, today, minutes, parsed.extra),
      );
      if (sessionId) undos.push(() => useBookStore.getState().deleteReadingSession(sessionId));
      parts.push(`阅读 ${minutes} 分钟`);
    }
  };

  if (existing) {
    addProgress(existing.id);
    if (parts.length === 0) {
      const noteId = findNewId(
        () => useBookStore.getState().books.find((book) => book.id === existing.id)?.notes ?? [],
        () => useBookStore.getState().addNote(existing.id, parsed.extra || '随手记一笔'),
      );
      if (noteId) undos.push(() => useBookStore.getState().deleteNote(existing.id, noteId));
      parts.push('记了一条笔记');
    }
    return {
      tone: 'success',
      title: `已记到《${truncate(existing.title, 20)}》`,
      description: parts.join(' · '),
      undo: undos.length > 0 ? () => undos.forEach((undo) => undo()) : undefined,
    };
  }

  const bookId = findNewId(
    () => useBookStore.getState().books,
    () => useBookStore.getState().addBook(title, parsed.extra, ''),
  );
  if (!bookId) {
    return { tone: 'warning', title: '没能加入书库', description: '请到读书页手动添加这本书' };
  }

  addProgress(bookId);
  parts.unshift('已加入书库');

  return {
    tone: 'success',
    title: `已加入书库《${truncate(title, 20)}》`,
    description: parts.join(' · '),
    undo: () => {
      undos.forEach((undo) => undo());
      useBookStore.getState().deleteBook(bookId);
    },
  };
}

function captureDev(parsed: ParsedCapture): CaptureResult {
  const id = useDevStore.getState().addProject(parsed.text, parsed.extra);
  if (!id) {
    return { tone: 'warning', title: '没能新建开发项目', description: '项目名不能为空' };
  }
  return {
    tone: 'success',
    title: `已新建开发项目「${truncate(parsed.text, 24)}」`,
    description: parsed.extra || '状态默认「规划中」，可到开发页补充技术栈与仓库',
    undo: () => useDevStore.getState().deleteProject(id),
  };
}

function captureWriting(parsed: ParsedCapture): CaptureResult {
  const id = findNewId(
    () => useWritingStore.getState().projects,
    () => useWritingStore.getState().addProject(parsed.text, 'article'),
  );
  return {
    tone: 'success',
    title: `已新建写作项目「${truncate(parsed.text, 24)}」`,
    description: parsed.extra || '类型默认「文章」，可到写作页调整',
    undo: id ? () => useWritingStore.getState().deleteProject(id) : undefined,
  };
}

function captureFitness(parsed: ParsedCapture, today: string): CaptureResult {
  const minutes = parsed.amount ? toMinutes(parsed.amount) : null;
  const notes = [minutes !== null ? `${minutes} 分钟` : '', parsed.extra]
    .filter(Boolean)
    .join(' · ');
  const id = findNewId(
    () => useFitnessStore.getState().records,
    () => useFitnessStore.getState().addRecord(parsed.text, today, [], notes),
  );
  return {
    tone: 'success',
    title: `已记录训练「${truncate(parsed.text, 24)}」`,
    description: [
      today,
      minutes !== null ? `${minutes} 分钟` : '时长待补充',
      '可到健身页补充动作',
    ].join(' · '),
    undo: id ? () => useFitnessStore.getState().deleteRecord(id) : undefined,
  };
}

function captureDiet(parsed: ParsedCapture, today: string, now: Date): CaptureResult {
  const calories = parsed.amount?.unit === 'kcal' ? parsed.amount.value : 0;
  const mealType = mealTypeForNow(now);
  const item: FoodItem = { name: parsed.text, category: '', calories };
  const id = findNewId(
    () => useDietStore.getState().records,
    () => useDietStore.getState().addRecord(today, mealType, [item]),
  );
  return {
    tone: 'success',
    title: `已记入${MEAL_LABEL[mealType]}「${truncate(parsed.text, 24)}」`,
    description: calories > 0 ? `${calories} 千卡` : '热量待补充，可到饮食页编辑',
    undo: id ? () => useDietStore.getState().deleteRecord(id) : undefined,
  };
}

function captureGame(parsed: ParsedCapture, today: string): CaptureResult {
  const hours = parsed.amount ? toHours(parsed.amount) : null;
  const name = parsed.text.trim();
  const existing = useGameStore.getState().games.find((game) => game.name.trim() === name);

  if (existing) {
    if (hours === null) {
      return {
        tone: 'warning',
        title: `《${truncate(existing.name, 20)}》已经在游戏库里`,
        description: '补一个时长（例如「游戏 星露谷 2h」）就能直接记一局',
      };
    }
    const sessionId = findNewId(
      () => useGameStore.getState().sessions,
      () => useGameStore.getState().addSession(existing.id, today, hours, parsed.extra),
    );
    return {
      tone: 'success',
      title: `已记一局《${truncate(existing.name, 20)}》`,
      description: `${today} · ${hours} 小时`,
      undo: sessionId ? () => useGameStore.getState().deleteSession(sessionId) : undefined,
    };
  }

  const gameId = findNewId(
    () => useGameStore.getState().games,
    () => useGameStore.getState().addGame(name, 'PC'),
  );
  if (!gameId) {
    return { tone: 'warning', title: '没能加入游戏库', description: '请到游戏页手动添加' };
  }

  if (hours !== null) {
    const sessionId = findNewId(
      () => useGameStore.getState().sessions,
      () => useGameStore.getState().addSession(gameId, today, hours, parsed.extra),
    );
    return {
      tone: 'success',
      title: `已加入游戏库《${truncate(name, 20)}》`,
      description: `并记下 ${hours} 小时（平台默认 PC）`,
      undo: () => {
        if (sessionId) useGameStore.getState().deleteSession(sessionId);
        useGameStore.getState().deleteGame(gameId);
      },
    };
  }

  return {
    tone: 'success',
    title: `已加入游戏库《${truncate(name, 20)}》`,
    description: '平台默认 PC，可到游戏页修改',
    undo: () => useGameStore.getState().deleteGame(gameId),
  };
}

/** 按用户选中的候选，把内容真正写进对应的 store */
export function runCapture(
  target: CaptureTarget,
  parsed: ParsedCapture,
  today: string,
  now: Date = new Date(),
): CaptureResult {
  switch (target) {
    case 'task':
      return captureTask(parsed);
    case 'memo':
      return captureMemo(parsed);
    case 'book':
      return captureBook(parsed, today);
    case 'dev':
      return captureDev(parsed);
    case 'writing':
      return captureWriting(parsed);
    case 'fitness':
      return captureFitness(parsed, today);
    case 'diet':
      return captureDiet(parsed, today, now);
    case 'game':
      return captureGame(parsed, today);
  }
}

import { addDays } from './date';
import type { Priority } from '../types';
import { extractTags } from './tags';

export interface ParsedQuickTask {
  title: string;
  priority: Priority;
  dueDate: string;
}

/** 快速捕获能落库的模块；没有任何信号时默认落到 task */
export type CaptureKind =
  'task' | 'memo' | 'book' | 'dev' | 'writing' | 'fitness' | 'diet' | 'game';

/** 数值标记的单位 */
export type CaptureUnit = 'minute' | 'hour' | 'page' | 'kcal';

export interface CaptureAmount {
  value: number;
  unit: CaptureUnit;
}

export interface ParsedCapture {
  kind: CaptureKind;
  /** 用户显式写了模块前缀（如「读书 置身事内」） */
  explicit: boolean;
  /** 去掉模块前缀后的原文，没有剥离任何标记；兜底存备忘时用它保证不丢字 */
  body: string;
  /** 主字段：任务标题 / 备忘正文 / 书名 / 项目名 */
  text: string;
  /** 从《书名》里取出书名后剩下的补充词（作者、说明等） */
  extra: string;
  priority: Priority;
  dueDate: string;
  amount: CaptureAmount | null;
  /** 从正文里摘出来的 `#标签`（已去 `#`、去重、限长） */
  tags: string[];
}

const PRIORITY_FLAGS: Record<string, Priority> = {
  '!高': 'high',
  '!紧急': 'high',
  '!中': 'medium',
  '!普通': 'medium',
  '!低': 'low',
};

/** 模块前缀；长的排在前面，「写作」才不会被更短的前缀抢走 */
const KIND_PREFIXES: ReadonlyArray<readonly [string, CaptureKind]> = (
  [
    ['待办', 'task'],
    ['任务', 'task'],
    ['todo', 'task'],
    ['task', 'task'],
    ['备忘', 'memo'],
    ['memo', 'memo'],
    ['note', 'memo'],
    ['读书', 'book'],
    ['阅读', 'book'],
    ['book', 'book'],
    ['read', 'book'],
    ['开发', 'dev'],
    ['项目', 'dev'],
    ['project', 'dev'],
    ['dev', 'dev'],
    ['写作', 'writing'],
    ['稿件', 'writing'],
    ['writing', 'writing'],
    ['write', 'writing'],
    ['健身', 'fitness'],
    ['训练', 'fitness'],
    ['运动', 'fitness'],
    ['workout', 'fitness'],
    ['fitness', 'fitness'],
    ['饮食', 'diet'],
    ['吃饭', 'diet'],
    ['meal', 'diet'],
    ['diet', 'diet'],
    ['游戏', 'game'],
    ['gaming', 'game'],
    ['game', 'game'],
  ] as Array<readonly [string, CaptureKind]>
).sort((a, b) => b[0].length - a[0].length);

/** 前缀后面允许的分隔符：`任务：写周报` / `todo, 写周报` 都算 */
const PREFIX_SEPARATOR = /^[\s：:，,、.。\-—]+/;

/**
 * 切出模块前缀；返回 null 表示这段输入没有写模块名。
 * 前缀必须紧跟着分隔符或书名号，所以「任务分解」「健身后拉伸」不会被误判。
 */
function splitKindPrefix(raw: string): { kind: CaptureKind; rest: string } | null {
  const trimmed = raw.trimStart();
  const lower = trimmed.toLowerCase();

  for (const [prefix, kind] of KIND_PREFIXES) {
    if (!lower.startsWith(prefix)) continue;
    const rest = trimmed.slice(prefix.length);
    if (rest === '') return { kind, rest: '' };
    const stripped = rest.replace(PREFIX_SEPARATOR, '');
    if (stripped !== rest) return { kind, rest: stripped };
    // 允许前缀直接跟书名号：「读书《置身事内》」
    if (rest.startsWith('《')) return { kind, rest };
  }
  return null;
}

const NAMED_DATES: Record<string, number> = { 今天: 0, 明天: 1, 后天: 2 };

const WEEKDAY_NAMES: Record<string, number> = {
  一: 0,
  二: 1,
  三: 2,
  四: 3,
  五: 4,
  六: 5,
  日: 6,
  天: 6,
};

/** 日期键 → 周内下标（0 = 周一 … 6 = 周日）；非法键返回 null */
function weekdayIndex(key: string): number | null {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return null;
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
}

/** `@今天` / `@明天` / `@后天` / `@周三` / `@下周三` / `@2026-10-01` */
function resolveDateToken(token: string, today: string): string | null {
  const body = token.slice(1).toLowerCase();
  const named: number | undefined = NAMED_DATES[body];
  if (named !== undefined) return addDays(today, named);
  if (/^\d{4}-\d{2}-\d{2}$/.test(body)) return body;

  const week = /^(下)?(?:周|星期)([一二三四五六日天])$/.exec(body);
  if (!week) return null;
  const target = WEEKDAY_NAMES[week[2]];
  const current = weekdayIndex(today);
  if (current === null) return null;
  // 「下周三」按「下周一 + 3 天」算，星期五写「下周三」也不会滑到下下周三
  if (week[1]) return addDays(today, 7 - current + target);
  return addDays(today, (target - current + 7) % 7);
}

/**
 * 数值单位别名：`min` 与 `分` 都是分钟，`h` 与 `小时` 都是小时，
 * `页` 是读书进度，`kcal` 是饮食热量。
 */
const UNIT_ALIASES: Record<string, CaptureUnit> = {
  min: 'minute',
  mins: 'minute',
  minute: 'minute',
  minutes: 'minute',
  分钟: 'minute',
  分: 'minute',
  h: 'hour',
  hr: 'hour',
  hrs: 'hour',
  hour: 'hour',
  hours: 'hour',
  小时: 'hour',
  页: 'page',
  页数: 'page',
  kcal: 'kcal',
  千卡: 'kcal',
  大卡: 'kcal',
  卡路里: 'kcal',
};

const AMOUNT_PATTERN = /^(?:读到|读完|看到|已读|用了|花了)?(\d+(?:\.\d+)?)([^\d\s]+)$/;

/** `30min` / `1.5小时` / `读到120页` 里的数值与单位 */
function resolveAmountToken(token: string): CaptureAmount | null {
  const match = AMOUNT_PATTERN.exec(token);
  if (!match) return null;
  const unit = UNIT_ALIASES[match[2].toLowerCase()];
  const value = Number(match[1]);
  if (!unit || !Number.isFinite(value)) return null;
  return { value, unit };
}

interface TokenScan {
  words: string[];
  priority: Priority;
  dueDate: string;
  amount: CaptureAmount | null;
}

const NUMBER_PATTERN = /^\d+(?:\.\d+)?$/;

/** 数值前面的动词，`读到 120 页` 里的「读到」 */
const AMOUNT_VERBS = new Set(['读到', '读完', '看到', '已读', '用了', '花了']);

/**
 * 数值标记可能被空格拆成好几个 token：`读到 120 页`、`跑步 30 min`。
 * 这里从当前位置起尝试合并出「动词 + 数字 + 单位」，失败就交给调用方当普通词处理。
 */
function mergeAmountTokens(
  tokens: string[],
  start: number,
): { amount: CaptureAmount; next: number } | null {
  // 先按单个 token 试：`30min` / `读到120页`
  const single = resolveAmountToken(tokens[start]);
  if (single) return { amount: single, next: start + 1 };

  let index = start;
  let verb = '';
  if (AMOUNT_VERBS.has(tokens[index].toLowerCase())) {
    verb = tokens[index];
    index += 1;
  }
  if (index + 1 >= tokens.length) return null;

  const value = tokens[index];
  const unit = tokens[index + 1];
  if (!NUMBER_PATTERN.test(value)) return null;

  const merged = resolveAmountToken(`${verb}${value}${unit}`);
  if (!merged) return null;
  return { amount: merged, next: index + 2 };
}

function scanTokens(raw: string, today: string, extractAmount: boolean): TokenScan {
  let priority: Priority = 'medium';
  let dueDate = '';
  let amount: CaptureAmount | null = null;
  const words: string[] = [];
  const tokens = raw.trim().split(/\s+/).filter(Boolean);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const flag: Priority | undefined = PRIORITY_FLAGS[token.toLowerCase()];
    if (flag) {
      priority = flag;
      continue;
    }
    // 日期标记：`@明天` 和口语写法的 `明天` 都认
    const resolvedDate = resolveDateToken(token.startsWith('@') ? token : `@${token}`, today);
    if (resolvedDate) {
      dueDate = resolvedDate;
      continue;
    }
    if (extractAmount && amount === null) {
      const merged = mergeAmountTokens(tokens, index);
      if (merged) {
        amount = merged.amount;
        index = merged.next - 1;
        continue;
      }
    }
    // 认不出来的 token 原样留在正文里，保证一个字都不丢
    words.push(token);
  }

  return { words, priority, dueDate, amount };
}

/**
 * 解析快捷添加语法：`写周报 !高 @今天`。
 * - `!高 / !紧急 / !中 / !低`：优先级（默认 medium）
 * - `今天 / 明天 / 后天 / 周X / YYYY-MM-DD`：截止日期（默认无，前缀 @ 可省）
 * - 其余内容按原顺序拼成标题
 * 无法识别的 token 原样保留在标题里，不报错。
 */
export function parseQuickTask(raw: string, today: string): ParsedQuickTask {
  const scanned = scanTokens(raw, today, false);
  return {
    title: scanned.words.join(' '),
    priority: scanned.priority,
    dueDate: scanned.dueDate,
  };
}

/**
 * 快速捕获解析：一句中文 → 一条可以落库的记录。
 *
 * 识别顺序：
 * 1. 模块前缀（`任务 / 备忘 / 读书 / 开发 / 写作 / 健身 / 饮食 / 游戏`，可省略）
 * 2. 没有前缀时看信号推断：页码 → 读书，时长 → 健身，热量 → 饮食，`《书名》` → 读书
 * 3. 还是没信号就按任务处理
 *
 * 备忘是自由文本，不解析任何标记 —— 否则会把用户想记的内容吞掉。
 * 解析不了的输入永远可以回退成备忘，见 `src/services/capture.ts`。
 */
export function parseCapture(raw: string, today: string): ParsedCapture {
  const prefix = splitKindPrefix(raw);
  const kind = prefix?.kind ?? 'task';
  const body = prefix ? prefix.rest : raw.trim();

  if (kind === 'memo') {
    // 备忘是自由文本：连 `#标签` 也原样保留，避免把用户想记的内容吞掉
    return {
      kind: 'memo',
      explicit: true,
      body,
      text: body.trim(),
      extra: '',
      priority: 'medium',
      dueDate: '',
      amount: null,
      tags: [],
    };
  }

  // 标签先摘掉再扫描：`《置身事内》#读书 明天` 里的标签不该混进书名解析
  const { text: withoutTags, tags } = extractTags(body);
  const scanned = scanTokens(withoutTags, today, true);
  let resolved: CaptureKind = kind;

  if (!prefix) {
    if (scanned.amount?.unit === 'page') resolved = 'book';
    else if (scanned.amount?.unit === 'minute' || scanned.amount?.unit === 'hour') {
      resolved = 'fitness';
    } else if (scanned.amount?.unit === 'kcal') resolved = 'diet';
  }

  let text = scanned.words.join(' ');
  let extra = '';

  const title = /《([^》《]+)》/.exec(text);
  if (title) {
    // 书名号是最强的「这是本书」信号
    if (!prefix) resolved = 'book';
    if (resolved === 'book') {
      extra = `${text.slice(0, title.index)} ${text.slice(title.index + title[0].length)}`
        .replace(/\s+/g, ' ')
        .trim();
      text = title[1].trim();
    }
  }

  return {
    kind: resolved,
    explicit: prefix !== null,
    body,
    text,
    extra,
    priority: scanned.priority,
    dueDate: scanned.dueDate,
    amount: scanned.amount,
    tags,
  };
}

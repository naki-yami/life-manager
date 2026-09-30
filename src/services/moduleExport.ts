import { APP_ID, BACKUP_SCHEMA_VERSION, MODULE_LABELS } from './schemas';
import type { BackupData, BackupModule } from './schemas';
import { todayKey } from '../utils/date';

/**
 * 分模块导出（F15）：把某一个模块单独导成 JSON / CSV / Markdown。
 *
 * 为什么不是「给每个模块手写一套导出代码」：21 个模块 × 3 种格式 = 63 个函数，
 * 加一个字段要改三处，迟早改漏。所以这里只登记「这个模块长什么样」——
 * 列名、取值函数、Markdown 的标题字段 —— 三种格式都由同一张表推出来。
 *
 * CSV 与 Markdown 共用同一份列定义（都是「一行一条记录」的表格视角）；
 * JSON 不需要列定义，它直接导原始记录。
 *
 * 树形模块（开发项目、写作项目）**只给 JSON**：它们的记录里挂着子任务数组、
 * 里程碑、开发日志、正文与版本快照，压成一行 CSV 只会把有用的东西扔掉，
 * 而且丢掉之后那个文件既不能读也不能导回去。
 */

// ---------------------------------------------------------------- 取值助手

const nz = (value: number | undefined | null): string =>
  value === undefined || value === null || value === 0 ? '' : String(value);

const tagsText = (tags: readonly string[] | undefined): string => (tags ?? []).join(' ');

const ISO_LABELS: Record<string, string> = {
  'want-to-read': '想读',
  reading: '在读',
  finished: '已读',
  todo: '待办',
  'in-progress': '进行中',
  done: '已完成',
  planning: '计划中',
  paused: '已暂停',
  completed: '已完成',
  draft: '草稿',
  playing: '在玩',
  backlog: '待玩',
  high: '高',
  medium: '中',
  low: '低',
  pending: '待办',
  feature: '功能',
  requirement: '需求',
  bug: '缺陷',
  tech: '技术',
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
  pomodoro: '番茄钟',
  stopwatch: '正计时',
  day: '日',
  week: '周',
  month: '月',
  task: '任务',
  dev: '开发',
  book: '读书',
  game: '游戏',
};

/** 内部枚举值翻译成给人看的词；没登记的取值原样返回 */
const label = (value: string | undefined): string => (value ? (ISO_LABELS[value] ?? value) : '');

const num = (value: number | undefined | null, digits = 1): string => {
  if (value === undefined || value === null || Number.isNaN(value)) return '';
  return String(Math.round(value * 10 ** digits) / 10 ** digits);
};

const timestamp = (value: string | undefined): string => (value ? value.slice(0, 16).replace('T', ' ') : '');

// ---------------------------------------------------------------- 登记表

/**
 * CSV / Markdown 共用的一列。
 *
 * `value` 拿到的永远是「原始记录」而不是已经渲染好的字符串 —— 渲染交给
 * `cellText` 统一做，这样两种格式的输出天然一致（不会出现 CSV 里有值、
 * Markdown 里空白的情况）。
 */
export interface ModuleColumn<T> {
  /** 表头 */
  label: string;
  value: (item: T) => unknown;
}

/** JSON-only（树形）模块的说明文案，用于 UI 提示与 Markdown 的兜底 */
export interface JsonOnlyExport {
  jsonOnly: true;
  /** 为什么只给 JSON */
  reason: string;
}

export interface TabularExport<T> {
  jsonOnly?: false;
  /** Markdown 里「## 标题」用的字段 */
  title: (item: T) => string;
  /** true 表示文件内容本身就是一段 Markdown 正文（正文/日记），不是表格 */
  prose?: boolean;
  columns: ModuleColumn<T>[];
}

export type ModuleExportSpec<T = never> = TabularExport<T> | JsonOnlyExport;

const isTabular = <T>(spec: ModuleExportSpec<T>): spec is TabularExport<T> =>
  spec.jsonOnly !== true;

/** 单元格渲染：一切格式都从这里出发，保证 CSV 与 Markdown 一致 */
function cellText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map((item) => cellText(item)).join(' ');
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return num(value, 2).replace(/\.0+$/, '');
  return String(value);
}

const column = <T>(label: string, value: (item: T) => unknown): ModuleColumn<T> => ({ label, value });

/** 子项摘要，例如动作清单、食物清单、成就个数 */
const summarize = (items: Array<Record<string, unknown>>, keys: string[]): string =>
  items
    .map((item) => keys.map((key) => cellText(item[key])).filter(Boolean).join('×'))
    .filter(Boolean)
    .join('；');

/**
 * 登记表。
 *
 * 键必须是 `BackupModule` 的子集 —— 少登记一个模块会在 typecheck 阶段被抓出来，
 * 不会出现「UI 下拉里有、点了没反应」这种运行期才发现的问题。
 */
export type RecordOf<M extends BackupModule> = Extract<BackupData[M], readonly unknown[]>[number];

export const MODULE_EXPORTS: { [K in BackupModule]: ModuleExportSpec<RecordOf<K>> } = {
  tasks: {
    title: (task) => task.title,
    columns: [
      column('标题', (task) => task.title),
      column('状态', (task) => label(task.status)),
      column('优先级', (task) => label(task.priority)),
      column('截止日', (task) => task.dueDate),
      column('子任务', (task) => summarize(task.subtasks, ['title', 'done'])),
      column('重复', (task) => task.repeat?.kind ?? ''),
      column('标签', (task) => tagsText(task.tags)),
      column('创建于', (task) => timestamp(task.createdAt)),
    ],
  },
  memos: {
    title: (memo) => memo.content.slice(0, 24),
    columns: [
      column('内容', (memo) => memo.content),
      column('创建于', (memo) => timestamp(memo.createdAt)),
    ],
  },
  books: {
    title: (book) => book.title,
    columns: [
      column('书名', (book) => book.title),
      column('作者', (book) => book.author),
      column('分类', (book) => book.category),
      column('状态', (book) => label(book.status)),
      column('进度', (book) => `${book.progress}%`),
      column('评分', (book) => nz(book.rating)),
      column('标签', (book) => tagsText(book.tags)),
      column('短评', (book) => book.review),
      column('读完于', (book) => book.finishedAt?.slice(0, 10) ?? ''),
    ],
  },
  readingSessions: {
    title: (session) => session.date,
    columns: [
      column('日期', (session) => session.date),
      column('书目', (session) => session.bookId),
      column('分钟', (session) => nz(session.minutes)),
      column('备注', (session) => session.note),
    ],
  },
  devProjects: {
    jsonOnly: true,
    reason: '开发项目挂着子任务、里程碑与日志，导出成表格会丢掉大半内容',
  },
  workSessions: {
    title: (session) => session.date,
    columns: [
      column('日期', (session) => session.date),
      column('项目', (session) => session.projectId),
      column('工时', (session) => num(session.hours, 2)),
      column('备注', (session) => session.note),
    ],
  },
  writingProjects: {
    jsonOnly: true,
    reason: '写作项目带着正文与历史版本快照，只有 JSON 能完整带走',
  },
  fitnessPlans: {
    title: (plan) => plan.name,
    columns: [
      column('计划名', (plan) => plan.name),
      column('说明', (plan) => plan.description),
      column('动作', (plan) => summarize(plan.exercises, ['name', 'sets', 'reps'])),
    ],
  },
  fitnessRecords: {
    title: (record) => `${record.date} ${record.planName}`,
    columns: [
      column('日期', (record) => record.date),
      column('计划', (record) => record.planName),
      column('动作', (record) => summarize(record.exercises, ['name', 'sets', 'reps'])),
      column('备注', (record) => record.notes),
      column('标签', (record) => tagsText(record.tags)),
    ],
  },
  mealTemplates: {
    title: (template) => template.name,
    columns: [
      column('模板名', (template) => template.name),
      column('餐次', (template) => label(template.type)),
      column('食物', (template) => summarize(template.items, ['name', 'calories'])),
    ],
  },
  dietRecords: {
    title: (record) => `${record.date} ${label(record.type)}`,
    columns: [
      column('日期', (record) => record.date),
      column('餐次', (record) => label(record.type)),
      column('热量', (record) => nz(record.totalCalories)),
      column('蛋白', (record) => nz(record.totalProtein)),
      column('碳水', (record) => nz(record.totalCarbs)),
      column('脂肪', (record) => nz(record.totalFat)),
      column('食物', (record) => summarize(record.items, ['name', 'calories'])),
      column('标签', (record) => tagsText(record.tags)),
    ],
  },
  bodyMetrics: {
    title: (metric) => metric.date,
    columns: [
      column('日期', (metric) => metric.date),
      column('体重', (metric) => num(metric.weight, 1)),
      column('体脂', (metric) => num(metric.bodyFat, 1)),
      column('围度', (metric) =>
        Object.entries(metric.measurements)
          .map(([part, value]) => `${part} ${value}`)
          .join(' '),
      ),
    ],
  },
  games: {
    title: (game) => game.name,
    columns: [
      column('游戏', (game) => game.name),
      column('平台', (game) => game.platform),
      column('状态', (game) => label(game.status)),
      column('时长', (game) => num(game.hoursPlayed, 1)),
      column('进度', (game) => `${game.progress}%`),
      column('评分', (game) => nz(game.rating)),
      column('标签', (game) => tagsText(game.tags)),
      column('短评', (game) => game.review),
      column('通关于', (game) => game.finishedAt?.slice(0, 10) ?? ''),
    ],
  },
  gameSessions: {
    title: (session) => session.date,
    columns: [
      column('日期', (session) => session.date),
      column('游戏', (session) => session.gameId),
      column('小时', (session) => num(session.hours, 1)),
      column('备注', (session) => session.note),
    ],
  },
  habits: {
    title: (habit) => habit.name,
    columns: [
      column('习惯', (habit) => habit.name),
      column('类型', (habit) => (habit.kind === 'binary' ? '做到即完成' : `数量（目标 ${habit.target}）`)),
      column('单位', (habit) => habit.unit),
      column('节奏', (habit) => label(habit.schedule.kind)),
      column('打卡天数', (habit) => String(Object.keys(habit.logs).length)),
    ],
  },
  focusSessions: {
    title: (session) => `${session.date} ${session.title}`,
    columns: [
      column('日期', (session) => session.date),
      column('对象', (session) => `${label(session.target)} · ${session.title}`),
      column('模式', (session) => label(session.mode)),
      column('计划分钟', (session) => nz(session.plannedMinutes)),
      column('实际分钟', (session) => nz(session.minutes)),
    ],
  },
  reviews: {
    title: (review) => `${label(review.period)}复盘 ${review.date}`,
    columns: [
      column('周期', (review) => label(review.period)),
      column('日期', (review) => review.date),
      column('最有价值', (review) => review.best),
      column('最大阻碍', (review) => review.blocker),
      column('下一步', (review) => review.next),
    ],
  },
  journal: {
    title: (entry) => entry.date,
    prose: true,
    columns: [
      column('日期', (entry) => entry.date),
      column('心情', (entry) => (entry.mood === 0 ? '' : `${entry.mood}/5`)),
      column('标签', (entry) => tagsText(entry.tags)),
      column('正文', (entry) => entry.text),
    ],
  },
  goals: {
    title: (goal) => `${goal.metric} ${goal.period}`,
    columns: [
      column('指标', (goal) => goal.metric),
      column('周期', (goal) => label(goal.period)),
      column('目标值', (goal) => nz(goal.target)),
      column('创建于', (goal) => timestamp(goal.createdAt)),
    ],
  },
  customFoods: {
    title: (food) => food.name,
    columns: [
      column('名称', (food) => food.name),
      column('分类', (food) => food.category),
      column('热量', (food) => nz(food.calories)),
      column('蛋白', (food) => nz(food.protein)),
      column('碳水', (food) => nz(food.carbs)),
      column('脂肪', (food) => nz(food.fat)),
    ],
  },
  customExercises: {
    title: (exercise) => exercise.name,
    columns: [
      column('名称', (exercise) => exercise.name),
      column('肌群', (exercise) => exercise.muscleGroup),
      column('器械', (exercise) => exercise.equipment),
    ],
  },
};

// ---------------------------------------------------------------- 文件名

/** 文件名里不宜出现的字符（Windows / POSIX 取并集，再顺手收掉空白） */
const UNSAFE_FILENAME = /[\\/:*?"<>|\s]+/g;

/** `life-manager-任务-2026-09-30.csv` */
export function moduleFileName(
  module: BackupModule,
  format: ExportFormat,
  dateKey: string = todayKey(),
): string {
  const safe = MODULE_LABELS[module].replace(UNSAFE_FILENAME, '-');
  return `life-manager-${safe}-${dateKey}.${EXPORT_EXTENSIONS[format]}`;
}

export type ExportFormat = 'json' | 'csv' | 'markdown';

export const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  json: 'json',
  csv: 'csv',
  markdown: 'md',
};

// ---------------------------------------------------------------- CSV

/** 一个字段要不要加引号：含分隔符、引号、换行，或首尾有空白的都得包 */
function csvCell(text: string): string {
  if (/[",\r\n]/.test(text) || text !== text.trim()) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** 表格 → CSV 文本。列数固定，调用方负责把行凑齐 */
export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

// ---------------------------------------------------------------- Markdown

/** Markdown 表格里的竖线必须转义，换行压成空格 —— 否则一条记录会把表格切成两半 */
function mdCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

// ---------------------------------------------------------------- 导出器

function assertTabular<T>(module: BackupModule): TabularExport<T> {
  const spec = MODULE_EXPORTS[module] as ModuleExportSpec<T>;
  if (!isTabular(spec)) {
    throw new Error(`${MODULE_LABELS[module]} 只支持导出 JSON`);
  }
  return spec;
}

const rowsOf = <T>(
  spec: TabularExport<T>,
  records: readonly T[],
): { headers: string[]; rows: string[][] } => ({
  headers: spec.columns.map((item) => item.label),
  rows: records.map((record) => spec.columns.map((item) => cellText(item.value(record)))),
});

/**
 * 单模块 JSON。
 *
 * 结构与全量备份同源（同样的 app / schemaVersion / exportedAt 信封），只多一个
 * `module` 字段。这样 `parseBackup` 不用学一套新格式就能认出来 ——
 * 「导出再导入」这条回路的成本才压得住。
 */
export function exportModuleJson(
  module: BackupModule,
  records: unknown[],
  now: Date = new Date(),
): string {
  return JSON.stringify(
    {
      app: APP_ID,
      module,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      data: { [module]: records },
    },
    null,
    2,
  );
}

export function exportModuleCsv(
  module: BackupModule,
  records: unknown[],
): string {
  const spec = assertTabular<unknown>(module);
  const { headers, rows } = rowsOf(spec, records);
  return toCsv(headers, rows);
}

/**
 * 单模块 Markdown。
 *
 * 长文本模块（日记）走 `prose`：日记的正文塞进表格格子里会把换行压平，
 * 那是把「一篇日记」变成「一行摘要」。它按 `## 日期` 分节展开，正文原样保留。
 */
export function exportModuleMarkdown(
  module: BackupModule,
  records: unknown[],
  now: Date = new Date(),
): string {
  const spec = assertTabular<unknown>(module);
  const label = MODULE_LABELS[module];
  const head = `# ${label}\n\n共 ${records.length} 条 · 导出于 ${timestamp(now.toISOString())}\n`;

  if (spec.prose) {
    const body = records
      .map((record) => {
        const fields = spec.columns
          .filter((item) => item.label !== '正文')
          .map((item) => cellText(item.value(record)))
          .filter(Boolean)
          .join(' · ');
        const text = cellText(spec.columns.find((item) => item.label === '正文')?.value(record));
        const parts = [`## ${spec.title(record)}`];
        if (fields) parts.push(`*${fields}*`);
        if (text) parts.push('', text);
        return parts.join('\n');
      })
      .join('\n\n');
    return `${head}\n${body}\n`;
  }

  const { headers, rows } = rowsOf(spec, records);
  const table = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(mdCell).join(' | ')} |`),
  ].join('\n');

  return `${head}\n${table}\n`;
}

/** 登记表的一个条目，抹掉具体记录类型 —— 运行时按模块名取用时只能这么看 */
export type AnyModuleExport = ModuleExportSpec<never> | TabularExport<Record<string, unknown>>;

/** 取登记表条目。`MODULE_EXPORTS` 按模块名收窄过类型，这里统一放宽 */
function specOf(module: BackupModule): AnyModuleExport {
  return MODULE_EXPORTS[module] as unknown as AnyModuleExport;
}

/** 一个模块是否支持某种格式（UI 用它禁用按钮，而不是点了才报错） */
export function supportsFormat(module: BackupModule, format: ExportFormat): boolean {
  if (format === 'json') return true;
  return isTabular(specOf(module));
}

/** JSON-only 模块的说明；表格模块返回 null */
export function jsonOnlyReason(module: BackupModule): string | null {
  const spec = specOf(module);
  return isTabular(spec) ? null : spec.reason;
}

/** 从全量数据里取某个模块的记录 */
export function moduleRecords(data: BackupData, module: BackupModule): unknown[] {
  return data[module] ?? [];
}

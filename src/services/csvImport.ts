import { createId } from '../utils/id';
import type { Book, Game } from '../types';

/**
 * 外部数据导入（F10）：把别的平台导出的 CSV 批量搬进来。
 *
 * 设计要点：
 * - CSV 解析自己写（RFC4180 子集：引号、转义引号、逗号、换行），不引依赖；
 * - 列名映射用「预置模板 + 宽松匹配」：每个来源给一组候选列名，大小写 / 空格不敏感，
 *   Goodreads 英文表头、豆瓣中文表头、Steam 的 name/hours 都能对上；
 * - 一切先算成「计划」（dry-run）：要加几条、按名字去重跳过几条、缺字段的警告，
 *   UI 拿计划做预览，用户确认才真正写库。
 */

export type CsvImportSource = 'goodreads' | 'douban' | 'steam';

export interface CsvSourcePreset {
  id: CsvImportSource;
  label: string;
  target: 'books' | 'games';
  /** 导出方式的一句话说明 */
  hint: string;
}

export const CSV_SOURCES: CsvSourcePreset[] = [
  {
    id: 'goodreads',
    label: 'Goodreads 书单',
    target: 'books',
    hint: 'Goodreads → My Books → Import/Export → Export Library',
  },
  {
    id: 'douban',
    label: '豆瓣读书',
    target: 'books',
    hint: '豆瓣 → 我的读书 → 个人导出（CSV）',
  },
  {
    id: 'steam',
    label: 'Steam 游戏时长',
    target: 'games',
    hint: '用第三方导出工具拿到 CSV，需要 name 与 hours_played 列',
  },
];

/** 去掉 BOM 与首尾空白 */
function cleanCell(value: string): string {
  return value.replace(/^\uFEFF/, '').trim();
}

/**
 * 解析 CSV 文本（RFC4180 子集）。
 * 引号包裹的单元格里可以有逗号、换行和转义引号（"" -> "）。
 * 返回表头与数据行；完全空白的行跳过。
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let started = false;

  const pushCell = (): void => {
    row.push(cleanCell(cell));
    cell = '';
  };
  const pushRow = (): void => {
    pushCell();
    // 全空的行跳过
    if (row.some((value) => value !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (inQuotes) {
      if (char === '"') {
        // "" 是转义的引号
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      started = true;
      continue;
    }
    if (char === ',') {
      pushCell();
      started = false;
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      pushRow();
      continue;
    }
    cell += char;
    started = true;
  }
  // 文件末尾没有换行时把最后一段收进来
  if (started || cell !== '' || row.length > 0) pushRow();

  const headers = rows.shift() ?? [];
  return { headers, rows };
}

/** 大小写与空格不敏感的表头匹配：先精确，再包含 */
function matchHeader(headers: string[], candidates: string[]): number {
  const normalized = headers.map((header) => header.toLowerCase().replace(/\s+/g, ''));
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/\s+/g, '');
    const exact = normalized.indexOf(key);
    if (exact !== -1) return exact;
  }
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/\s+/g, '');
    const partial = normalized.findIndex((header) => header.includes(key));
    if (partial !== -1) return partial;
  }
  return -1;
}

/** 把常见日期写法归一成 YYYY-MM-DD；认不出来返回 '' */
export function normalizeCsvDate(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  // 2026-09-30 / 2026/9/30 / 2026.9.30
  let parts = value.split(/[-/.]/).map((part) => part.trim());
  if (parts.length === 3 && parts[0]!.length === 4) {
    const [year, month, day] = parts;
    const mm = Number(month);
    const dd = Number(day);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }
  // 美式 M/D/YYYY（Goodreads 部分导出是这样）
  parts = value.split(/[/]/).map((part) => part.trim());
  if (parts.length === 3 && parts[2]!.length === 4) {
    const month = Number(parts[0]);
    const day = Number(parts[1]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${parts[2]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return '';
}

/** 预置模板的候选列名 */
const COLUMN_CANDIDATES: Record<CsvImportSource, Record<string, string[]>> = {
  goodreads: {
    title: ['title'],
    author: ['author'],
    dateRead: ['date read'],
    shelves: ['bookshelves', 'exclusive shelves'],
  },
  douban: {
    title: ['标题', '书名'],
    author: ['作者'],
    dateRead: ['标记日期', '日期'],
    rating: ['我的评分'],
  },
  steam: {
    name: ['name', '名称', '游戏'],
    hours: ['hours_played', 'hoursplayed', 'hours', '时长'],
  },
};

export interface CsvImportPlan<T, Target extends 'books' | 'games' = 'books' | 'games'> {
  target: Target;
  /** 文件里的数据行数 */
  total: number;
  /** 去重后真正要新增的记录 */
  toAdd: T[];
  /** 与现有数据（或文件内部）重名而跳过的条数 */
  skipped: number;
  /** 缺必需字段、日期认不出之类的警告 */
  warnings: string[];
}

const dedupeKey = (...parts: string[]): string =>
  parts.join('').toLowerCase().replace(/\s+/g, '');

/** 读书 CSV → Book 计划。Goodreads 与豆瓣共用一个映射骨架 */
export function planBookCsvImport(
  source: 'goodreads' | 'douban',
  text: string,
  existingBooks: readonly Book[],
): CsvImportPlan<Book, 'books'> {
  const candidates = COLUMN_CANDIDATES[source];
  const { headers, rows } = parseCsv(text);
  const titleIndex = matchHeader(headers, candidates.title!);
  const authorIndex = matchHeader(headers, candidates.author!);
  const dateIndex = matchHeader(headers, candidates.dateRead!);
  const shelvesIndex =
    source === 'goodreads' ? matchHeader(headers, candidates.shelves!) : -1;

  const warnings: string[] = [];
  if (titleIndex === -1) {
    warnings.push(`没找到书名列（期望的表头：${candidates.title!.join(' / ')}），无法导入。`);
    return { target: 'books', total: rows.length, toAdd: [], skipped: 0, warnings };
  }

  const seen = new Set(existingBooks.map((book) => dedupeKey(book.title, book.author)));
  const toAdd: Book[] = [];
  let skipped = 0;
  const now = new Date().toISOString();

  rows.forEach((row, index) => {
    const title = row[titleIndex] ?? '';
    if (!title) {
      warnings.push(`第 ${index + 2} 行缺少书名，已跳过。`);
      return;
    }
    const author = authorIndex !== -1 ? (row[authorIndex] ?? '') : '';
    const key = dedupeKey(title, author);
    if (seen.has(key)) {
      skipped += 1;
      return;
    }
    seen.add(key);

    const dateRead = dateIndex !== -1 ? normalizeCsvDate(row[dateIndex] ?? '') : '';
    // Goodreads 的书架列能区分「read」；豆瓣有标记日期就算读过
    const shelfText = shelvesIndex !== -1 ? (row[shelvesIndex] ?? '').toLowerCase() : '';
    const finished = dateRead !== '' || shelfText === 'read';

    toAdd.push({
      id: createId(),
      title,
      author,
      category: '',
      status: finished ? 'finished' : 'want-to-read',
      progress: finished ? 100 : 0,
      notes: [],
      tags: [],
      createdAt: now,
      ...(finished && dateRead ? { finishedAt: new Date(dateRead).toISOString() } : {}),
    });
  });

  return { target: 'books', total: rows.length, toAdd, skipped, warnings };
}

/** Steam 游戏 CSV → Game 计划 */
export function planGameCsvImport(text: string, existingGames: readonly Game[]): CsvImportPlan<Game, 'games'> {
  const candidates = COLUMN_CANDIDATES.steam;
  const { headers, rows } = parseCsv(text);
  const nameIndex = matchHeader(headers, candidates.name!);
  const hoursIndex = matchHeader(headers, candidates.hours!);

  const warnings: string[] = [];
  if (nameIndex === -1) {
    warnings.push(`没找到游戏名列（期望的表头：${candidates.name!.join(' / ')}），无法导入。`);
    return { target: 'games', total: rows.length, toAdd: [], skipped: 0, warnings };
  }

  const seen = new Set(existingGames.map((game) => dedupeKey(game.name)));
  const toAdd: Game[] = [];
  let skipped = 0;

  rows.forEach((row, index) => {
    const name = row[nameIndex] ?? '';
    if (!name) {
      warnings.push(`第 ${index + 2} 行缺少游戏名，已跳过。`);
      return;
    }
    const key = dedupeKey(name);
    if (seen.has(key)) {
      skipped += 1;
      return;
    }
    seen.add(key);

    const hoursRaw = hoursIndex !== -1 ? (row[hoursIndex] ?? '') : '';
    const hours = Number.parseFloat(hoursRaw.replace(/[^0-9.]/g, ''));
    toAdd.push({
      id: createId(),
      name,
      platform: 'PC',
      status: 'playing',
      hoursPlayed: Number.isFinite(hours) && hours > 0 ? Math.round(hours * 10) / 10 : 0,
      progress: 0,
      achievements: [],
      notes: '',
      tags: [],
      createdAt: new Date().toISOString(),
    });
  });

  return { target: 'games', total: rows.length, toAdd, skipped, warnings };
}

import { describe, expect, it } from 'vitest';
import {
  normalizeCsvDate,
  parseCsv,
  planBookCsvImport,
  planGameCsvImport,
} from './csvImport';
import type { Book, Game } from '../types';

const book = (title: string, author = ''): Book => ({
  id: `book-${title}`,
  title,
  author,
  category: '',
  status: 'want-to-read',
  progress: 0,
  notes: [],
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
});

const game = (name: string): Game => ({
  id: `game-${name}`,
  name,
  platform: 'PC',
  status: 'playing',
  hoursPlayed: 0,
  progress: 0,
  achievements: [],
  notes: '',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('parseCsv', () => {
  it('处理带引号、转义引号、内嵌逗号与换行的单元格', () => {
    const { headers, rows } = parseCsv(
      'Title,Author,My Review\n"1984","Orwell","好,书"\n"Cars ""Trucks""","A. B","\n多行\n评语"',
    );
    expect(headers).toEqual(['Title', 'Author', 'My Review']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['1984', 'Orwell', '好,书']);
    // 单元格做首尾 trim：引号内的换行保留，开头那个空行被裁掉（可接受）
    expect(rows[1]).toEqual(['Cars "Trucks"', 'A. B', ['多行', '评语'].join('\n')]);
  });

  it('跳过空行，容忍 CRLF 与结尾没有换行', () => {
    const { rows } = parseCsv('a,b\r\n1,2\r\n\r\n3,4');
    expect(rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });
});

describe('normalizeCsvDate', () => {
  it('认得 YMD、美式 MDY 与中文导出的分隔符', () => {
    expect(normalizeCsvDate('2026-09-30')).toBe('2026-09-30');
    expect(normalizeCsvDate('2026/9/3')).toBe('2026-09-03');
    expect(normalizeCsvDate('2026.9.30')).toBe('2026-09-30');
    expect(normalizeCsvDate('9/3/2026')).toBe('2026-09-03');
  });

  it('认不出的返回空串', () => {
    expect(normalizeCsvDate('昨天')).toBe('');
    expect(normalizeCsvDate('')).toBe('');
  });
});

describe('planBookCsvImport', () => {
  it('Goodreads 模板：按 Title/Author/Date Read 建书，读完的带 finishedAt', () => {
    const csv = [
      'Title,Author,Date Read,Bookshelves',
      '1984,Orwell,2024/5/1,read',
      '三体,"刘慈希",,to-read',
    ].join('\n');

    const plan = planBookCsvImport('goodreads', csv, []);
    expect(plan.total).toBe(2);
    expect(plan.skipped).toBe(0);
    expect(plan.toAdd).toHaveLength(2);

    const [first, second] = plan.toAdd;
    expect(first!.status).toBe('finished');
    expect(first!.finishedAt).toContain('2024-05-01');
    expect(first!.progress).toBe(100);
    expect(second!.status).toBe('want-to-read');
    expect(second!.finishedAt).toBeUndefined();
  });

  it('豆瓣模板：中文表头也能对上', () => {
    const csv = ['标题,作者,标记日期', '活着,余华,2023-11-02', '围城,钱钟书,'].join('\n');
    const plan = planBookCsvImport('douban', csv, []);
    expect(plan.toAdd).toHaveLength(2);
    expect(plan.toAdd[0]!.status).toBe('finished');
    expect(plan.toAdd[1]!.status).toBe('want-to-read');
  });

  it('与现有藏书按书名+作者去重，缺书名的行给警告', () => {
    const existing = [book('1984', 'Orwell')];
    const csv = ['Title,Author', '1984,Orwell', '动物农场,Orwell', ',没名字'].join('\n');
    const plan = planBookCsvImport('goodreads', csv, existing);

    expect(plan.toAdd.map((item) => item.title)).toEqual(['动物农场']);
    expect(plan.skipped).toBe(1);
    expect(plan.warnings.some((warning) => warning.includes('第 4 行'))).toBe(true);
  });
});

describe('planGameCsvImport', () => {
  it('Steam 模板：解析时长，按名字去重', () => {
    const csv = ['name,hours_played', 'Hades,123.4', 'Celeste,0', 'Hades, 9'].join('\n');
    const plan = planGameCsvImport(csv, [game('Celeste')]);

    expect(plan.total).toBe(3);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toAdd[0]!.name).toBe('Hades');
    expect(plan.toAdd[0]!.hoursPlayed).toBe(123.4);
    expect(plan.toAdd[0]!.platform).toBe('PC');
    expect(plan.skipped).toBe(2); // 文件内重名 1 + 与现有 Celeste 重名 1
  });

  it('缺 name 列时给明确警告', () => {
    const plan = planGameCsvImport('foo,bar\n1,2', []);
    expect(plan.toAdd).toHaveLength(0);
    expect(plan.warnings[0]).toContain('游戏名');
  });
});

import { describe, expect, it } from 'vitest';
import {
  EXPORT_EXTENSIONS,
  MODULE_EXPORTS,
  exportModuleCsv,
  exportModuleJson,
  exportModuleMarkdown,
  jsonOnlyReason,
  moduleFileName,
  moduleJsonValue,
  moduleRecords,
  supportsFormat,
  toCsv,
} from './moduleExport';
import { BACKUP_MODULES, BACKUP_SCHEMA_VERSION, MODULE_LABELS } from './schemas';
import type { BackupData } from './schemas';
import { parseBackup } from './backup';
import type { Book, DevProject, JournalEntry, Task } from '../types';

const task = (over: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: '写周报',
  description: '本周进展',
  priority: 'high',
  status: 'completed',
  dueDate: '2026-09-28',
  subtasks: [
    { id: 'sub-1', title: '收集数据', done: true },
    { id: 'sub-2', title: '写结论', done: false },
  ],
  repeat: { kind: 'weekly', weekdays: [0, 2] },
  timebox: null,
  tags: ['工作', '紧急'],
  createdAt: '2026-09-27T01:00:00.000Z',
  completedAt: '2026-09-27T09:00:00.000Z',
  ...over,
});

const book = (over: Partial<Book> = {}): Book => ({
  id: 'book-1',
  title: '维摩诘经',
  author: '佚名',
  category: '佛学',
  status: 'reading',
  progress: 42,
  notes: [],
  tags: ['佛学'],
  rating: 9,
  review: '值得一读再读',
  favorite: true,
  statusHistory: [],
  createdAt: '2026-09-20T00:00:00.000Z',
  ...over,
});

describe('登记表', () => {
  it('每个备份模块都有登记，一个不漏', () => {
    for (const module of BACKUP_MODULES) {
      expect(MODULE_EXPORTS[module], `模块 ${module} 没有登记导出规则`).toBeDefined();
    }
  });

  it('树形模块标成 JSON-only 并给出理由，其余模块都能出表格', () => {
    expect(supportsFormat('devProjects', 'json')).toBe(true);
    expect(supportsFormat('devProjects', 'csv')).toBe(false);
    expect(supportsFormat('writingProjects', 'csv')).toBe(false);
    expect(jsonOnlyReason('devProjects')).toContain('子任务');
    expect(jsonOnlyReason('writingProjects')).toContain('正文');

    // 反向：普通模块不该被误标
    expect(supportsFormat('tasks', 'csv')).toBe(true);
    expect(jsonOnlyReason('tasks')).toBeNull();
  });

  it('表格模块的列都有表头，取值函数不返回 undefined 字面量', () => {
    for (const module of BACKUP_MODULES) {
      const spec = MODULE_EXPORTS[module];
      if ('jsonOnly' in spec && spec.jsonOnly) continue;
      expect(spec.columns.length).toBeGreaterThan(0);
      for (const item of spec.columns) expect(item.label).not.toBe('');
    }
  });
});

describe('文件名', () => {
  it('带上模块中文名、日期与扩展名', () => {
    expect(moduleFileName('tasks', 'csv', '2026-09-30')).toBe('life-manager-任务-2026-09-30.csv');
    expect(moduleFileName('journal', 'markdown', '2026-09-30')).toBe(
      'life-manager-日记-2026-09-30.md',
    );
    expect(moduleFileName('books', 'json', '2026-09-30')).toBe('life-manager-书籍-2026-09-30.json');
  });

  it('扩展名表与三种格式对齐', () => {
    expect(EXPORT_EXTENSIONS).toEqual({ json: 'json', csv: 'csv', markdown: 'md' });
  });
});

describe('toCsv', () => {
  it('含逗号、引号、换行的字段加引号并转义内部引号', () => {
    const text = toCsv(['a', 'b'], [['好,书', '他说"你好"']]);
    expect(text).toBe('a,b\r\n"好,书","他说""你好"""');
  });

  it('首尾有空白的字段也加引号，免得被下游 trim 掉', () => {
    expect(toCsv(['a'], [[' 前后有空格 ']])).toBe('a\r\n" 前后有空格 "');
  });
});

describe('exportModuleJson', () => {
  it('带上 module 字段与信封，且能被 parseBackup 原样读回', () => {
    const records = [task()];
    const text = exportModuleJson('tasks', records, new Date('2026-09-30T00:00:00.000Z'));
    const raw = JSON.parse(text) as Record<string, unknown>;

    expect(raw.app).toBe('life-manager');
    expect(raw.module).toBe('tasks');
    expect(raw.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(raw.exportedAt).toBe('2026-09-30T00:00:00.000Z');

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // 只有被导出的那个模块有数据，其余一律 undefined（= 不在文件里）
    expect(parsed.backup.modules.tasks).toEqual(records);
    expect(parsed.backup.modules.books).toBeUndefined();
  });

  it('树形模块的记录（子任务 / 正文）一条不丢', () => {
    const project: DevProject = {
      id: 'dev-1',
      name: 'Life Manager',
      description: '个人管理应用',
      status: 'in-progress',
      tasks: [
        {
          id: 'dt-1',
          title: '修缺陷',
          status: 'done',
          priority: 'high',
          type: 'bug',
          milestoneId: null,
          dueDate: null,
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      tags: ['工具'],
      hoursSpent: 12,
      techStack: ['React'],
      repoUrl: '',
      archived: false,
      milestones: [{ id: 'ms-1', title: 'v1', done: true, createdAt: '2026-09-01T00:00:00.000Z' }],
      logs: [
        { id: 'log-1', date: '2026-09-02', content: '开工', createdAt: '2026-09-02T00:00:00.000Z' },
      ],
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    const parsed = parseBackup(exportModuleJson('devProjects', [project]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.modules.devProjects).toEqual([project]);
  });

  it('单模块文件不会把别的模块"导成空"—— 缺的模块保持 undefined', () => {
    const parsed = parseBackup(exportModuleJson('goals', []));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // 显式的空数组表示"这个模块确实是空的"（用户会用它清空）
    expect(parsed.backup.modules.goals).toEqual([]);
    expect(parsed.backup.modules.tasks).toBeUndefined();
  });
});

describe('exportModuleCsv', () => {
  it('表头来自登记表，一行一条记录', () => {
    const text = exportModuleCsv('tasks', [
      task(),
      task({ id: 'task-2', title: '买菜', tags: [] }),
    ]);
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('标题,状态,优先级,截止日,子任务,重复,标签,创建于');
    expect(lines[1]).toContain('写周报,已完成,高,2026-09-28');
    expect(lines[1]).toContain('工作 紧急');
    expect(lines).toHaveLength(3);
  });

  it('枚举值翻译成中文，内部 id 不落到导出的表里', () => {
    const text = exportModuleCsv('books', [book()]);
    expect(text).toContain('在读');
    expect(text).not.toContain('reading');
    // id 不该出现在 CSV 的任何一列
    expect(text).not.toContain('book-1');
  });

  it('数组字段（子任务 / 标签）压成可读摘要', () => {
    const text = exportModuleCsv('tasks', [task()]);
    expect(text).toContain('收集数据×是');
    expect(text).toContain('写结论×否');
  });

  it('导不出的模块直接报错，而不是默默吐一份残缺文件', () => {
    expect(() => exportModuleCsv('devProjects', [])).toThrow('只支持导出 JSON');
  });
});

describe('exportModuleMarkdown', () => {
  it('表格模块出 Markdown 表，竖线与换行被转义', () => {
    const md = exportModuleMarkdown('tasks', [task({ title: 'A|B', description: 'x' })]);
    expect(md).toContain('# 任务');
    expect(md).toContain('| 标题 | 状态 | 优先级 |');
    expect(md).toContain('| --- |');
    expect(md).toContain('A\\|B');
    // 表头 + 分隔行 + 1 条记录
    expect(md.split('\n').filter((line) => line.startsWith('|'))).toHaveLength(3);
  });

  it('条数与导出时间写进抬头', () => {
    const md = exportModuleMarkdown(
      'books',
      [book(), book({ id: 'b2' })],
      new Date('2026-09-30T08:05:00.000Z'),
    );
    expect(md).toContain('共 2 条');
    expect(md).toContain('2026-09-30 08:05');
  });

  it('日记按篇分节，正文换行原样保留（不进表格）', () => {
    const entry: JournalEntry = {
      id: 'j-1',
      date: '2026-09-30',
      mood: 4,
      tags: ['清醒'],
      text: '第一行\n第二行',
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    };
    const md = exportModuleMarkdown('journal', [entry]);
    expect(md).toContain('## 2026-09-30');
    expect(md).toContain('*2026-09-30 · 4/5 · 清醒*');
    expect(md).toContain('第一行\n第二行');
    expect(md).not.toContain('| 日期 |');
  });

  it('空数组也出一份带抬头的文件，不是空字符串', () => {
    const md = exportModuleMarkdown('goals', []);
    expect(md).toContain('# 目标');
    expect(md).toContain('共 0 条');
  });
});

describe('导出格式与模块标签的一致性', () => {
  it('每个模块的文件名都用了它的中文标签', () => {
    for (const module of BACKUP_MODULES) {
      expect(moduleFileName(module, 'json', '2026-01-01')).toContain(MODULE_LABELS[module]);
    }
  });
});

describe('非记录数组模块（每日目标 / 饮水打卡）', () => {
  /** 只填本用例用得到的模块；这些用例不读其它模块 */
  const dataWith = (modules: Partial<BackupData>): BackupData => modules as BackupData;

  it('饮水摊平成一天一行，按日期先后排列', () => {
    const rows = moduleRecords(
      dataWith({ dietWater: { '2026-09-02': 6, '2026-09-01': 8 } }),
      'dietWater',
    );
    expect(rows).toEqual([
      { date: '2026-09-01', glasses: 8 },
      { date: '2026-09-02', glasses: 6 },
    ]);

    const lines = exportModuleCsv('dietWater', rows).split('\r\n');
    expect(lines[0]).toBe('日期,杯数');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('2026-09-01,8');
    expect(lines[2]).toBe('2026-09-02,6');
  });

  it('目标是模块单值，摊平成一行两列', () => {
    const rows = moduleRecords(
      dataWith({ dietGoals: { calories: 2100, protein: 120 } }),
      'dietGoals',
    );
    expect(rows).toEqual([{ calories: 2100, protein: 120 }]);

    const lines = exportModuleCsv('dietGoals', rows).split('\r\n');
    expect(lines[0]).toBe('每日热量目标 (kcal),每日蛋白质目标 (g)');
    expect(lines[1]).toBe('2100,120');
  });

  it('JSON 导出保留模块本来的形状，能被 parseBackup 读回来', () => {
    const water = { '2026-09-01': 8, '2026-09-02': 6 };
    const goals = { calories: 2100, protein: 120 };

    const waterParsed = parseBackup(
      exportModuleJson('dietWater', moduleJsonValue(dataWith({ dietWater: water }), 'dietWater')),
    );
    expect(waterParsed.ok).toBe(true);
    if (!waterParsed.ok) return;
    expect(waterParsed.backup.modules.dietWater).toEqual(water);

    const goalsParsed = parseBackup(
      exportModuleJson('dietGoals', moduleJsonValue(dataWith({ dietGoals: goals }), 'dietGoals')),
    );
    expect(goalsParsed.ok).toBe(true);
    if (!goalsParsed.ok) return;
    expect(goalsParsed.backup.modules.dietGoals).toEqual(goals);
  });
});

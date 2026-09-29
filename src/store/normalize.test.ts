import { beforeEach, describe, expect, it } from 'vitest';
import {
  asRecord,
  getDroppedRecordCount,
  normalizeArray,
  normalizeRecord,
  pickBoolean,
  pickEnum,
  pickNumber,
  pickNumberMap,
  resetNormalizeStats,
} from './normalize';
import { devProjectSchema, taskSchema } from '../services/schemas';

/** 一份「旧版」任务：只有最早那批字段，没有 subtasks / repeat / description */
const legacyTask = {
  id: 't1',
  title: '旧任务',
  priority: 'high',
  status: 'pending',
  dueDate: '',
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => resetNormalizeStats());

describe('normalizeArray', () => {
  it('补齐记录里新增的字段，缺什么补什么', () => {
    const [task] = normalizeArray(taskSchema, [legacyTask]);

    expect(task).toMatchObject({ id: 't1', title: '旧任务', subtasks: [], repeat: null });
    expect(task!.description).toBe('');
  });

  it('内嵌数组里的记录也一并补齐', () => {
    const [project] = normalizeArray(devProjectSchema, [
      {
        id: 'p1',
        name: '旧项目',
        tasks: [{ id: 'dt1', title: '工作项' }],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(project!.hoursSpent).toBe(0);
    expect(project!.milestones).toEqual([]);
    expect(project!.archived).toBe(false);
    expect(project!.tasks[0]).toMatchObject({
      type: 'feature',
      status: 'todo',
      priority: 'medium',
    });
  });

  it('保留 schema 之外的未知字段，方便回退到旧版本', () => {
    const [task] = normalizeArray(taskSchema, [{ ...legacyTask, futureField: 'keep' }]);

    expect((task as Record<string, unknown>).futureField).toBe('keep');
  });

  it('字段类型不对时只修这个字段，不丢掉整条记录', () => {
    const [task] = normalizeArray(taskSchema, [{ ...legacyTask, subtasks: 'oops' }]);

    expect(task!.id).toBe('t1');
    expect(task!.subtasks).toEqual([]);
    expect(getDroppedRecordCount()).toBe(0);
  });

  it('丢了 id 的记录会补一个新 id，而不是整条丢掉', () => {
    const items = normalizeArray(taskSchema, [{ title: '没有 id 的任务' }]);

    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBeTruthy();
    expect(items[0]!.title).toBe('没有 id 的任务');
  });

  it('读不到数组时返回空数组', () => {
    expect(normalizeArray(taskSchema, 'oops')).toEqual([]);
    expect(normalizeArray(taskSchema, null)).toEqual([]);
    expect(normalizeArray(taskSchema, { 0: legacyTask })).toEqual([]);
  });

  it('彻底坏掉的条目只丢它自己，其余照常保留', () => {
    const items = normalizeArray(taskSchema, ['oops', null, 42, legacyTask]);

    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('t1');
    expect(getDroppedRecordCount()).toBe(3);
  });
});

describe('normalizeRecord', () => {
  it('非对象一律返回 null', () => {
    expect(normalizeRecord(taskSchema, null)).toBeNull();
    expect(normalizeRecord(taskSchema, 'x')).toBeNull();
    expect(normalizeRecord(taskSchema, [])).toBeNull();
  });

  it('已经是最新结构时原样读回', () => {
    const task = normalizeRecord(taskSchema, { ...legacyTask, subtasks: [], repeat: null });
    expect(task!.id).toBe('t1');
  });
});

describe('设置项读取', () => {
  it('asRecord 不会把数组或标量当对象', () => {
    expect(asRecord([1, 2])).toEqual({});
    expect(asRecord('x')).toEqual({});
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it('pickBoolean / pickNumber / pickEnum 遇到脏值回退默认', () => {
    expect(pickBoolean('yes', false)).toBe(false);
    expect(pickBoolean(true, false)).toBe(true);
    expect(pickNumber('3', 2000)).toBe(2000);
    expect(pickNumber(Number.NaN, 2000)).toBe(2000);
    expect(pickNumber(80, 2000)).toBe(80);
    expect(pickEnum('huge', ['comfortable', 'compact'] as const, 'comfortable')).toBe(
      'comfortable',
    );
    expect(pickEnum('compact', ['comfortable', 'compact'] as const, 'comfortable')).toBe('compact');
  });

  it('pickNumberMap 剔掉非数字的脏值', () => {
    expect(pickNumberMap({ '2026-09-29': 8, '2026-09-28': 'oops' })).toEqual({ '2026-09-29': 8 });
    expect(pickNumberMap(null)).toEqual({});
  });
});

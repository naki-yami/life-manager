import { describe, expect, it } from 'vitest';
import { moveTaskInArray } from './kanbanMove';
import type { DevTask } from '../types';

const task = (id: string, status: DevTask['status']): DevTask => ({
  id,
  title: `任务 ${id}`,
  status,
  priority: 'medium',
  type: 'feature',
  milestoneId: null,
  dueDate: null,
  createdAt: '2026-09-01T00:00:00.000Z',
});

describe('moveTaskInArray', () => {
  const tasks = [task('a', 'todo'), task('b', 'todo'), task('c', 'in-progress'), task('d', 'done')];

  it('跨列移动：放到目标列某一项的前面', () => {
    const next = moveTaskInArray(tasks, 'a', 'in-progress', 'c');
    expect(next.map((t) => `${t.id}:${t.status}`)).toEqual([
      'b:todo',
      'a:in-progress',
      'c:in-progress',
      'd:done',
    ]);
    // 不改原数组
    expect(tasks[0]!.status).toBe('todo');
  });

  it('跨列移动：落到目标列末尾', () => {
    const next = moveTaskInArray(tasks, 'a', 'done', null);
    expect(next.map((t) => `${t.id}:${t.status}`)).toEqual([
      'b:todo',
      'c:in-progress',
      'd:done',
      'a:done',
    ]);
  });

  it('列内重排：插到同列某一项前面', () => {
    const next = moveTaskInArray(tasks, 'b', 'todo', 'a');
    expect(next.map((t) => t.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(next[0]!.status).toBe('todo');
  });

  it('移到空列时追加到数组末尾', () => {
    const only = [task('a', 'todo'), task('b', 'todo')];
    const next = moveTaskInArray(only, 'b', 'done', null);
    expect(next.map((t) => `${t.id}:${t.status}`)).toEqual(['a:todo', 'b:done']);
  });

  it('找不到条目或落点是自己时原样返回', () => {
    expect(moveTaskInArray(tasks, 'nope', 'done', null)).toEqual(tasks);
    expect(moveTaskInArray(tasks, 'a', 'done', 'a')).toEqual(tasks);
  });
});

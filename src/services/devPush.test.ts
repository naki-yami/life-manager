import { beforeEach, describe, expect, it } from 'vitest';
import { isDevTaskPushed, pushDevTaskToToday } from './devPush';
import { useDevStore } from '../store/devStore';
import { useTaskStore } from '../store/taskStore';
import { todayKey } from '../utils/date';

beforeEach(() => {
  useTaskStore.setState({ tasks: [], memos: [] });
  useDevStore.setState({ projects: [], sessions: [] });
});

/** 建一个带两条工作项的项目，返回项目与第一条工作项 */
function seedProject() {
  useDevStore.getState().addProject('写作助手', '给书房用的');
  const project = useDevStore.getState().projects[0]!;
  useDevStore.getState().addTask(project.id, '修导出崩溃', 'high', 'bug', {
    dueDate: '2026-10-31',
  });
  return {
    project: useDevStore.getState().projects[0]!,
    task: useDevStore.getState().projects[0]!.tasks[0]!,
  };
}

describe('pushDevTaskToToday', () => {
  it('推送后今日计划多一条带 ref 回链的任务：标题带项目名、截止是今天、标签带「开发工作」', () => {
    const { project, task } = seedProject();

    const result = pushDevTaskToToday(project, task);

    expect(result.duplicated).toBe(false);
    const pushed = useTaskStore.getState().tasks[0]!;
    expect(result.taskId).toBe(pushed.id);
    expect(pushed.title).toBe('[写作助手] 修导出崩溃');
    expect(pushed.dueDate).toBe(todayKey());
    expect(pushed.priority).toBe('high');
    expect(pushed.tags).toContain('开发工作');
    expect(pushed.ref).toEqual({
      module: 'dev',
      projectId: project.id,
      projectTitle: '写作助手',
      devTaskId: task.id,
    });
  });

  it('同一条工作项重复推送不重复创建，返回已有任务的 id', () => {
    const { project, task } = seedProject();
    const first = pushDevTaskToToday(project, task);

    const second = pushDevTaskToToday(project, task);

    expect(second.duplicated).toBe(true);
    expect(second.taskId).toBe(first.taskId);
    expect(useTaskStore.getState().tasks).toHaveLength(1);
  });

  it('推送任务完成后允许再次推送（新一轮的活）', () => {
    const { project, task } = seedProject();
    const first = pushDevTaskToToday(project, task);
    useTaskStore.getState().toggleTaskStatus(first.taskId);
    expect(isDevTaskPushed(task)).toBe(false);

    const second = pushDevTaskToToday(project, task);

    expect(second.duplicated).toBe(false);
    expect(useTaskStore.getState().tasks).toHaveLength(2);
  });

  it('isDevTaskPushed 跟着推送与完成状态走', () => {
    const { project, task } = seedProject();
    expect(isDevTaskPushed(task)).toBe(false);

    const result = pushDevTaskToToday(project, task);
    expect(isDevTaskPushed(task)).toBe(true);

    useTaskStore.getState().toggleTaskStatus(result.taskId);
    expect(isDevTaskPushed(task)).toBe(false);
  });
});

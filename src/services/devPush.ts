import type { DevProject, DevTask } from '../types';
import { useTaskStore } from '../store/taskStore';
import { todayKey } from '../utils/date';

export interface DevPushResult {
  /** 新建（或已存在）的今日任务 id */
  taskId: string;
  /** true 表示这条工作项之前已经推过、这次没有重复创建 */
  duplicated: boolean;
}

/**
 * 把一条开发工作项推进「今日计划」。
 *
 * 对齐木子工作台的跨模块联动：今日计划只安排「今天做什么」，
 * 业务细节留在开发模块 —— 所以推过去的任务只带标题 / 优先级 / 截止，
 * 并用 ref 记着来处，今日计划里能一键跳回项目。
 *
 * 幂等：同一条工作项只要还有一条没做完的推送任务挂着，就不再重复创建
 * （防手滑连点）；那条任务被完成后允许再次推送。
 */
export function pushDevTaskToToday(project: DevProject, task: DevTask): DevPushResult {
  const store = useTaskStore.getState();
  const existing = store.tasks.find(
    (candidate) =>
      candidate.ref?.module === 'dev' &&
      candidate.ref.devTaskId === task.id &&
      candidate.status !== 'completed',
  );
  if (existing) return { taskId: existing.id, duplicated: true };

  const title = project.name ? `[${project.name}] ${task.title}` : task.title;
  store.addTask(
    title,
    task.dueDate ? `截止 ${task.dueDate}` : '',
    task.priority,
    todayKey(),
    null,
    ['开发工作'],
    { module: 'dev', projectId: project.id, projectTitle: project.name, devTaskId: task.id },
  );
  const tasks = useTaskStore.getState().tasks;
  const created = tasks[tasks.length - 1];
  return { taskId: created?.id ?? '', duplicated: false };
}

/** 判断一条工作项当前是否已经推在今日计划里（行上按钮的着色 / 禁用依据） */
export function isDevTaskPushed(task: DevTask): boolean {
  return useTaskStore
    .getState()
    .tasks.some(
      (candidate) =>
        candidate.ref?.module === 'dev' &&
        candidate.ref.devTaskId === task.id &&
        candidate.status !== 'completed',
    );
}

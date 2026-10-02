import type { DevItemType, DevProjectStatus, DevTaskStatus, Priority } from '../../types';

/** 项目状态筛选；archived 不是状态值，是列表口径（归档项目只在这里出现） */
export type ProjectFilter = 'all' | DevProjectStatus | 'archived';

/** 连续停滞这么多天及以上时提醒 */
export const STALLED_AFTER_DAYS = 14;

export const PROJECT_STATUS_LABEL: Record<DevProjectStatus, string> = {
  planning: '规划中',
  'in-progress': '进行中',
  completed: '已完成',
  paused: '已暂停',
};

export const PROJECT_STATUS_TONE: Record<
  DevProjectStatus,
  'default' | 'accent' | 'success' | 'warning'
> = {
  planning: 'default',
  'in-progress': 'accent',
  completed: 'success',
  paused: 'warning',
};

export const PROJECT_STATUS_OPTIONS = (
  Object.entries(PROJECT_STATUS_LABEL) as Array<[DevProjectStatus, string]>
).map(([value, label]) => ({ value, label }));

export const TASK_STATUS_LABEL: Record<DevTaskStatus, string> = {
  todo: '待办',
  'in-progress': '进行中',
  done: '已完成',
};

export const TASK_STATUS_OPTIONS = (
  Object.entries(TASK_STATUS_LABEL) as Array<[DevTaskStatus, string]>
).map(([value, label]) => ({ value, label }));

export const PRIORITY_OPTIONS: Array<{ value: Priority; label: string }> = [
  { value: 'high', label: '紧急' },
  { value: 'medium', label: '中等' },
  { value: 'low', label: '较低' },
];

export const PRIORITY_TONE: Record<Priority, 'danger' | 'warning' | 'default'> = {
  high: 'danger',
  medium: 'warning',
  low: 'default',
};

/** 工作项分类 */
export const ITEM_TYPE_LABEL: Record<DevItemType, string> = {
  feature: '功能',
  requirement: '需求',
  bug: 'BUG',
  tech: '技术问题',
};

export const ITEM_TYPE_TONE: Record<DevItemType, 'accent' | 'info' | 'danger' | 'warning'> = {
  feature: 'accent',
  requirement: 'info',
  bug: 'danger',
  tech: 'warning',
};

export const ITEM_TYPE_OPTIONS = (Object.keys(ITEM_TYPE_LABEL) as DevItemType[]).map((value) => ({
  value,
  label: ITEM_TYPE_LABEL[value],
}));

export const KANBAN_COLUMNS: DevTaskStatus[] = ['todo', 'in-progress', 'done'];

export const FILTER_OPTIONS: Array<{ value: ProjectFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'in-progress', label: '进行中' },
  { value: 'planning', label: '规划中' },
  { value: 'paused', label: '已暂停' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
];

/** 工作项区的行内筛选口径：未完成 / 只看 BUG / 全部 */
export type TaskFilter = 'open' | 'bug' | 'all';

export const TASK_FILTER_OPTIONS: Array<{ value: TaskFilter; label: string }> = [
  { value: 'open', label: '未完成' },
  { value: 'bug', label: 'Bug' },
  { value: 'all', label: '全部' },
];

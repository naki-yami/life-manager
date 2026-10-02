import React, { useState } from 'react';
import { Bug, CalendarPlus, Check, FileText, Lightbulb, Plus, Trash2, Wrench } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  IconButton,
  Input,
  KanbanBoard,
  Select,
  useToast,
  type KanbanColumnData,
  type KanbanMoveResult,
} from '../ui';
import type { DevItemType, DevProject, DevTask, DevTaskStatus, Priority } from '../../types';
import { useDevStore } from '../../store/devStore';
import { useUndoableRemove } from '../../hooks/useUndoableRemove';
import { isDevTaskPushed, pushDevTaskToToday } from '../../services/devPush';
import { moveTaskInArray } from '../../utils/kanbanMove';
import { todayKey } from '../../utils/date';
import {
  ITEM_TYPE_LABEL,
  ITEM_TYPE_OPTIONS,
  ITEM_TYPE_TONE,
  KANBAN_COLUMNS,
  PRIORITY_OPTIONS,
  PRIORITY_TONE,
  TASK_FILTER_OPTIONS,
  TASK_STATUS_LABEL,
  TASK_STATUS_OPTIONS,
  type TaskFilter,
} from './constants';

const ITEM_TYPE_ICON: Record<DevItemType, React.ReactNode> = {
  feature: <Lightbulb size={13} aria-hidden />,
  requirement: <FileText size={13} aria-hidden />,
  bug: <Bug size={13} aria-hidden />,
  tech: <Wrench size={13} aria-hidden />,
};

export interface WorkItemListProps {
  project: DevProject;
}

interface TaskFormState {
  title: string;
  priority: Priority;
  type: DevItemType;
  milestoneId: string;
  dueDate: string;
}

const EMPTY_TASK_FORM: TaskFormState = {
  title: '',
  priority: 'medium',
  type: 'feature',
  milestoneId: '',
  dueDate: '',
};

/**
 * 工作项区：列表（默认）与看板两种视图，未完成 / Bug / 全部三种行内筛选。
 * 行上可以直接推送到今日计划（ref 回链，见 services/devPush）。
 */
export const WorkItemList: React.FC<WorkItemListProps> = ({ project }) => {
  const { projects, addTask, updateTaskStatus, deleteTask, reorderTasks, replaceProjects } =
    useDevStore();
  const undoableRemove = useUndoableRemove();
  const { toast } = useToast();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [filter, setFilter] = useState<TaskFilter>('open');
  const [form, setForm] = useState<TaskFormState>(EMPTY_TASK_FORM);
  const today = todayKey();

  const filteredTasks = project.tasks.filter((task) => {
    if (filter === 'open') return task.status !== 'done';
    if (filter === 'bug') return task.type === 'bug';
    return true;
  });
  const openCount = project.tasks.filter((task) => task.status !== 'done').length;

  const handleAdd = (): void => {
    if (!form.title.trim()) return;
    addTask(project.id, form.title.trim(), form.priority, form.type, {
      milestoneId: form.milestoneId || null,
      dueDate: form.dueDate || null,
    });
    setForm(EMPTY_TASK_FORM);
  };

  const handlePush = (task: DevTask): void => {
    const result = pushDevTaskToToday(project, task);
    if (result.duplicated) {
      toast({
        tone: 'warning',
        title: '已经在今日计划里',
        description: '未完成的推送不重复创建。',
      });
    } else {
      toast({
        tone: 'success',
        title: '已加入今日计划',
        description: `「${task.title}」排进了今天。`,
      });
    }
  };

  const handleKanbanMove = (move: KanbanMoveResult): void => {
    const next = moveTaskInArray(
      project.tasks,
      move.itemId,
      move.toColumnId as DevTaskStatus,
      move.overItemId,
    );
    reorderTasks(project.id, next);
  };

  const removeTask = (task: DevTask): void => {
    const snapshot = projects;
    deleteTask(project.id, task.id);
    undoableRemove({
      message: `已删除任务「${task.title}」`,
      description: '点「撤销」可以恢复。',
      snapshot,
      restore: replaceProjects,
    });
  };

  const kanbanColumns: KanbanColumnData[] = KANBAN_COLUMNS.map((column) => ({
    id: column,
    title: TASK_STATUS_LABEL[column],
    items: project.tasks
      .filter((task) => task.status === column)
      .map((task) => ({
        id: task.id,
        label: task.title,
        node: <KanbanTaskCard task={task} project={project} onDelete={removeTask} />,
      })),
  }));

  const milestoneTitleOf = (id: string | null): string | null => {
    if (!id) return null;
    return project.milestones.find((milestone) => milestone.id === id)?.title ?? null;
  };

  return (
    <Card>
      <CardHeader
        title="工作项"
        subtitle={
          project.tasks.length > 0
            ? `${openCount} 条未完成 / 共 ${project.tasks.length} 条`
            : '拆成几条具体的事，推进起来更有数'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="筛选工作项"
              className="w-28"
              value={filter}
              onChange={(value) => setFilter(value as TaskFilter)}
              options={TASK_FILTER_OPTIONS}
            />
            <Select
              aria-label="切换工作项视图"
              className="w-28"
              value={view}
              onChange={(value) => setView(value as 'list' | 'board')}
              options={[
                { value: 'list', label: '列表' },
                { value: 'board', label: '看板' },
              ]}
            />
          </div>
        }
      />
      <CardBody className="space-y-4">
        <form
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_repeat(2,7rem)_9rem_7rem_auto] lg:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            handleAdd();
          }}
        >
          <div className="sm:col-span-2 lg:col-span-1">
            <Input
              label="新工作项"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="输入标题，回车快速添加"
              aria-label="新工作项标题"
            />
          </div>
          <Select
            label="优先级"
            value={form.priority}
            onChange={(value) => setForm({ ...form, priority: value as Priority })}
            options={PRIORITY_OPTIONS}
          />
          <Select
            label="类型"
            value={form.type}
            onChange={(value) => setForm({ ...form, type: value as DevItemType })}
            options={ITEM_TYPE_OPTIONS}
          />
          <Select
            label="里程碑"
            value={form.milestoneId}
            onChange={(value) => setForm({ ...form, milestoneId: value })}
            options={[
              { value: '', label: '不关联' },
              ...project.milestones.map((milestone) => ({
                value: milestone.id,
                label: milestone.title,
              })),
            ]}
          />
          <Input
            label="截止"
            type="date"
            value={form.dueDate}
            onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
            aria-label="截止日期"
          />
          <Button type="submit" icon={<Plus size={14} aria-hidden />} disabled={!form.title.trim()}>
            添加
          </Button>
        </form>

        {project.tasks.length === 0 ? (
          <p className="py-2 text-center text-xs text-content-tertiary">
            还没有工作项，在上面输入标题直接添加。
          </p>
        ) : filteredTasks.length === 0 ? (
          <p className="py-2 text-center text-xs text-content-tertiary">
            {filter === 'bug' ? '没有 BUG，很清净。' : '这一筛选下没有工作项。'}
          </p>
        ) : view === 'board' ? (
          <KanbanBoard
            label={`「${project.name}」的工作项看板`}
            columns={kanbanColumns}
            onMove={handleKanbanMove}
          />
        ) : (
          <ul className="stagger-enter divide-y divide-line-subtle rounded-lg border border-line-subtle">
            {filteredTasks.map((task) => {
              const overdue =
                task.status !== 'done' && task.dueDate !== null && task.dueDate < today;
              const milestoneTitle = milestoneTitleOf(task.milestoneId);
              const pushed = isDevTaskPushed(task);
              return (
                <li
                  key={task.id}
                  className="flex items-start gap-2.5 px-3 py-2.5 transition-[background-color,transform] duration-fast ease-standard hover:translate-x-0.5 hover:bg-hover"
                >
                  <span
                    className="mt-1 shrink-0"
                    role="img"
                    aria-label={ITEM_TYPE_LABEL[task.type]}
                  >
                    {ITEM_TYPE_ICON[task.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`min-w-0 truncate text-sm ${
                          task.status === 'done'
                            ? 'text-content-tertiary line-through'
                            : 'text-content'
                        }`}
                      >
                        {task.title}
                      </span>
                      <Badge tone={PRIORITY_TONE[task.priority]}>
                        {PRIORITY_OPTIONS.find((option) => option.value === task.priority)?.label ??
                          '中等'}
                      </Badge>
                      {task.status === 'done' && (
                        <Badge tone="success">
                          <Check size={10} aria-hidden className="mr-0.5 inline" />
                          已完成
                        </Badge>
                      )}
                    </div>
                    {(milestoneTitle || task.dueDate) && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-content-tertiary">
                        {milestoneTitle && (
                          <span className="inline-flex items-center gap-0.5">
                            <span aria-hidden className="text-accent">
                              ◆
                            </span>
                            {milestoneTitle}
                          </span>
                        )}
                        {task.dueDate && (
                          <span className={`tabular ${overdue ? 'font-medium text-danger' : ''}`}>
                            {overdue ? '已逾期 ' : '截止 '}
                            {task.dueDate}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      label={`把「${task.title}」加入今日计划`}
                      size="sm"
                      icon={<CalendarPlus size={14} />}
                      onClick={() => handlePush(task)}
                      className={pushed ? 'text-success' : undefined}
                    />
                    <Select
                      aria-label={`调整任务「${task.title}」的状态`}
                      className="w-24"
                      value={task.status}
                      onChange={(value) =>
                        updateTaskStatus(project.id, task.id, value as DevTaskStatus)
                      }
                      options={TASK_STATUS_OPTIONS}
                    />
                    <IconButton
                      label={`删除任务「${task.title}」`}
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={() => removeTask(task)}
                      className="hover:text-danger"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
};

/** 看板卡片正文：类型、标题、优先级、里程碑、状态流转与删除 */
const KanbanTaskCard: React.FC<{
  task: DevTask;
  project: DevProject;
  onDelete: (task: DevTask) => void;
}> = ({ task, project, onDelete }) => {
  const { updateTaskStatus } = useDevStore();
  const milestoneTitle = project.milestones.find((m) => m.id === task.milestoneId)?.title ?? null;
  const overdue = task.status !== 'done' && task.dueDate !== null && task.dueDate < todayKey();

  return (
    <div>
      <div className="flex items-start gap-2">
        <Badge tone={ITEM_TYPE_TONE[task.type]}>{ITEM_TYPE_LABEL[task.type]}</Badge>
        <span
          className={`min-w-0 flex-1 text-sm ${
            task.status === 'done' ? 'text-content-tertiary line-through' : 'text-content'
          }`}
        >
          {task.title}
        </span>
        <Badge tone={PRIORITY_TONE[task.priority]}>
          {PRIORITY_OPTIONS.find((option) => option.value === task.priority)?.label ?? '中等'}
        </Badge>
      </div>
      {(milestoneTitle || task.dueDate) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-2xs text-content-tertiary">
          {milestoneTitle && (
            <span className="inline-flex items-center gap-0.5">
              <span aria-hidden className="text-accent">
                ◆
              </span>
              {milestoneTitle}
            </span>
          )}
          {task.dueDate && (
            <span className={`tabular ${overdue ? 'font-medium text-danger' : ''}`}>
              {overdue ? '已逾期 ' : '截止 '}
              {task.dueDate}
            </span>
          )}
        </p>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <Select
          aria-label={`调整任务「${task.title}」的状态`}
          className="flex-1"
          value={task.status}
          onChange={(value) => updateTaskStatus(project.id, task.id, value as DevTaskStatus)}
          options={TASK_STATUS_OPTIONS}
        />
        <IconButton
          label={`删除任务「${task.title}」`}
          size="sm"
          icon={<Trash2 size={13} />}
          onClick={() => onDelete(task)}
          className="hover:text-danger"
        />
      </div>
    </div>
  );
};

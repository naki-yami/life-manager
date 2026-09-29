import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Edit3,
  ListTodo,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  KanbanBoard,
  Modal,
  ProgressRing,
  SegmentedControl,
  Select,
  type KanbanColumnData,
  type KanbanMoveResult,
} from '../components/ui';
import { PageHeader, Toolbar } from '../components/layout';
import { BarChart } from '../components/charts';
import { useTaskStore } from '../store/taskStore';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { daysBetween, formatShortDate, todayKey } from '../utils/date';
import { seriesByWeek } from '../utils/stats';
import { Priority, RepeatKind, RepeatRule, Task, TaskStatus } from '../types';
import { useNewEntryShortcut } from '../hooks/useShortcuts';
import { usePaletteFocus } from '../hooks/usePaletteFocus';

type Filter = 'all' | TaskStatus;
type ViewMode = 'list' | 'kanban' | 'quadrant';

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string }> = [
  { value: 'list', label: '列表' },
  { value: 'kanban', label: '看板' },
  { value: 'quadrant', label: '四象限' },
];

const PRIORITY_OPTIONS = [
  { value: 'high', label: '紧急' },
  { value: 'medium', label: '中等' },
  { value: 'low', label: '较低' },
];

const PRIORITY_FILTER_OPTIONS = [
  { value: 'all', label: '全部优先级' },
  ...PRIORITY_OPTIONS,
];

const PRIORITY_BADGE: Record<Priority, { tone: 'danger' | 'warning' | 'default'; label: string }> =
  {
    high: { tone: 'danger', label: '紧急' },
    medium: { tone: 'warning', label: '中等' },
    low: { tone: 'default', label: '较低' },
  };

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** 四象限的两根轴：重要 = 紧急优先级；紧急 = 有截止且不晚于今天 */
const QUADRANTS: Array<{
  id: string;
  title: string;
  hint: string;
  important: boolean;
  urgent: boolean;
}> = [
  { id: 'do', title: '重要且紧急', hint: '立刻做', important: true, urgent: true },
  { id: 'plan', title: '重要不紧急', hint: '排进日程', important: true, urgent: false },
  { id: 'delegate', title: '紧急但不重要', hint: '抽空处理', important: false, urgent: true },
  { id: 'drop', title: '不重要不紧急', hint: '有空再说', important: false, urgent: false },
];

const REPEAT_OPTIONS: Array<{ value: 'none' | RepeatKind; label: string }> = [
  { value: 'none', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekdays', label: '工作日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
];

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

const REPEAT_LABEL: Record<RepeatKind, string> = {
  daily: '每天',
  weekdays: '工作日',
  weekly: '每周',
  monthly: '每月',
};

/** 重复规则的简短描述，用在任务角标上 */
const repeatLabel = (rule: RepeatRule): string => {
  if (rule.kind !== 'weekly' || !rule.weekdays?.length) return REPEAT_LABEL[rule.kind];
  return `每周${rule.weekdays.map((index) => WEEKDAY_LABELS[index]).join('、')}`;
};

const isUrgent = (task: Task, today: string): boolean =>
  task.dueDate !== '' && task.dueDate <= today;

interface TaskForm {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string;
  repeatKind: 'none' | RepeatKind;
  repeatWeekdays: number[];
}

const EMPTY_FORM: TaskForm = {
  title: '',
  description: '',
  priority: 'medium',
  dueDate: '',
  repeatKind: 'none',
  repeatWeekdays: [],
};

/** 截止日期的角标：逾期（含逾期天数）/ 今天 / 具体日期 */
const DueBadge: React.FC<{ task: Task }> = ({ task }) => {
  if (!task.dueDate) return null;

  const today = todayKey();
  const overdueDays =
    task.status === 'pending' && task.dueDate < today ? daysBetween(task.dueDate, today) : null;
  const isToday = task.dueDate === today;

  if (overdueDays !== null && overdueDays > 0) {
    return <Badge tone="danger">已逾期 {overdueDays} 天</Badge>;
  }
  if (isToday) return <Badge tone="accent">今天截止</Badge>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-content-tertiary">
      <CalendarDays size={12} aria-hidden />
      {task.dueDate}
    </span>
  );
};

const TaskFormFields: React.FC<{
  form: TaskForm;
  onChange: (form: TaskForm) => void;
}> = ({ form, onChange }) => (
  <div className="space-y-4">
    <Input
      label="标题"
      value={form.title}
      onChange={(event) => onChange({ ...form, title: event.target.value })}
      placeholder="任务标题"
      required
    />
    <Input
      label="描述"
      value={form.description}
      onChange={(event) => onChange({ ...form, description: event.target.value })}
      placeholder="任务描述（可选）"
      multiline
      rows={3}
    />
    <div className="grid gap-4 sm:grid-cols-2">
      <Select
        label="优先级"
        value={form.priority}
        onChange={(value) => onChange({ ...form, priority: value as Priority })}
        options={PRIORITY_OPTIONS}
      />
      <Input
        label="截止日期"
        type="date"
        value={form.dueDate}
        onChange={(event) => onChange({ ...form, dueDate: event.target.value })}
      />
    </div>
    <div>
      <Select
        label="重复"
        value={form.repeatKind}
        onChange={(value) =>
          onChange({ ...form, repeatKind: value as 'none' | RepeatKind })
        }
        options={REPEAT_OPTIONS}
      />
      {form.repeatKind === 'weekly' && (
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="选择每周重复的星期">
          {WEEKDAY_LABELS.map((label, index) => {
            const active = form.repeatWeekdays.includes(index);
            return (
              <button
                key={index}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange({
                    ...form,
                    repeatWeekdays: active
                      ? form.repeatWeekdays.filter((day) => day !== index)
                      : [...form.repeatWeekdays, index].sort((a, b) => a - b),
                  })
                }
                className={`h-7 w-8 rounded text-xs font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
                  active
                    ? 'bg-accent-soft text-accent'
                    : 'bg-inset text-content-tertiary hover:text-content-secondary'
                }`}
              >
                周{label}
              </button>
            );
          })}
        </div>
      )}
      {form.repeatKind !== 'none' && (
        <p className="mt-1.5 text-xs text-content-tertiary">
          完成后会按这个规则自动生成下一次
        </p>
      )}
    </div>
  </div>
);

/** 看板与四象限里的小卡片正文 */
const TaskMiniCard: React.FC<{ task: Task; onToggle: (task: Task) => void }> = ({
  task,
  onToggle,
}) => {
  const done = task.status === 'completed';
  return (
    <div className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={done}
        aria-label={done ? `标记「${task.title}」为待办` : `完成「${task.title}」`}
        onChange={() => onToggle(task)}
        style={{ accentColor: 'var(--lm-accent)' }}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded-sm border-line transition-transform duration-fast active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
      />
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium ${
            done ? 'text-content-tertiary line-through' : 'text-content'
          }`}
        >
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone={PRIORITY_BADGE[task.priority].tone} dot>
            {PRIORITY_BADGE[task.priority].label}
          </Badge>
          <DueBadge task={task} />
        </div>
      </div>
    </div>
  );
};

export const TasksPage: React.FC = () => {
  const {
    tasks,
    addTask,
    deleteTask,
    toggleTaskStatus,
    updateTask,
    replaceTasks,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
  } = useTaskStore();
  const undoableRemove = useUndoableRemove();

  const [showAddModal, setShowAddModal] = useState(false);
  useNewEntryShortcut(() => {
    setForm(EMPTY_FORM);
    setShowAddModal(true);
  });

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [keyword, setKeyword] = useState('');
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set());
  const [subtaskDraft, setSubtaskDraft] = useState<Record<string, string>>({});

  const today = todayKey();
  const pendingCount = tasks.filter((task) => task.status === 'pending').length;
  const completedCount = tasks.length - pendingCount;

  const todayTasks = tasks.filter((task) => task.dueDate === today);
  const todayDone = todayTasks.filter((task) => task.status === 'completed').length;

  const weeklyDone = useMemo(
    () =>
      seriesByWeek(
        tasks.filter((task) => task.status === 'completed'),
        8,
        today,
        (task) => task.completedAt?.slice(0, 10),
        () => 1,
      ),
    [tasks, today],
  );

  const visibleTasks = useMemo(() => {
    const query = keyword.trim().toLowerCase();

    return tasks
      .filter((task) => filter === 'all' || task.status === filter)
      .filter((task) => priorityFilter === 'all' || task.priority === priorityFilter)
      .filter(
        (task) =>
          query === '' ||
          task.title.toLowerCase().includes(query) ||
          task.description.toLowerCase().includes(query),
      )
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
        const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (byPriority !== 0) return byPriority;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [tasks, filter, priorityFilter, keyword]);

  const editingTask = tasks.find((task) => task.id === editingTaskId) ?? null;
  const deletingTask = tasks.find((task) => task.id === pendingDeleteId) ?? null;

  /** 勾选/取消完成立即生效，并用快照撤销还原状态 */
  const toggleWithUndo = (task: Task): void => {
    const snapshot = tasks;
    toggleTaskStatus(task.id);
    undoableRemove({
      message:
        task.status === 'pending'
          ? `已完成「${task.title}」`
          : `已把「${task.title}」恢复为待办`,
      description: '点「撤销」可以还原。',
      snapshot,
      restore: replaceTasks,
    });
  };

  const kanbanColumns: KanbanColumnData[] = useMemo(
    () => [
      {
        id: 'pending',
        title: '待办',
        items: visibleTasks
          .filter((task) => task.status === 'pending')
          .map((task) => ({
            id: task.id,
            label: task.title,
            node: <TaskMiniCard task={task} onToggle={toggleWithUndo} />,
          })),
      },
      {
        id: 'completed',
        title: '已完成',
        items: visibleTasks
          .filter((task) => task.status === 'completed')
          .map((task) => ({
            id: task.id,
            label: task.title,
            node: <TaskMiniCard task={task} onToggle={toggleWithUndo} />,
          })),
      },
    ],
    // toggleWithUndo 每次渲染都是新函数，但它只依赖 store 的当前快照，行为一致
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleTasks],
  );

  const handleKanbanMove = (move: KanbanMoveResult): void => {
    // 看板只做「待办 ↔ 已完成」的流转，列内顺序仍按优先级排序展示
    if (move.fromColumnId !== move.toColumnId) toggleTaskStatus(move.itemId);
  };

  const buildRepeat = (): RepeatRule | null => {
    if (form.repeatKind === 'none') return null;
    if (form.repeatKind === 'weekly') return { kind: 'weekly', weekdays: form.repeatWeekdays };
    return { kind: form.repeatKind };
  };

  const handleAdd = (): void => {
    if (!form.title.trim()) return;
    addTask(form.title.trim(), form.description.trim(), form.priority, form.dueDate, buildRepeat());
    setForm(EMPTY_FORM);
    setShowAddModal(false);
  };

  const handleEdit = (): void => {
    if (!editingTaskId || !form.title.trim()) return;
    updateTask(editingTaskId, {
      title: form.title.trim(),
      description: form.description.trim(),
      priority: form.priority,
      dueDate: form.dueDate,
      repeat: buildRepeat(),
    });
    setEditingTaskId(null);
  };

  const openEdit = (task: Task): void => {
    setEditingTaskId(task.id);
    setForm({
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
      repeatKind: task.repeat?.kind ?? 'none',
      repeatWeekdays: task.repeat?.weekdays ?? [],
    });
  };

  // 命令面板搜到本页的任务时，直接打开它的编辑弹窗
  usePaletteFocus('/tasks', (taskId) => {
    const task = tasks.find((item) => item.id === taskId);
    if (task) openEdit(task);
  });

  const toggleSubExpand = (taskId: string): void => {
    setExpandedSubtasks((previous) => {
      const next = new Set(previous);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleAddSubtask = (taskId: string): void => {
    const title = (subtaskDraft[taskId] ?? '').trim();
    if (!title) return;
    addSubtask(taskId, title);
    setSubtaskDraft({ ...subtaskDraft, [taskId]: '' });
  };

  const confirmDelete = (): void => {
    const target = tasks.find((task) => task.id === pendingDeleteId) ?? null;
    const snapshot = tasks;
    if (pendingDeleteId) deleteTask(pendingDeleteId);
    setPendingDeleteId(null);
    if (target) {
      undoableRemove({
        message: `已删除任务「${target.title}」`,
        description: '点「撤销」可以放回原来的位置。',
        snapshot,
        restore: replaceTasks,
      });
    }
  };

  return (
    <div className="space-y-section">
      <PageHeader
        title="今日计划"
        description="把要做的事写下来，按优先级推进"
        icon={ListTodo}
        actions={
          <Button
            icon={<Plus size={16} aria-hidden />}
            onClick={() => {
              setForm(EMPTY_FORM);
              setShowAddModal(true);
            }}
          >
            添加任务
          </Button>
        }
      />

      {tasks.length > 0 && (
        <Card>
          <CardHeader title="今日进度" subtitle="按截止日期是今天的任务统计" />
          <CardBody className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex items-center gap-4">
              <ProgressRing
                value={todayDone}
                max={Math.max(todayTasks.length, 1)}
                label={`今日到期任务完成 ${todayDone}/${todayTasks.length}`}
              >
                {todayTasks.length > 0 ? `${todayDone}/${todayTasks.length}` : '—'}
              </ProgressRing>
              <div>
                <p className="text-sm font-medium text-content">
                  {todayTasks.length > 0
                    ? `今日到期 ${todayTasks.length} 件，已完成 ${todayDone} 件`
                    : '今天没有到期任务'}
                </p>
                <p className="text-xs text-content-tertiary">
                  本周已完成 {weeklyDone[weeklyDone.length - 1]?.value ?? 0} 件
                </p>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <BarChart
                data={weeklyDone}
                label="近 8 周每周完成任务数"
                formatValue={(value) => `${value} 件`}
                formatDate={formatShortDate}
              />
            </div>
          </CardBody>
        </Card>
      )}

      <Toolbar
        search={{ value: keyword, onChange: setKeyword, placeholder: '搜索标题或描述…' }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="按优先级筛选"
              className="w-32"
              value={priorityFilter}
              onChange={(value) => setPriorityFilter(value as 'all' | Priority)}
              options={PRIORITY_FILTER_OPTIONS}
            />
            <SegmentedControl
              label="任务视图"
              size="sm"
              value={view}
              onChange={setView}
              options={VIEW_OPTIONS}
            />
            <SegmentedControl
              label="任务筛选"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: '全部', count: tasks.length },
                { value: 'pending', label: '待办', count: pendingCount },
                { value: 'completed', label: '已完成', count: completedCount },
              ]}
            />
          </div>
        }
      />

      {visibleTasks.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListTodo size={22} aria-hidden />}
            title={tasks.length === 0 ? '还没有任务' : '没有符合条件的任务'}
            description={
              tasks.length === 0
                ? '从「添加任务」开始，把今天要做的事记下来。'
                : '换个关键词，或者切换上面的筛选条件。'
            }
            action={
              tasks.length === 0 ? (
                <Button
                  icon={<Plus size={16} aria-hidden />}
                  onClick={() => {
                    setForm(EMPTY_FORM);
                    setShowAddModal(true);
                  }}
                >
                  添加任务
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setKeyword('');
                    setFilter('all');
                    setPriorityFilter('all');
                  }}
                >
                  清除筛选
                </Button>
              )
            }
          />
        </Card>
      ) : view === 'kanban' ? (
        <KanbanBoard
          label="任务看板"
          columns={kanbanColumns}
          onMove={handleKanbanMove}
        />
      ) : view === 'quadrant' ? (
        <div className="grid gap-4 md:grid-cols-2">
          {QUADRANTS.map((quadrant) => {
            const items = visibleTasks.filter(
              (task) =>
                task.status === 'pending' &&
                (task.priority === 'high') === quadrant.important &&
                isUrgent(task, today) === quadrant.urgent,
            );
            return (
              <Card key={quadrant.id}>
                <CardHeader
                  title={quadrant.title}
                  subtitle={`${quadrant.hint} · ${items.length} 件`}
                />
                <CardBody>
                  {items.length === 0 ? (
                    <p className="py-3 text-center text-xs text-content-tertiary">
                      这一格没有任务
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {items.map((task) => (
                        <li key={task.id} className="rounded bg-inset px-3 py-2">
                          <TaskMiniCard task={task} onToggle={toggleWithUndo} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        <ul className="space-y-2">
          {visibleTasks.map((task) => {
            const priority = PRIORITY_BADGE[task.priority];
            const done = task.status === 'completed';

            return (
              <li key={task.id}>
                <Card className="p-3.5">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={done}
                      aria-label={done ? `标记「${task.title}」为待办` : `完成「${task.title}」`}
                      onChange={() => toggleWithUndo(task)}
                      style={{ accentColor: 'var(--lm-accent)' }}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded-sm border-line transition-transform duration-fast active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                    />

                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-medium transition-colors duration-fast ${
                          done ? 'text-content-tertiary line-through' : 'text-content'
                        }`}
                      >
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="mt-0.5 truncate text-sm text-content-tertiary">
                          {task.description}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge tone={priority.tone} dot>
                          {priority.label}
                        </Badge>
                        <DueBadge task={task} />
                        {task.repeat && (
                          <span className="inline-flex items-center gap-1 text-xs text-content-tertiary">
                            <Repeat size={11} aria-hidden />
                            {repeatLabel(task.repeat)}
                          </span>
                        )}
                      </div>

                      {(() => {
                        const subOpen = expandedSubtasks.has(task.id);
                        const subDone = task.subtasks.filter((item) => item.done).length;
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleSubExpand(task.id)}
                              aria-expanded={subOpen}
                              className="mt-2 inline-flex items-center gap-1 rounded text-xs text-content-tertiary transition-colors duration-fast hover:text-content-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                            >
                              {subOpen ? (
                                <ChevronDown size={12} aria-hidden />
                              ) : (
                                <ChevronRight size={12} aria-hidden />
                              )}
                              <ListTodo size={11} aria-hidden />
                              {task.subtasks.length > 0
                                ? `子任务 ${subDone}/${task.subtasks.length}`
                                : '添加子任务'}
                            </button>

                            {subOpen && (
                              <div className="mt-2 space-y-2 rounded bg-inset p-2.5">
                                {task.subtasks.length > 0 && (
                                  <ul className="space-y-1">
                                    {task.subtasks.map((subtask) => (
                                      <li
                                        key={subtask.id}
                                        className="flex items-center gap-2"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={subtask.done}
                                          onChange={() => toggleSubtask(task.id, subtask.id)}
                                          aria-label={`完成子任务「${subtask.title}」`}
                                          style={{ accentColor: 'var(--lm-accent)' }}
                                          className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded-sm border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                                        />
                                        <span
                                          className={`min-w-0 flex-1 truncate text-xs ${
                                            subtask.done
                                              ? 'text-content-tertiary line-through'
                                              : 'text-content-secondary'
                                          }`}
                                        >
                                          {subtask.title}
                                        </span>
                                        <IconButton
                                          label={`删除子任务「${subtask.title}」`}
                                          size="sm"
                                          icon={<Trash2 size={12} />}
                                          onClick={() => deleteSubtask(task.id, subtask.id)}
                                          className="hover:text-danger"
                                        />
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                <div className="flex items-end gap-1.5">
                                  <div className="min-w-0 flex-1">
                                    <Input
                                      aria-label={`为「${task.title}」添加子任务`}
                                      value={subtaskDraft[task.id] ?? ''}
                                      onChange={(event) =>
                                        setSubtaskDraft({
                                          ...subtaskDraft,
                                          [task.id]: event.target.value,
                                        })
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          event.preventDefault();
                                          handleAddSubtask(task.id);
                                        }
                                      }}
                                      placeholder="新子任务，回车添加"
                                    />
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => handleAddSubtask(task.id)}
                                    disabled={!(subtaskDraft[task.id] ?? '').trim()}
                                  >
                                    添加
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div className="flex shrink-0 gap-0.5">
                      <IconButton
                        label={`编辑「${task.title}」`}
                        size="sm"
                        icon={<Edit3 size={15} />}
                        onClick={() => openEdit(task)}
                      />
                      <IconButton
                        label={`删除「${task.title}」`}
                        size="sm"
                        icon={<Trash2 size={15} />}
                        onClick={() => setPendingDeleteId(task.id)}
                        className="hover:text-danger"
                      />
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="添加任务"
        description="标题必填，其余可以先留空"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              取消
            </Button>
            <Button onClick={handleAdd} disabled={!form.title.trim()}>
              添加
            </Button>
          </>
        }
      >
        <TaskFormFields form={form} onChange={setForm} />
      </Modal>

      <Modal
        isOpen={editingTask !== null}
        onClose={() => setEditingTaskId(null)}
        title="编辑任务"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingTaskId(null)}>
              取消
            </Button>
            <Button onClick={handleEdit} disabled={!form.title.trim()}>
              保存
            </Button>
          </>
        }
      >
        <TaskFormFields form={form} onChange={setForm} />
      </Modal>

      <ConfirmDialog
        isOpen={deletingTask !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={confirmDelete}
        title="删除任务"
        description={deletingTask ? `确定要删除「${deletingTask.title}」吗？` : ''}
        confirmText="删除"
        tone="danger"
      />
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { CalendarDays, Edit3, ListTodo, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Select,
} from '../components/ui';
import { PageHeader, Toolbar } from '../components/layout';
import { useTaskStore } from '../store/taskStore';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { todayKey } from '../utils/date';
import { Priority, Task, TaskStatus } from '../types';

type Filter = 'all' | TaskStatus;

const PRIORITY_OPTIONS = [
  { value: 'high', label: '紧急' },
  { value: 'medium', label: '中等' },
  { value: 'low', label: '较低' },
];

const PRIORITY_BADGE: Record<Priority, { tone: 'danger' | 'warning' | 'default'; label: string }> =
  {
    high: { tone: 'danger', label: '紧急' },
    medium: { tone: 'warning', label: '中等' },
    low: { tone: 'default', label: '较低' },
  };

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

interface TaskForm {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string;
}

const EMPTY_FORM: TaskForm = { title: '', description: '', priority: 'medium', dueDate: '' };

/** 截止日期的角标：逾期 / 今天 / 具体日期 */
const DueBadge: React.FC<{ task: Task }> = ({ task }) => {
  if (!task.dueDate) return null;

  const today = todayKey();
  const overdue = task.status === 'pending' && task.dueDate < today;
  const isToday = task.dueDate === today;

  if (overdue) return <Badge tone="danger">已逾期 {task.dueDate}</Badge>;
  if (isToday) return <Badge tone="accent">今天截止</Badge>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-content-tertiary">
      <CalendarDays size={12} aria-hidden />
      {task.dueDate}
    </span>
  );
};

const TaskFormFields: React.FC<{ form: TaskForm; onChange: (form: TaskForm) => void }> = ({
  form,
  onChange,
}) => (
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
);

export const TasksPage: React.FC = () => {
  const { tasks, addTask, deleteTask, toggleTaskStatus, updateTask, replaceTasks } = useTaskStore();
  const undoableRemove = useUndoableRemove();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [keyword, setKeyword] = useState('');
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);

  const pendingCount = tasks.filter((task) => task.status === 'pending').length;
  const completedCount = tasks.length - pendingCount;

  const visibleTasks = useMemo(() => {
    const query = keyword.trim().toLowerCase();

    return tasks
      .filter((task) => filter === 'all' || task.status === filter)
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
  }, [tasks, filter, keyword]);

  const editingTask = tasks.find((task) => task.id === editingTaskId) ?? null;
  const deletingTask = tasks.find((task) => task.id === pendingDeleteId) ?? null;

  const handleAdd = (): void => {
    if (!form.title.trim()) return;
    addTask(form.title.trim(), form.description.trim(), form.priority, form.dueDate);
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
    });
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

      <Toolbar
        search={{ value: keyword, onChange: setKeyword, placeholder: '搜索标题或描述…' }}
        actions={
          <SegmentedControl
            label="任务筛选"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: '全部', count: tasks.length },
              { value: 'pending', label: '待办', count: pendingCount },
              { value: 'completed', label: '已完成', count: completedCount },
            ]}
          />
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
                  }}
                >
                  清除筛选
                </Button>
              )
            }
          />
        </Card>
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
                      onChange={() => toggleTaskStatus(task.id)}
                      style={{ accentColor: 'var(--lm-accent)' }}
                      className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded-sm border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                    />

                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-medium ${
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
                      </div>
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
        description={deletingTask ? `确定要删除「${deletingTask.title}」吗？此操作不可撤销。` : ''}
        confirmText="删除"
        tone="danger"
      />
    </div>
  );
};

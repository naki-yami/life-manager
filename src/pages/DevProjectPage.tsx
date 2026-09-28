import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Code2, ExternalLink, ListChecks, Trash2 } from 'lucide-react';
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
  NumberInput,
  ProgressBar,
  Select,
  StatCard,
  Textarea,
  type KanbanColumnData,
  type KanbanMoveResult,
} from '../components/ui';
import { PageHeader } from '../components/layout';
import { BarChart } from '../components/charts';
import { useDevStore } from '../store/devStore';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { formatNumber, formatShortDate, todayKey } from '../utils/date';
import { seriesByDay } from '../utils/stats';
import { moveTaskInArray } from '../utils/kanbanMove';
import {
  DevProject,
  DevProjectStatus,
  DevTask,
  DevTaskStatus,
  Priority,
  WorkSession,
} from '../types';

const PROJECT_STATUS_LABEL: Record<DevProjectStatus, string> = {
  planning: '规划中',
  'in-progress': '进行中',
  completed: '已完成',
  paused: '已暂停',
};

const PROJECT_STATUS_OPTIONS = (
  Object.entries(PROJECT_STATUS_LABEL) as Array<[DevProjectStatus, string]>
).map(([value, label]) => ({ value, label }));

const TASK_STATUS_LABEL: Record<DevTaskStatus, string> = {
  todo: '待办',
  'in-progress': '进行中',
  done: '已完成',
};

const TASK_STATUS_OPTIONS = (
  Object.entries(TASK_STATUS_LABEL) as Array<[DevTaskStatus, string]>
).map(([value, label]) => ({ value, label }));

const PRIORITY_OPTIONS = [
  { value: 'high', label: '紧急' },
  { value: 'medium', label: '中等' },
  { value: 'low', label: '较低' },
];

const PRIORITY_TONE: Record<Priority, 'danger' | 'warning' | 'default'> = {
  high: 'danger',
  medium: 'warning',
  low: 'default',
};

const KANBAN_COLUMNS: DevTaskStatus[] = ['todo', 'in-progress', 'done'];

/** 活动日志最多列几条流水 */
const SESSION_PREVIEW_COUNT = 10;

/** 删一条工时流水会同时改动 sessions 与项目上的累计工时，撤销得把两边一起还原 */
interface WorkLogSnapshot {
  sessions: WorkSession[];
  projects: DevProject[];
}

export const DevProjectPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const {
    projects,
    updateProjectStatus,
    addTask,
    reorderTasks,
    replaceProjects,
    sessions,
    addSession,
    deleteSession,
    replaceSessions,
  } = useDevStore();
  const undoableRemove = useUndoableRemove();

  const [taskForm, setTaskForm] = useState<{ title: string; priority: Priority }>({
    title: '',
    priority: 'medium',
  });
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState<{
    date: string;
    hours: number | '';
    note: string;
  }>({ date: todayKey(), hours: 1, note: '' });

  const project = projects.find((item) => item.id === id) ?? null;
  const projectSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.projectId === id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [sessions, id],
  );

  const today = todayKey();
  const totalHours = projectSessions.reduce((sum, session) => sum + session.hours, 0);
  const monthHours = projectSessions
    .filter((session) => session.date.slice(0, 7) === today.slice(0, 7))
    .reduce((sum, session) => sum + session.hours, 0);

  const dailyHours = useMemo(
    () => seriesByDay(projectSessions, 30, today, (session) => session.date, (session) => session.hours),
    [projectSessions, today],
  );

  const doneTasks = project?.tasks.filter((task) => task.status === 'done').length ?? 0;
  const percent =
    project && project.tasks.length > 0
      ? Math.round((doneTasks / project.tasks.length) * 100)
      : 0;

  const pendingSession = sessions.find((session) => session.id === pendingSessionId) ?? null;
  const sessionHours = typeof sessionForm.hours === 'number' ? sessionForm.hours : 0;
  const canSaveSession = sessionHours > 0;

  const handleAddTask = (): void => {
    if (!project || !taskForm.title.trim()) return;
    addTask(project.id, taskForm.title.trim(), taskForm.priority);
    setTaskForm({ title: '', priority: 'medium' });
  };

  const handleKanbanMove = (move: KanbanMoveResult): void => {
    if (!project) return;
    const next = moveTaskInArray(
      project.tasks,
      move.itemId,
      move.toColumnId as DevTaskStatus,
      move.overItemId,
    );
    reorderTasks(project.id, next);
  };

  const kanbanColumns: KanbanColumnData[] = project
    ? KANBAN_COLUMNS.map((column) => ({
        id: column,
        title: TASK_STATUS_LABEL[column],
        items: project.tasks
          .filter((task) => task.status === column)
          .map((task) => ({
            id: task.id,
            label: task.title,
            node: <KanbanCard task={task} projectId={project.id} />,
          })),
      }))
    : [];

  const handleAddSession = (): void => {
    if (!project || !canSaveSession) return;
    addSession(project.id, sessionForm.date || today, sessionHours, sessionForm.note.trim());
    setShowSessionModal(false);
  };

  /** 删流水会同时改 sessions 与项目上的累计工时，撤销时两边一起还原 */
  const restoreWorkLog = (snapshot: WorkLogSnapshot[]): void => {
    const entry = snapshot[0];
    if (!entry) return;
    replaceSessions(entry.sessions);
    replaceProjects(entry.projects);
  };

  if (!project) {
    return (
      <div className="space-y-section">
        <Card>
          <EmptyState
            icon={<Code2 size={22} aria-hidden />}
            titleAs="h1"
            title="项目不存在或已被删除"
            description="它可能已经被删除，或者链接已过期。"
            action={
              <Link to="/dev">
                <Button variant="secondary">返回项目列表</Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-section">
      <Link
        to="/dev"
        className="inline-flex items-center gap-1 text-sm text-content-tertiary hover:text-content-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
      >
        <ArrowLeft size={14} aria-hidden />
        返回项目列表
      </Link>

      <PageHeader
        title={project.name}
        description={project.description || '这个项目还没有介绍'}
        icon={Code2}
        actions={
          <Button
            icon={<Clock size={16} aria-hidden />}
            onClick={() => {
              setSessionForm({ date: today, hours: 1, note: '' });
              setShowSessionModal(true);
            }}
          >
            记录工时
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="累计工时"
          value={`${formatNumber(Math.round(totalHours * 10) / 10)} 小时`}
          icon={<Clock size={16} aria-hidden />}
          footer={`本月 ${formatNumber(Math.round(monthHours * 10) / 10)} 小时`}
        />
        <StatCard
          label="任务总数"
          value={project.tasks.length}
          icon={<ListChecks size={16} aria-hidden />}
        />
        <StatCard
          label="已完成任务"
          value={doneTasks}
          tone="success"
          icon={<ListChecks size={16} aria-hidden />}
          footer={
            project.tasks.length > 0
              ? `完成率 ${percent}%`
              : '还没有任务'
          }
        />
        <StatCard
          label="工时流水"
          value={projectSessions.length}
          unit="条"
          icon={<Clock size={16} aria-hidden />}
        />
      </div>

      <Card>
        <CardHeader title="项目信息" />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={`调整「${project.name}」的状态`}
              className="w-32"
              value={project.status}
              onChange={(value) => updateProjectStatus(project.id, value as DevProjectStatus)}
              options={PROJECT_STATUS_OPTIONS}
            />
            {project.techStack.map((tech) => (
              <Badge key={tech} tone="default">
                {tech}
              </Badge>
            ))}
            {project.repoUrl && (
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`打开「${project.name}」的仓库地址`}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
              >
                <ExternalLink size={12} aria-hidden />
                仓库
              </a>
            )}
          </div>
          {(project.startDate || project.endDate) && (
            <p className="text-sm text-content-tertiary tabular">
              周期：{project.startDate ?? '—'} ~ {project.endDate ?? '至今'}
            </p>
          )}
          <ProgressBar
            value={percent}
            showValue
            label={`任务完成 ${doneTasks}/${project.tasks.length}`}
            tone={percent === 100 ? 'success' : 'accent'}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="任务看板"
          subtitle="按状态分三列流转，在下面直接添加任务"
        />
        <CardBody className="space-y-4">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              handleAddTask();
            }}
          >
            <div className="min-w-48 flex-1">
              <Input
                label="新任务"
                value={taskForm.title}
                onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
                placeholder="输入任务标题，回车快速添加"
              />
            </div>
            <div className="w-28">
              <Select
                label="优先级"
                value={taskForm.priority}
                onChange={(value) => setTaskForm({ ...taskForm, priority: value as Priority })}
                options={PRIORITY_OPTIONS}
              />
            </div>
            <Button type="submit" disabled={!taskForm.title.trim()}>
              添加任务
            </Button>
          </form>

          <KanbanBoard
            label={`「${project.name}」的任务看板`}
            columns={kanbanColumns}
            onMove={handleKanbanMove}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="近 30 天投入" subtitle="每天记录的工时" />
        <CardBody>
          <BarChart
            data={dailyHours}
            label="近 30 天每日投入工时"
            formatValue={(value) => `${formatNumber(value)} 小时`}
            formatDate={formatShortDate}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="活动日志"
          subtitle={
            projectSessions.length > 0
              ? `共 ${projectSessions.length} 条 · 累计 ${formatNumber(Math.round(totalHours * 10) / 10)} 小时`
              : '还没有工时记录，点右上角「记录工时」开始'
          }
        />
        <CardBody className="space-y-3">
          {projectSessions.length === 0 ? (
            <EmptyState
              icon={<Clock size={20} aria-hidden />}
              title="还没有工时记录"
              description="记一次工时，投入就会出现在这里和图表里。"
            />
          ) : (
            <>
              <ul className="divide-y divide-line-subtle rounded border border-line-subtle">
                {projectSessions.slice(0, SESSION_PREVIEW_COUNT).map((session) => (
                  <li key={session.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="text-xs text-content-tertiary tabular">
                      {formatShortDate(session.date)}
                    </span>
                    <span className="text-sm text-content tabular">
                      {formatNumber(session.hours)} 小时
                    </span>
                    {session.note && (
                      <span className="min-w-0 flex-1 truncate text-xs text-content-tertiary">
                        {session.note}
                      </span>
                    )}
                    <IconButton
                      label={`删除 ${formatShortDate(session.date)} 的工时记录`}
                      size="sm"
                      icon={<Trash2 size={13} />}
                      onClick={() => setPendingSessionId(session.id)}
                      className="hover:text-danger"
                    />
                  </li>
                ))}
              </ul>
              {projectSessions.length > SESSION_PREVIEW_COUNT && (
                <p className="text-xs text-content-tertiary">
                  只显示最近 {SESSION_PREVIEW_COUNT} 条，共 {projectSessions.length} 条记录。
                </p>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Modal
        isOpen={showSessionModal}
        onClose={() => setShowSessionModal(false)}
        title="记录工时"
        description="记一次会写进流水，同时把工时累加到这个项目上"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowSessionModal(false)}>
              取消
            </Button>
            <Button onClick={handleAddSession} disabled={!canSaveSession}>
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="日期"
              type="date"
              value={sessionForm.date}
              onChange={(event) => setSessionForm({ ...sessionForm, date: event.target.value })}
            />
            <NumberInput
              label="工时"
              value={sessionForm.hours}
              onChange={(value) => setSessionForm({ ...sessionForm, hours: value })}
              min={0}
              step={0.5}
              suffix="小时"
            />
          </div>
          <Textarea
            label="备注"
            value={sessionForm.note}
            onChange={(event) => setSessionForm({ ...sessionForm, note: event.target.value })}
            rows={3}
            placeholder="今天推进了什么…（可选）"
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={pendingSession !== null}
        onClose={() => setPendingSessionId(null)}
        onConfirm={() => {
          const target = pendingSession;
          const workLog: WorkLogSnapshot = { sessions, projects };
          if (pendingSessionId) deleteSession(pendingSessionId);
          setPendingSessionId(null);
          if (target) {
            undoableRemove({
              message: `已删除 ${formatShortDate(target.date)} 的工时记录`,
              description: `${formatNumber(target.hours)} 小时已从「${project.name}」的累计工时里减回，点「撤销」可以恢复。`,
              snapshot: [workLog],
              restore: restoreWorkLog,
            });
          }
        }}
        title="删除工时记录"
        description={
          pendingSession
            ? `确定要删除 ${formatShortDate(pendingSession.date)} 的 ${formatNumber(pendingSession.hours)} 小时工时吗？删掉后这个项目的累计工时会相应减少。`
            : ''
        }
        confirmText="删除"
        tone="danger"
      />
    </div>
  );
};

/** 看板卡片正文：标题、优先级、状态流转与删除 */
const KanbanCard: React.FC<{ task: DevTask; projectId: string }> = ({ task, projectId }) => {
  const { projects, updateTaskStatus, deleteTask, replaceProjects } = useDevStore();
  const undoableRemove = useUndoableRemove();

  return (
    <div>
      <div className="flex items-start gap-2">
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
      <div className="mt-2 flex items-center gap-1.5">
        <Select
          aria-label={`调整任务「${task.title}」的状态`}
          className="flex-1"
          value={task.status}
          onChange={(value) => updateTaskStatus(projectId, task.id, value as DevTaskStatus)}
          options={TASK_STATUS_OPTIONS}
        />
        <IconButton
          label={`删除任务「${task.title}」`}
          size="sm"
          icon={<Trash2 size={13} />}
          onClick={() => {
            const snapshot = projects;
            deleteTask(projectId, task.id);
            undoableRemove({
              message: `已删除任务「${task.title}」`,
              description: '点「撤销」可以恢复。',
              snapshot,
              restore: replaceProjects,
            });
          }}
          className="hover:text-danger"
        />
      </div>
    </div>
  );
};

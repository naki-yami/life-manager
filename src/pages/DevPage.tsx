import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  ExternalLink,
  FolderKanban,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  Zap,
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
  Modal,
  NumberInput,
  ProgressBar,
  SegmentedControl,
  Select,
  StatCard,
  TagEditor,
  TagInput,
  Textarea,
} from '../components/ui';
import { MasterDetail, PageHeader, Toolbar } from '../components/layout';
import { BarChart } from '../components/charts';
import { useDevStore } from '../store/devStore';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { filterByKeyword } from '../utils/search';
import { dayKeyOf, formatNumber, formatShortDate, daysBetween, todayKey } from '../utils/date';
import { seriesByWeek } from '../utils/stats';
import {
  DevItemType,
  DevProject,
  DevProjectStatus,
  DevTaskStatus,
  Priority,
  WorkSession,
} from '../types';
import { useNewEntryShortcut } from '../hooks/useShortcuts';
import { useTagSuggestions } from '../hooks/useTagSuggestions';

type ProjectFilter = 'all' | DevProjectStatus | 'archived';

/** 连续停滞这么多天及以上时提醒 */
const STALLED_AFTER_DAYS = 14;

const PROJECT_STATUS_LABEL: Record<DevProjectStatus, string> = {
  planning: '规划中',
  'in-progress': '进行中',
  completed: '已完成',
  paused: '已暂停',
};

const PROJECT_STATUS_TONE: Record<DevProjectStatus, 'default' | 'accent' | 'success' | 'warning'> =
  {
    planning: 'default',
    'in-progress': 'accent',
    completed: 'success',
    paused: 'warning',
  };

const TASK_STATUS_LABEL: Record<DevTaskStatus, string> = {
  todo: '待办',
  'in-progress': '进行中',
  done: '已完成',
};

/** 工作项分类 */
const ITEM_TYPE_LABEL: Record<DevItemType, string> = {
  feature: '功能',
  requirement: '需求',
  bug: 'BUG',
  tech: '技术问题',
};

const ITEM_TYPE_TONE: Record<DevItemType, 'accent' | 'info' | 'danger' | 'warning'> = {
  feature: 'accent',
  requirement: 'info',
  bug: 'danger',
  tech: 'warning',
};

const ITEM_TYPE_OPTIONS = (Object.keys(ITEM_TYPE_LABEL) as DevItemType[]).map((value) => ({
  value,
  label: ITEM_TYPE_LABEL[value],
}));

const PRIORITY_OPTIONS = [
  { value: 'high', label: '紧急' },
  { value: 'medium', label: '中等' },
  { value: 'low', label: '较低' },
];

const PROJECT_STATUS_OPTIONS = (
  Object.entries(PROJECT_STATUS_LABEL) as Array<[DevProjectStatus, string]>
).map(([value, label]) => ({ value, label }));

const TASK_STATUS_OPTIONS = (
  Object.entries(TASK_STATUS_LABEL) as Array<[DevTaskStatus, string]>
).map(([value, label]) => ({ value, label }));

const FILTER_OPTIONS: Array<{ value: ProjectFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'in-progress', label: '进行中' },
  { value: 'planning', label: '规划中' },
  { value: 'paused', label: '已暂停' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
];

/** 「近期投入」最多列几条工时流水 */
const SESSION_PREVIEW_COUNT = 6;

/** 投入图表画最近几周，最后一格是包含今天的那一周 */
const WEEK_COUNT = 8;

/** 删一条工时流水会同时改动 sessions 与项目上的累计工时，撤销得把两边一起还原 */
interface WorkLogSnapshot {
  sessions: WorkSession[];
  projects: DevProject[];
}

export const DevPage: React.FC = () => {
  const {
    projects,
    addProject,
    updateProject,
    deleteProject,
    updateProjectStatus,
    addTask,
    updateTaskStatus,
    deleteTask,
    replaceProjects,
    sessions,
    addSession,
    deleteSession,
    replaceSessions,
  } = useDevStore();
  const undoableRemove = useUndoableRemove();
  const tagSuggestions = useTagSuggestions();

  const [showAddProject, setShowAddProject] = useState(false);
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  useNewEntryShortcut(() => {
    setProjectForm({ name: '', description: '' });
    setShowAddProject(true);
  });

  const [taskForm, setTaskForm] = useState<{
    title: string;
    priority: Priority;
    type: DevItemType;
  }>({ title: '', priority: 'medium', type: 'feature' });
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    techStack: '',
    repoUrl: '',
    startDate: '',
    endDate: '',
    tags: [] as string[],
  });
  const [sessionForm, setSessionForm] = useState<{
    projectId: string;
    date: string;
    hours: number | '';
    note: string;
  }>({ projectId: '', date: todayKey(), hours: 1, note: '' });

  const stats = useMemo(() => {
    // 归档的项目不算进统计，和默认列表保持一致
    const active = projects.filter((project) => !project.archived);
    const allTasks = active.flatMap((project) => project.tasks);
    const doneTasks = allTasks.filter((task) => task.status === 'done').length;
    return {
      total: active.length,
      active: active.filter((project) => project.status === 'in-progress').length,
      tasks: allTasks.length,
      doneTasks,
    };
  }, [projects]);

  const visibleProjects = useMemo(() => {
    const byFilter =
      filter === 'all'
        ? projects.filter((project) => !project.archived)
        : filter === 'archived'
          ? projects.filter((project) => project.archived)
          : projects.filter((project) => !project.archived && project.status === filter);
    return filterByKeyword(byFilter, keyword, (project) => [
      project.name,
      project.description,
      ...project.techStack,
      ...project.tags,
      ...project.tasks.map((task) => task.title),
    ]);
  }, [projects, filter, keyword]);

  const taskProject = projects.find((project) => project.id === taskProjectId) ?? null;
  const deletingProject = projects.find((project) => project.id === pendingDeleteProjectId) ?? null;
  const pendingSession = sessions.find((session) => session.id === pendingSessionId) ?? null;
  const editingProject = projects.find((project) => project.id === editingProjectId) ?? null;

  const today = todayKey();
  const totalHours = projects.reduce((sum, project) => sum + project.hoursSpent, 0);

  const weeklyHours = useMemo(
    () =>
      seriesByWeek(
        sessions,
        WEEK_COUNT,
        today,
        (session) => session.date,
        (session) => session.hours,
      ),
    [sessions, today],
  );

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, SESSION_PREVIEW_COUNT),
    [sessions],
  );

  /** 流水里只存 projectId，展示时换成项目名 */
  const projectNameOf = (id: string): string =>
    projects.find((project) => project.id === id)?.name ?? '已删除的项目';

  /** 项目最近一次有动静的日期：最近的工时流水，一条都没有就用创建日期 */
  const lastActivityOf = (project: DevProject): string => {
    let last = dayKeyOf(project.createdAt) ?? project.createdAt;
    for (const session of sessions) {
      if (session.projectId === project.id && session.date > last) last = session.date;
    }
    return last;
  };

  /** 停滞天数：未完成且未归档的项目，超过阈值才返回天数，否则 null */
  const stalledDaysOf = (project: DevProject): number | null => {
    if (project.archived || project.status === 'completed') return null;
    const days = daysBetween(lastActivityOf(project), today);
    return days !== null && days >= STALLED_AFTER_DAYS ? days : null;
  };

  const sessionHours = typeof sessionForm.hours === 'number' ? sessionForm.hours : 0;
  const canSaveSession = Boolean(sessionForm.projectId) && sessionHours > 0;

  const openSessionModal = (projectId?: string): void => {
    const fallback = projects.length > 0 ? projects[0].id : '';
    setSessionForm({ projectId: projectId ?? fallback, date: today, hours: 1, note: '' });
    setShowSessionModal(true);
  };

  const restoreWorkLog = (snapshot: WorkLogSnapshot[]): void => {
    const entry = snapshot[0];
    if (!entry) return;
    replaceSessions(entry.sessions);
    replaceProjects(entry.projects);
  };

  const toggleExpand = (id: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddProject = (): void => {
    if (!projectForm.name.trim()) return;
    const id = addProject(projectForm.name.trim(), projectForm.description.trim());
    setProjectForm({ name: '', description: '' });
    setShowAddProject(false);
    // 新建后直接展开，省一次点击
    setExpanded((previous) => new Set(previous).add(id));
  };

  const handleAddTask = (): void => {
    if (!taskProjectId || !taskForm.title.trim()) return;
    addTask(taskProjectId, taskForm.title.trim(), taskForm.priority, taskForm.type);
    setTaskForm({ title: '', priority: 'medium', type: 'feature' });
    setTaskProjectId(null);
  };

  const handleAddSession = (): void => {
    if (!canSaveSession) return;
    addSession(
      sessionForm.projectId,
      sessionForm.date || today,
      sessionHours,
      sessionForm.note.trim(),
    );
    setShowSessionModal(false);
  };

  const openEditModal = (project: DevProject): void => {
    setEditForm({
      name: project.name,
      description: project.description,
      techStack: project.techStack.join(', '),
      repoUrl: project.repoUrl,
      startDate: project.startDate ?? '',
      endDate: project.endDate ?? '',
      tags: project.tags,
    });
    setEditingProjectId(project.id);
  };

  const closeEditModal = (): void => {
    setEditingProjectId(null);
  };

  const handleSaveEdit = (): void => {
    if (!editingProjectId || !editForm.name.trim()) return;
    updateProject(editingProjectId, {
      name: editForm.name.trim(),
      description: editForm.description.trim(),
      techStack: editForm.techStack
        .split(/[,，、]/)
        .map((item) => item.trim())
        .filter(Boolean),
      repoUrl: editForm.repoUrl.trim(),
      startDate: editForm.startDate || undefined,
      endDate: editForm.endDate || undefined,
      tags: editForm.tags,
    });
    setEditingProjectId(null);
  };

  const toggleArchived = (project: DevProject): void => {
    updateProject(project.id, { archived: !project.archived });
  };

  const emptyState =
    projects.length === 0 ? (
      <EmptyState
        icon={<FolderKanban size={22} aria-hidden />}
        title="还没有项目"
        description="新建一个项目，把它的任务拆出来逐条推进。"
        action={
          <Button icon={<Plus size={16} aria-hidden />} onClick={() => setShowAddProject(true)}>
            新建项目
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<FolderKanban size={22} aria-hidden />}
        title="没有符合条件的项目"
        description="换个关键词，或者切换上面的状态筛选。"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setKeyword('');
              setFilter('all');
            }}
          >
            清除筛选
          </Button>
        }
      />
    );

  return (
    <div className="space-y-section">
      <PageHeader
        title="开发工作"
        description="按项目组织任务，状态一改就能看到进展"
        icon={Code2}
        actions={
          <>
            {projects.length > 0 && (
              <Button
                variant="secondary"
                icon={<Clock size={16} aria-hidden />}
                onClick={() => openSessionModal()}
              >
                记录工时
              </Button>
            )}
            <Button
              icon={<Plus size={16} aria-hidden />}
              onClick={() => {
                setProjectForm({ name: '', description: '' });
                setShowAddProject(true);
              }}
            >
              新建项目
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="项目总数"
          value={stats.total}
          icon={<FolderKanban size={16} aria-hidden />}
        />
        <StatCard
          label="进行中项目"
          value={stats.active}
          tone="accent"
          icon={<Zap size={16} aria-hidden />}
        />
        <StatCard
          label="任务总数"
          value={stats.tasks}
          icon={<ListChecks size={16} aria-hidden />}
        />
        <StatCard
          label="已完成任务"
          value={stats.doneTasks}
          tone="success"
          icon={<ListChecks size={16} aria-hidden />}
          footer={
            stats.tasks > 0
              ? `完成率 ${Math.round((stats.doneTasks / stats.tasks) * 100)}%`
              : '还没有任务'
          }
        />
      </div>

      {sessions.length > 0 && (
        <Card>
          <CardHeader
            title="近期投入"
            subtitle={`累计 ${formatNumber(Math.round(totalHours * 10) / 10)} 小时 · ${sessions.length} 条记录`}
          />
          <CardBody className="space-y-4">
            <BarChart
              data={weeklyHours}
              label="近 8 周每周投入工时"
              formatValue={(value) => `${formatNumber(value)} 小时`}
              formatDate={formatShortDate}
            />

            <ul className="divide-y divide-line-subtle rounded border border-line-subtle">
              {recentSessions.map((session) => (
                <li key={session.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="truncate text-sm text-content">
                        {projectNameOf(session.projectId)}
                      </span>
                      <span className="text-xs text-content-tertiary tabular">
                        {formatShortDate(session.date)} · {formatNumber(session.hours)} 小时
                      </span>
                    </div>
                    {session.note && (
                      <p className="mt-0.5 truncate text-xs text-content-tertiary">
                        {session.note}
                      </p>
                    )}
                  </div>
                  <IconButton
                    label={`删除 ${formatShortDate(session.date)} 在「${projectNameOf(session.projectId)}」的工时记录`}
                    size="sm"
                    icon={<Trash2 size={13} />}
                    onClick={() => setPendingSessionId(session.id)}
                    className="hover:text-danger"
                  />
                </li>
              ))}
            </ul>

            {sessions.length > recentSessions.length && (
              <p className="text-xs text-content-tertiary">
                只显示最近 {recentSessions.length} 条，共 {sessions.length} 条记录。
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <MasterDetail
        detailTitle={editingProject ? `编辑「${editingProject.name}」` : '编辑项目'}
        detailOpen={editingProject !== null}
        onCloseDetail={closeEditModal}
        drawerWidth="lg"
        emptyDetail={
          <EmptyState
            icon={<Pencil size={20} aria-hidden />}
            title="还没有选中项目"
            description="点左边任意一个项目的「编辑」，就能在这里改技术栈、仓库地址和标签。"
            className="py-6"
          />
        }
        detail={
          editingProject ? (
            <div className="space-y-4">
              <Input
                label="项目名称"
                value={editForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                required
              />
              <Input
                label="描述"
                value={editForm.description}
                onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                placeholder="项目描述（可选）"
                multiline
                rows={3}
              />
              <Input
                label="技术栈"
                value={editForm.techStack}
                onChange={(event) => setEditForm({ ...editForm, techStack: event.target.value })}
                placeholder="用逗号分隔，如：React, TypeScript"
              />
              <Input
                label="仓库地址"
                value={editForm.repoUrl}
                onChange={(event) => setEditForm({ ...editForm, repoUrl: event.target.value })}
                placeholder="https://github.com/…（可选）"
              />
              <TagInput
                label="标签"
                hint="回车或逗号分隔；标签跨模块通用，可在命令面板里输入 #标签 直接找"
                value={editForm.tags}
                suggestions={tagSuggestions}
                onChange={(tags) => setEditForm({ ...editForm, tags })}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="开始日期"
                  type="date"
                  value={editForm.startDate}
                  onChange={(event) => setEditForm({ ...editForm, startDate: event.target.value })}
                />
                <Input
                  label="结束日期"
                  type="date"
                  value={editForm.endDate}
                  onChange={(event) => setEditForm({ ...editForm, endDate: event.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="secondary" onClick={closeEditModal}>
                  取消
                </Button>
                <Button onClick={handleSaveEdit} disabled={!editForm.name.trim()}>
                  保存
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        <Toolbar
          search={{ value: keyword, onChange: setKeyword, placeholder: '搜索项目、任务或标签…' }}
          actions={
            <SegmentedControl
              label="按项目状态筛选"
              value={filter}
              onChange={setFilter}
              options={FILTER_OPTIONS.map((option) => ({
                ...option,
                count:
                  option.value === 'all'
                    ? projects.filter((project) => !project.archived).length
                    : option.value === 'archived'
                      ? projects.filter((project) => project.archived).length
                      : projects.filter(
                          (project) => !project.archived && project.status === option.value,
                        ).length,
              }))}
            />
          }
        />

        {visibleProjects.length === 0 ? (
          <Card>{emptyState}</Card>
        ) : (
          <ul className="space-y-4">
            {visibleProjects.map((project) => {
              const isExpanded = expanded.has(project.id);
              const done = project.tasks.filter((task) => task.status === 'done').length;
              const percent =
                project.tasks.length === 0 ? 0 : Math.round((done / project.tasks.length) * 100);
              const stalledDays = stalledDaysOf(project);

              return (
                <li key={project.id}>
                  <Card>
                    <div className="flex items-start gap-2 p-4">
                      <IconButton
                        label={isExpanded ? `收起「${project.name}」` : `展开「${project.name}」`}
                        size="sm"
                        aria-expanded={isExpanded}
                        icon={isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        onClick={() => toggleExpand(project.id)}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/dev/${project.id}`}
                            className="font-semibold text-content hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                          >
                            {project.name}
                          </Link>
                          <Badge tone={PROJECT_STATUS_TONE[project.status]} dot>
                            {PROJECT_STATUS_LABEL[project.status]}
                          </Badge>
                          {stalledDays !== null && (
                            <Badge tone="warning">停滞 {stalledDays} 天</Badge>
                          )}
                        </div>
                        {project.description && (
                          <p className="mt-0.5 text-sm text-content-tertiary">
                            {project.description}
                          </p>
                        )}

                        {(project.techStack.length > 0 || project.repoUrl) && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
                        )}

                        <div className="mt-1.5">
                          <TagEditor
                            tags={project.tags}
                            suggestions={tagSuggestions}
                            onChange={(tags) => updateProject(project.id, { tags })}
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <ProgressBar
                            className="min-w-40 flex-1"
                            value={percent}
                            showValue
                            label={`任务完成 ${done}/${project.tasks.length}`}
                            tone={percent === 100 ? 'success' : 'accent'}
                          />
                          <span className="text-xs text-content-tertiary tabular">
                            累计 {formatNumber(project.hoursSpent)} 小时
                          </span>
                          <Select
                            aria-label={`调整「${project.name}」的状态`}
                            className="w-32"
                            value={project.status}
                            onChange={(value) =>
                              updateProjectStatus(project.id, value as DevProjectStatus)
                            }
                            options={PROJECT_STATUS_OPTIONS}
                          />
                        </div>
                      </div>

                      <div className="flex shrink-0 gap-0.5">
                        <IconButton
                          label={`给「${project.name}」添加任务`}
                          size="sm"
                          icon={<Plus size={16} />}
                          onClick={() => {
                            setTaskForm({ title: '', priority: 'medium', type: 'feature' });
                            setTaskProjectId(project.id);
                          }}
                        />
                        <IconButton
                          label={`记录「${project.name}」的工时`}
                          size="sm"
                          icon={<Clock size={15} />}
                          onClick={() => openSessionModal(project.id)}
                        />
                        <IconButton
                          label={`编辑「${project.name}」`}
                          size="sm"
                          icon={<Pencil size={14} />}
                          onClick={() => openEditModal(project)}
                        />
                        <IconButton
                          label={
                            project.archived
                              ? `取消归档「${project.name}」`
                              : `归档「${project.name}」`
                          }
                          size="sm"
                          icon={
                            project.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />
                          }
                          onClick={() => toggleArchived(project)}
                        />
                        <IconButton
                          label={`删除项目「${project.name}」`}
                          size="sm"
                          icon={<Trash2 size={15} />}
                          onClick={() => setPendingDeleteProjectId(project.id)}
                          className="hover:text-danger"
                        />
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-line-subtle p-4">
                        {project.tasks.length === 0 ? (
                          <EmptyState
                            title="这个项目还没有任务"
                            description="拆成几条具体的事，推进起来更有数。"
                            className="py-4"
                          />
                        ) : (
                          <ul className="space-y-2">
                            {project.tasks.map((task) => (
                              <li
                                key={task.id}
                                className="flex items-center gap-3 rounded bg-inset px-3 py-2"
                              >
                                <Badge tone={ITEM_TYPE_TONE[task.type]}>
                                  {ITEM_TYPE_LABEL[task.type]}
                                </Badge>
                                <span
                                  className={`min-w-0 flex-1 truncate text-sm ${
                                    task.status === 'done'
                                      ? 'text-content-tertiary line-through'
                                      : 'text-content-secondary'
                                  }`}
                                >
                                  {task.title}
                                </span>
                                <Select
                                  aria-label={`调整任务「${task.title}」的状态`}
                                  className="w-28"
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
                                  onClick={() => {
                                    const snapshot = projects;
                                    deleteTask(project.id, task.id);
                                    undoableRemove({
                                      message: `已删除任务「${task.title}」`,
                                      description: '点「撤销」可以恢复。',
                                      snapshot,
                                      restore: replaceProjects,
                                    });
                                  }}
                                  className="hover:text-danger"
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </MasterDetail>

      <Modal
        isOpen={showAddProject}
        onClose={() => setShowAddProject(false)}
        title="新建项目"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddProject(false)}>
              取消
            </Button>
            <Button type="submit" form="dev-project-add-form" disabled={!projectForm.name.trim()}>
              创建
            </Button>
          </>
        }
      >
                <form
          id="dev-project-add-form"
          onSubmit={(event) => {
            event.preventDefault();
            handleAddProject();
          }}
        >
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
<div className="space-y-4">
          <Input
            label="项目名称"
            value={projectForm.name}
            onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })}
            placeholder="输入项目名称"
            required
          />
          <Input
            label="描述"
            value={projectForm.description}
            onChange={(event) =>
              setProjectForm({ ...projectForm, description: event.target.value })
            }
            placeholder="项目描述（可选）"
            multiline
            rows={3}
          />
        </div>
        </form>
      </Modal>
      <Modal
        isOpen={taskProject !== null}
        onClose={() => setTaskProjectId(null)}
        title={taskProject ? `给「${taskProject.name}」添加任务` : '添加任务'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTaskProjectId(null)}>
              取消
            </Button>
            <Button onClick={handleAddTask} disabled={!taskForm.title.trim()}>
              添加
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="任务标题"
            value={taskForm.title}
            onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
            placeholder="输入任务标题"
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="优先级"
              value={taskForm.priority}
              onChange={(value) => setTaskForm({ ...taskForm, priority: value as Priority })}
              options={PRIORITY_OPTIONS}
            />
            <Select
              label="类型"
              value={taskForm.type}
              onChange={(value) => setTaskForm({ ...taskForm, type: value as DevItemType })}
              options={ITEM_TYPE_OPTIONS}
            />
          </div>
        </div>
      </Modal>

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
          <Select
            label="项目"
            value={sessionForm.projectId}
            onChange={(value) => setSessionForm({ ...sessionForm, projectId: value })}
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
          />
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
        isOpen={deletingProject !== null}
        onClose={() => setPendingDeleteProjectId(null)}
        onConfirm={() => {
          const target = deletingProject;
          const snapshot = projects;
          if (pendingDeleteProjectId) deleteProject(pendingDeleteProjectId);
          setPendingDeleteProjectId(null);
          if (target) {
            undoableRemove({
              message: `已删除项目「${target.name}」`,
              description: `连同 ${target.tasks.length} 个任务一起删除，点「撤销」可以恢复。`,
              snapshot,
              restore: replaceProjects,
            });
          }
        }}
        title="删除项目"
        description={
          deletingProject
            ? `确定要删除「${deletingProject.name}」吗？它下面的 ${deletingProject.tasks.length} 个任务也会一起删除。`
            : ''
        }
        confirmText="删除"
        tone="danger"
      />

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
              description: `${projectNameOf(target.projectId)} 的 ${formatNumber(target.hours)} 小时已从累计工时里减回，点「撤销」可以恢复。`,
              snapshot: [workLog],
              restore: restoreWorkLog,
            });
          }
        }}
        title="删除工时记录"
        description={
          pendingSession
            ? `确定要删除 ${formatShortDate(pendingSession.date)} 在「${projectNameOf(pendingSession.projectId)}」的 ${formatNumber(pendingSession.hours)} 小时工时吗？删掉后这个项目的累计工时会相应减少。`
            : ''
        }
        confirmText="删除"
        tone="danger"
      />
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Code2,
  FolderKanban,
  ListChecks,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Modal,
  ProgressBar,
  SegmentedControl,
  Select,
  StatCard,
} from '../components/ui';
import { PageHeader, Toolbar } from '../components/layout';
import { useDevStore } from '../store/devStore';
import { filterByKeyword } from '../utils/search';
import { DevProjectStatus, DevTaskStatus, Priority } from '../types';

type ProjectFilter = 'all' | DevProjectStatus;

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
];

export const DevPage: React.FC = () => {
  const {
    projects,
    addProject,
    deleteProject,
    updateProjectStatus,
    addTask,
    updateTaskStatus,
    deleteTask,
  } = useDevStore();

  const [showAddProject, setShowAddProject] = useState(false);
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [taskForm, setTaskForm] = useState({ title: '', priority: 'medium' as Priority });
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const stats = useMemo(() => {
    const allTasks = projects.flatMap((project) => project.tasks);
    const doneTasks = allTasks.filter((task) => task.status === 'done').length;
    return {
      total: projects.length,
      active: projects.filter((project) => project.status === 'in-progress').length,
      tasks: allTasks.length,
      doneTasks,
    };
  }, [projects]);

  const visibleProjects = useMemo(() => {
    const byStatus =
      filter === 'all' ? projects : projects.filter((project) => project.status === filter);
    return filterByKeyword(byStatus, keyword, (project) => [
      project.name,
      project.description,
      ...project.tasks.map((task) => task.title),
    ]);
  }, [projects, filter, keyword]);

  const taskProject = projects.find((project) => project.id === taskProjectId) ?? null;
  const deletingProject = projects.find((project) => project.id === pendingDeleteProjectId) ?? null;

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
    addTask(taskProjectId, taskForm.title.trim(), taskForm.priority);
    setTaskForm({ title: '', priority: 'medium' });
    setTaskProjectId(null);
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
          <Button
            icon={<Plus size={16} aria-hidden />}
            onClick={() => {
              setProjectForm({ name: '', description: '' });
              setShowAddProject(true);
            }}
          >
            新建项目
          </Button>
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

      <Toolbar
        search={{ value: keyword, onChange: setKeyword, placeholder: '搜索项目或任务…' }}
        actions={
          <SegmentedControl
            label="按项目状态筛选"
            value={filter}
            onChange={setFilter}
            options={FILTER_OPTIONS.map((option) => ({
              ...option,
              count:
                option.value === 'all'
                  ? projects.length
                  : projects.filter((project) => project.status === option.value).length,
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
                        <h3 className="font-semibold text-content">{project.name}</h3>
                        <Badge tone={PROJECT_STATUS_TONE[project.status]} dot>
                          {PROJECT_STATUS_LABEL[project.status]}
                        </Badge>
                      </div>
                      {project.description && (
                        <p className="mt-0.5 text-sm text-content-tertiary">
                          {project.description}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <ProgressBar
                          className="min-w-40 flex-1"
                          value={percent}
                          showValue
                          label={`任务完成 ${done}/${project.tasks.length}`}
                          tone={percent === 100 ? 'success' : 'accent'}
                        />
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
                          setTaskForm({ title: '', priority: 'medium' });
                          setTaskProjectId(project.id);
                        }}
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
                                onClick={() => deleteTask(project.id, task.id)}
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

      <Modal
        isOpen={showAddProject}
        onClose={() => setShowAddProject(false)}
        title="新建项目"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddProject(false)}>
              取消
            </Button>
            <Button onClick={handleAddProject} disabled={!projectForm.name.trim()}>
              创建
            </Button>
          </>
        }
      >
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
          <Select
            label="优先级"
            value={taskForm.priority}
            onChange={(value) => setTaskForm({ ...taskForm, priority: value as Priority })}
            options={PRIORITY_OPTIONS}
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deletingProject !== null}
        onClose={() => setPendingDeleteProjectId(null)}
        onConfirm={() => {
          if (pendingDeleteProjectId) deleteProject(pendingDeleteProjectId);
          setPendingDeleteProjectId(null);
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
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Clock, Code2, FolderKanban, Plus, Zap } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  NumberInput,
  Select,
  SubmitForm,
  Textarea,
} from '../components/ui';
import { PageHeader } from '../components/layout';
import {
  DevLogList,
  InvestmentCard,
  MilestoneGrid,
  ProjectHero,
  ProjectRail,
  WorkItemList,
  STALLED_AFTER_DAYS,
  type ProjectFilter,
} from '../components/dev';
import { useDevStore } from '../store/devStore';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { useNewEntryShortcut } from '../hooks/useShortcuts';
import { filterByKeyword } from '../utils/search';
import { dayKeyOf, formatNumber, formatShortDate, daysBetween, todayKey } from '../utils/date';
import { DevProject, WorkSession } from '../types';

/**
 * 旧路由 /dev/:id 永久兼容：详情已经并进 /dev 的右栏，这里 302 到带 project 参数的新地址。
 * 项目不存在时也照跳 —— 右栏会自己落到默认选中，页面不炸。
 */
export const DevProjectRedirectPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/dev" replace />;
  return <Navigate to={`/dev?project=${encodeURIComponent(id)}`} replace />;
};

/** 删一条工时流水会同时改动 sessions 与项目上的累计工时，撤销得把两边一起还原 */
interface WorkLogSnapshot {
  sessions: WorkSession[];
  projects: DevProject[];
}

export const DevPage: React.FC = () => {
  const {
    projects,
    addProject,
    deleteProject,
    replaceProjects,
    sessions,
    addSession,
    deleteSession,
    replaceSessions,
  } = useDevStore();
  const undoableRemove = useUndoableRemove();

  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [showAddProject, setShowAddProject] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionForm, setSessionForm] = useState<{
    projectId: string;
    date: string;
    hours: number | '';
    note: string;
  }>({ projectId: '', date: todayKey(), hours: 1, note: '' });
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);

  useNewEntryShortcut(() => {
    setProjectForm({ name: '', description: '' });
    setShowAddProject(true);
  });

  const today = todayKey();

  const filterCounts = useMemo(() => {
    const counts: Record<ProjectFilter, number> = {
      all: 0,
      planning: 0,
      'in-progress': 0,
      completed: 0,
      paused: 0,
      archived: 0,
    };
    for (const project of projects) {
      if (project.archived) counts.archived += 1;
      else {
        counts.all += 1;
        counts[project.status] += 1;
      }
    }
    return counts;
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

  /** 选中项目：URL 参数优先（旧链接重定向也走这里），不在可见列表里就落第一个 */
  const selectedId = useMemo(() => {
    const param = searchParams.get('project');
    if (param && visibleProjects.some((project) => project.id === param)) return param;
    return visibleProjects[0]?.id ?? null;
  }, [searchParams, visibleProjects]);
  const selectedProject = projects.find((project) => project.id === selectedId) ?? null;

  const selectProject = (id: string): void => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('project', id);
      return next;
    });
  };

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

  /** 页头一行小字的全站汇总（原「开发概览」统计卡的浓缩版） */
  const summary = useMemo(() => {
    const active = projects.filter((project) => !project.archived);
    const allTasks = active.flatMap((project) => project.tasks);
    const doneTasks = allTasks.filter((task) => task.status === 'done').length;
    const totalHours = active.reduce((sum, project) => sum + project.hoursSpent, 0);
    return { active, tasks: allTasks.length, doneTasks, totalHours };
  }, [projects]);

  const projectSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.projectId === selectedId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [sessions, selectedId],
  );

  const selectedDone = selectedProject?.tasks.filter((task) => task.status === 'done').length ?? 0;
  const selectedPercent =
    selectedProject && selectedProject.tasks.length > 0
      ? Math.round((selectedDone / selectedProject.tasks.length) * 100)
      : 0;

  const sessionHours = typeof sessionForm.hours === 'number' ? sessionForm.hours : 0;
  const canSaveSession = Boolean(sessionForm.projectId) && sessionHours > 0;

  const openSessionModal = (projectId?: string): void => {
    const fallback = projects.length > 0 ? projects[0].id : '';
    setSessionForm({ projectId: projectId ?? fallback, date: today, hours: 1, note: '' });
    setShowSessionModal(true);
  };

  const handleAddProject = (): void => {
    if (!projectForm.name.trim()) return;
    const id = addProject(projectForm.name.trim(), projectForm.description.trim());
    setProjectForm({ name: '', description: '' });
    setShowAddProject(false);
    // 新建后直接选中它
    selectProject(id);
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

  /** 删流水会同时改 sessions 与项目上的累计工时，撤销时两边一起还原 */
  const restoreWorkLog = (snapshot: WorkLogSnapshot[]): void => {
    const entry = snapshot[0];
    if (!entry) return;
    replaceSessions(entry.sessions);
    replaceProjects(entry.projects);
  };

  const pendingSession = sessions.find((session) => session.id === pendingSessionId) ?? null;
  const deletingProject = projects.find((project) => project.id === pendingDeleteProjectId) ?? null;
  const projectNameOf = (id: string): string =>
    projects.find((project) => project.id === id)?.name ?? '已删除的项目';

  const emptyState =
    projects.length === 0 ? (
      <Card>
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
      </Card>
    ) : (
      <Card>
        <EmptyState
          icon={<FolderKanban size={22} aria-hidden />}
          title="没有符合条件的项目"
          description="换个关键词，或者切换左边的状态筛选。"
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
      </Card>
    );

  return (
    <div className="space-y-section">
      <PageHeader
        title="开发工作"
        description="左边选项目，右边看全部：里程碑、工作项、日志与投入都在一个详情里"
        icon={Code2}
        meta={
          projects.length > 0 ? (
            <>
              <span className="text-sm text-content-secondary tabular">
                {summary.active.length} 个项目
              </span>
              <Badge tone="accent">
                <Zap size={10} aria-hidden className="mr-1 inline" />
                {filterCounts['in-progress']} 进行中
              </Badge>
              <span className="text-sm text-content-secondary tabular">
                任务 {summary.doneTasks}/{summary.tasks}
              </span>
              <span className="text-sm text-content-secondary tabular">
                累计 {formatNumber(Math.round(summary.totalHours * 10) / 10)} 小时
              </span>
            </>
          ) : undefined
        }
        actions={
          <>
            {projects.length > 0 && (
              <Button
                variant="secondary"
                icon={<Clock size={16} aria-hidden />}
                onClick={() => openSessionModal(selectedId ?? undefined)}
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

      {projects.length === 0 ? (
        emptyState
      ) : (
        <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-5 lg:items-start">
          <ProjectRail
            projects={visibleProjects}
            selectedId={selectedId}
            onSelect={selectProject}
            keyword={keyword}
            onKeywordChange={setKeyword}
            filter={filter}
            onFilterChange={setFilter}
            filterCounts={filterCounts}
            stalledDaysOf={stalledDaysOf}
            onAddProject={() => {
              setProjectForm({ name: '', description: '' });
              setShowAddProject(true);
            }}
          />

          {selectedProject ? (
            <div className="stagger-enter space-y-4 min-w-0">
              <ProjectHero
                project={selectedProject}
                stalledDays={stalledDaysOf(selectedProject)}
                percent={selectedPercent}
                doneCount={selectedDone}
                onRequestDelete={(project) => setPendingDeleteProjectId(project.id)}
                onRecordSession={openSessionModal}
              />
              <MilestoneGrid project={selectedProject} />
              <WorkItemList project={selectedProject} />
              <DevLogList project={selectedProject} />
              <InvestmentCard
                project={selectedProject}
                projectSessions={projectSessions}
                onRequestDeleteSession={setPendingSessionId}
              />
            </div>
          ) : (
            emptyState
          )}
        </div>
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
            <Button type="submit" form="dev-project-add-form" disabled={!projectForm.name.trim()}>
              创建
            </Button>
          </>
        }
      >
        <SubmitForm id="dev-project-add-form" onSubmit={handleAddProject}>
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
        </SubmitForm>
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
            <Button type="submit" form="dev-session-form" disabled={!canSaveSession}>
              保存
            </Button>
          </>
        }
      >
        <SubmitForm id="dev-session-form" onSubmit={handleAddSession} className="space-y-4">
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
        </SubmitForm>
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

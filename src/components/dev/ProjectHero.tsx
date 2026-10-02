import React, { useState } from 'react';
import { Archive, ArchiveRestore, Clock, ExternalLink, Pencil, Trash2, Zap } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Input,
  ProgressBar,
  Select,
  SubmitForm,
  TagEditor,
  TagInput,
} from '../ui';
import type { DevProject, DevProjectStatus } from '../../types';
import { useDevStore } from '../../store/devStore';
import { useTagSuggestions } from '../../hooks/useTagSuggestions';
import { formatNumber } from '../../utils/date';
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_OPTIONS, PROJECT_STATUS_TONE } from './constants';

export interface ProjectHeroProps {
  project: DevProject;
  /** 停滞天数；null 表示没停滞 */
  stalledDays: number | null;
  /** 完成率（0-100），由页面按任务数现算 */
  percent: number;
  doneCount: number;
  onRequestDelete: (project: DevProject) => void;
  onRecordSession: (projectId: string) => void;
}

/**
 * 详情头：项目的一切「元信息」——名称、状态、描述、技术栈、标签、仓库、周期、进度。
 * 编辑不再走右栏表单或弹窗，就地展开成一张表单卡。
 */
export const ProjectHero: React.FC<ProjectHeroProps> = ({
  project,
  stalledDays,
  percent,
  doneCount,
  onRequestDelete,
  onRecordSession,
}) => {
  const { updateProject, updateProjectStatus } = useDevStore();
  const tagSuggestions = useTagSuggestions();
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    techStack: '',
    repoUrl: '',
    startDate: '',
    endDate: '',
    tags: [] as string[],
  });

  const openEdit = (): void => {
    setEditForm({
      name: project.name,
      description: project.description,
      techStack: project.techStack.join(', '),
      repoUrl: project.repoUrl,
      startDate: project.startDate ?? '',
      endDate: project.endDate ?? '',
      tags: project.tags,
    });
    setEditing(true);
  };

  const handleSaveEdit = (): void => {
    if (!editForm.name.trim()) return;
    updateProject(project.id, {
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
    setEditing(false);
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0 truncate text-lg font-[650] tracking-[-0.01em] text-content">
                {project.name}
              </h2>
              <Badge tone={project.archived ? 'default' : PROJECT_STATUS_TONE[project.status]} dot>
                {project.archived ? '已归档' : PROJECT_STATUS_LABEL[project.status]}
              </Badge>
              {stalledDays !== null && <Badge tone="warning">停滞 {stalledDays} 天</Badge>}
            </div>
            {project.description && (
              <p className="mt-1 text-sm text-content-secondary">{project.description}</p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Select
              aria-label={`调整「${project.name}」的状态`}
              className="w-32"
              value={project.status}
              onChange={(value) => updateProjectStatus(project.id, value as DevProjectStatus)}
              options={PROJECT_STATUS_OPTIONS}
            />
            <Button
              size="sm"
              variant="secondary"
              icon={<Clock size={14} aria-hidden />}
              onClick={() => onRecordSession(project.id)}
            >
              记录工时
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={
                project.archived ? (
                  <ArchiveRestore size={14} aria-hidden />
                ) : (
                  <Archive size={14} aria-hidden />
                )
              }
              onClick={() => updateProject(project.id, { archived: !project.archived })}
            >
              {project.archived ? '取消归档' : '归档'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<Pencil size={14} aria-hidden />}
              onClick={() => (editing ? setEditing(false) : openEdit())}
              aria-expanded={editing}
            >
              {editing ? '收起编辑' : '编辑'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={14} aria-hidden />}
              onClick={() => onRequestDelete(project)}
              className="text-danger hover:text-danger"
            >
              删除
            </Button>
          </div>
        </div>

        {(project.techStack.length > 0 || project.repoUrl) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
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

        <div className="mt-2">
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
            label={`任务完成 ${doneCount}/${project.tasks.length}`}
            tone={percent === 100 ? 'success' : 'accent'}
          />
          <span className="flex items-center gap-1 text-xs text-content-tertiary tabular">
            <Zap size={12} aria-hidden />
            累计 {formatNumber(project.hoursSpent)} 小时
          </span>
          {(project.startDate || project.endDate) && (
            <span className="text-xs text-content-tertiary tabular">
              {project.startDate ?? '—'} ~ {project.endDate ?? '至今'}
            </span>
          )}
        </div>
      </div>

      {editing && (
        <div className="border-t border-line-subtle bg-inset p-4 sm:p-5">
          <SubmitForm id="dev-project-edit-form" onSubmit={handleSaveEdit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="项目名称"
                value={editForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                required
              />
              <Input
                label="仓库地址"
                value={editForm.repoUrl}
                onChange={(event) => setEditForm({ ...editForm, repoUrl: event.target.value })}
                placeholder="https://github.com/…（可选）"
              />
            </div>
            <Input
              label="描述"
              value={editForm.description}
              onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
              placeholder="项目描述（可选）"
              multiline
              rows={2}
            />
            <Input
              label="技术栈"
              value={editForm.techStack}
              onChange={(event) => setEditForm({ ...editForm, techStack: event.target.value })}
              placeholder="用逗号分隔，如：React, TypeScript"
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
              <Button variant="secondary" onClick={() => setEditing(false)}>
                取消
              </Button>
              <Button type="submit" form="dev-project-edit-form" disabled={!editForm.name.trim()}>
                保存
              </Button>
            </div>
          </SubmitForm>
        </div>
      )}
    </Card>
  );
};

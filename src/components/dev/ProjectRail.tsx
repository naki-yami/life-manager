import React from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, Input, ProgressBar, Select } from '../ui';
import type { DevProject } from '../../types';
import { formatNumber } from '../../utils/date';
import {
  FILTER_OPTIONS,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  type ProjectFilter,
} from './constants';

export interface ProjectRailProps {
  /** 筛选 + 搜索之后的可见项目 */
  projects: DevProject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
  filter: ProjectFilter;
  onFilterChange: (filter: ProjectFilter) => void;
  /** 六个筛选口径各自的项目数（含被搜索词滤掉的），给下拉选项标数 */
  filterCounts: Record<ProjectFilter, number>;
  /** 停滞天数；null 表示没停滞（未完成且未归档才可能停滞） */
  stalledDaysOf: (project: DevProject) => number | null;
  onAddProject: () => void;
}

/** 状态点的颜色；进行中的点另外加呼吸动画（见下方 className 拼） */
function statusDotClass(status: DevProject['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-success';
    case 'paused':
      return 'bg-warning';
    case 'in-progress':
      return 'bg-accent';
    default:
      return 'bg-content-disabled';
  }
}

/**
 * 左侧项目栏（对照木子工作台的「文件式」项目切换器）：
 * 项目不再是卡片流里的一张卡，而是右栏详情的入口。
 * 宽屏常驻在左（sticky 跟随滚动），窄屏压成顶部的横向胶囊条。
 */
export const ProjectRail: React.FC<ProjectRailProps> = ({
  projects,
  selectedId,
  onSelect,
  keyword,
  onKeywordChange,
  filter,
  onFilterChange,
  filterCounts,
  stalledDaysOf,
  onAddProject,
}) => (
  <div className="flex flex-col gap-3 lg:sticky lg:top-0 lg:self-start">
    <Input
      value={keyword}
      onChange={(event) => onKeywordChange(event.target.value)}
      placeholder="搜索项目、任务、#标签…"
      aria-label="搜索项目、任务或标签"
    />
    <Select
      aria-label="按项目状态筛选"
      value={filter}
      onChange={(value) => onFilterChange(value as ProjectFilter)}
      options={FILTER_OPTIONS.map((option) => ({
        ...option,
        label: `${option.label}（${filterCounts[option.value]}）`,
      }))}
    />

    {/*
     * 项目清单：宽屏是竖排按钮列（sticky 跟随，内部自己滚），窄屏是横向胶囊条。
     * 滚动都发生在内层容器（overflow-x/y-auto），页面本身绝不横向溢出。
     */}
    <ul
      className="flex gap-2 overflow-x-auto pb-1 max-lg:-mx-1 max-lg:px-1 lg:max-h-[calc(100vh-260px)] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden"
      aria-label="项目列表"
    >
      {projects.map((project) => {
        const selected = project.id === selectedId;
        const done = project.tasks.filter((task) => task.status === 'done').length;
        const percent =
          project.tasks.length === 0 ? 0 : Math.round((done / project.tasks.length) * 100);
        const stalledDays = stalledDaysOf(project);
        return (
          <li key={project.id} className="w-44 shrink-0 lg:w-auto lg:shrink">
            <button
              type="button"
              onClick={() => onSelect(project.id)}
              aria-current={selected ? 'true' : undefined}
              className={`lift w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
                selected
                  ? 'border-accent bg-accent-soft'
                  : 'border-line-subtle bg-surface hover:border-line'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(project.status)} ${
                    project.status === 'in-progress'
                      ? 'animate-breathe motion-reduce:animate-none'
                      : ''
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                  {project.name}
                </span>
                {stalledDays !== null && (
                  <span
                    className="text-2xs font-semibold text-warning"
                    title={`已停滞 ${stalledDays} 天`}
                  >
                    停滞
                  </span>
                )}
              </div>
              <div className="mt-2">
                <ProgressBar
                  value={percent}
                  showValue
                  label={`「${project.name}」任务完成 ${done}/${project.tasks.length}`}
                  tone={percent === 100 ? 'success' : 'accent'}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <Badge tone={project.archived ? 'default' : PROJECT_STATUS_TONE[project.status]}>
                  {project.archived ? '已归档' : PROJECT_STATUS_LABEL[project.status]}
                </Badge>
                <span className="text-2xs text-content-tertiary tabular">
                  {formatNumber(project.hoursSpent)}h
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>

    <Button
      variant="secondary"
      icon={<Plus size={16} aria-hidden />}
      onClick={onAddProject}
      className="shrink-0"
    >
      新建项目
    </Button>
  </div>
);

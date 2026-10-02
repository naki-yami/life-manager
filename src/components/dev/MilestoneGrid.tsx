import React, { useState } from 'react';
import { Flag, Trash2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, IconButton, Input } from '../ui';
import type { DevProject } from '../../types';
import { useDevStore } from '../../store/devStore';
import { useUndoableRemove } from '../../hooks/useUndoableRemove';
import { todayKey } from '../../utils/date';

export interface MilestoneGridProps {
  project: DevProject;
}

/**
 * 里程碑：双列磁贴（对照木子工作台），带目标日期与逾期标记。
 * 删里程碑会把挂在上面的工作项解关联（store 里的 SET NULL 语义）。
 */
export const MilestoneGrid: React.FC<MilestoneGridProps> = ({ project }) => {
  const { projects, addMilestone, toggleMilestone, deleteMilestone, replaceProjects } =
    useDevStore();
  const undoableRemove = useUndoableRemove();
  const [form, setForm] = useState({ title: '', dueDate: '' });
  const today = todayKey();

  const handleAdd = (): void => {
    if (!form.title.trim()) return;
    addMilestone(project.id, form.title.trim(), form.dueDate || undefined);
    setForm({ title: '', dueDate: '' });
  };

  const doneCount = project.milestones.filter((milestone) => milestone.done).length;

  return (
    <Card>
      <CardHeader
        title="里程碑"
        subtitle={
          project.milestones.length > 0
            ? `已完成 ${doneCount}/${project.milestones.length} 个，用目标日期判断项目节奏`
            : '把关键节点列出来，做完一个勾一个'
        }
      />
      <CardBody className="space-y-3">
        {project.milestones.length > 0 && (
          <ul className="stagger-enter grid gap-2 sm:grid-cols-2">
            {project.milestones.map((milestone) => {
              const overdue =
                !milestone.done && milestone.dueDate !== undefined && milestone.dueDate < today;
              return (
                <li
                  key={milestone.id}
                  className="flex items-center gap-3 rounded-lg border border-line-subtle bg-inset px-3 py-2.5 transition-[border-color,transform] duration-fast ease-standard hover:-translate-y-px hover:border-line"
                >
                  <Flag
                    size={14}
                    aria-hidden
                    className={milestone.done ? 'text-success' : 'text-content-tertiary'}
                  />
                  <input
                    type="checkbox"
                    checked={milestone.done}
                    onChange={() => toggleMilestone(project.id, milestone.id)}
                    aria-label={`完成里程碑「${milestone.title}」`}
                    style={{ accentColor: 'var(--lm-accent)' }}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded-sm border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      milestone.done ? 'text-content-tertiary line-through' : 'text-content'
                    }`}
                  >
                    {milestone.title}
                  </span>
                  {milestone.dueDate && (
                    <span
                      className={`shrink-0 text-xs tabular ${
                        overdue ? 'font-medium text-danger' : 'text-content-tertiary'
                      }`}
                    >
                      {overdue ? '已逾期 ' : '目标 '}
                      {milestone.dueDate}
                    </span>
                  )}
                  <IconButton
                    label={`删除里程碑「${milestone.title}」`}
                    size="sm"
                    icon={<Trash2 size={13} />}
                    onClick={() => {
                      const snapshot = projects;
                      deleteMilestone(project.id, milestone.id);
                      undoableRemove({
                        message: `已删除里程碑「${milestone.title}」`,
                        description: '挂在上面的工作项保留，只是不再关联；点「撤销」可以恢复。',
                        snapshot,
                        restore: replaceProjects,
                      });
                    }}
                    className="hover:text-danger"
                  />
                </li>
              );
            })}
          </ul>
        )}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            handleAdd();
          }}
        >
          <div className="min-w-40 flex-1">
            <Input
              label="新里程碑"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="如：v1.0 对外发布"
            />
          </div>
          <div className="w-40">
            <Input
              label="目标日期"
              type="date"
              value={form.dueDate}
              onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            icon={<Flag size={14} aria-hidden />}
            disabled={!form.title.trim()}
          >
            添加
          </Button>
        </form>
      </CardBody>
    </Card>
  );
};

import React, { useState } from 'react';
import { NotebookPen, Trash2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, IconButton, Input } from '../ui';
import type { DevProject } from '../../types';
import { useDevStore } from '../../store/devStore';
import { useUndoableRemove } from '../../hooks/useUndoableRemove';
import { formatShortDate, todayKey } from '../../utils/date';

export interface DevLogListProps {
  project: DevProject;
}

/** 开发日志：按天记流水，新日志排最前 */
export const DevLogList: React.FC<DevLogListProps> = ({ project }) => {
  const { projects, addLog, deleteLog, replaceProjects } = useDevStore();
  const undoableRemove = useUndoableRemove();
  const [form, setForm] = useState<{ date: string; content: string }>({
    date: todayKey(),
    content: '',
  });
  const today = todayKey();

  const handleAdd = (): void => {
    if (!form.content.trim()) return;
    addLog(project.id, form.date || today, form.content.trim());
    setForm({ date: today, content: '' });
  };

  return (
    <Card>
      <CardHeader
        title="开发日志"
        subtitle={
          project.logs.length > 0
            ? `共 ${project.logs.length} 条`
            : '按天记流水：今天做了什么、卡在哪里'
        }
      />
      <CardBody className="space-y-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            handleAdd();
          }}
        >
          <div className="w-40">
            <Input
              label="日期"
              type="date"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
          </div>
          <div className="min-w-48 flex-1">
            <Input
              label="今天做了什么"
              value={form.content}
              onChange={(event) => setForm({ ...form, content: event.target.value })}
              placeholder="如：完成导入预览，卡在时区换算…"
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            icon={<NotebookPen size={14} aria-hidden />}
            disabled={!form.content.trim()}
          >
            记一笔
          </Button>
        </form>

        {project.logs.length === 0 ? (
          <p className="py-2 text-center text-xs text-content-tertiary">还没有日志</p>
        ) : (
          <ul className="divide-y divide-line-subtle rounded-lg border border-line-subtle">
            {project.logs.map((log) => (
              <li
                key={log.id}
                className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-start gap-3 px-3 py-2 transition-colors duration-fast ease-standard hover:bg-hover"
              >
                <span className="text-xs text-content-tertiary tabular">
                  {formatShortDate(log.date)}
                </span>
                <span className="min-w-0 text-sm text-content-secondary">{log.content}</span>
                <IconButton
                  label={`删除 ${formatShortDate(log.date)} 的日志`}
                  size="sm"
                  icon={<Trash2 size={13} />}
                  onClick={() => {
                    const snapshot = projects;
                    deleteLog(project.id, log.id);
                    undoableRemove({
                      message: '已删除这条开发日志',
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
      </CardBody>
    </Card>
  );
};

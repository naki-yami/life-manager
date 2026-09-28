import React, { useMemo, useState } from 'react';
import { CheckCircle2, FileText, Hash, PenLine, Plus, StickyNote, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  StatCard,
  Textarea,
} from '../components/ui';
import { PageHeader, Toolbar } from '../components/layout';
import { useWritingStore } from '../store/writingStore';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { filterByKeyword } from '../utils/search';
import { formatNumber } from '../utils/date';
import { WritingStatus, WritingType } from '../types';

type Filter = 'all' | WritingStatus;

const STATUS_LABEL: Record<WritingStatus, string> = {
  draft: '草稿',
  'in-progress': '进行中',
  completed: '已完成',
};

const STATUS_TONE: Record<WritingStatus, 'default' | 'accent' | 'success'> = {
  draft: 'default',
  'in-progress': 'accent',
  completed: 'success',
};

const TYPE_LABEL: Record<WritingType, string> = {
  article: '文章',
  copy: '文案',
  book: '书籍',
};

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as WritingStatus[]).map((value) => ({
  value,
  label: STATUS_LABEL[value],
}));

const TYPE_OPTIONS = (Object.keys(TYPE_LABEL) as WritingType[]).map((value) => ({
  value,
  label: TYPE_LABEL[value],
}));

const FILTER_OPTIONS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'in-progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
];

export const WritingPage: React.FC = () => {
  const {
    projects,
    addProject,
    deleteProject,
    updateStatus,
    updateWordCount,
    updateNotes,
    replaceProjects,
  } = useWritingStore();
  const undoableRemove = useUndoableRemove();

  const [showAddModal, setShowAddModal] = useState(false);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [form, setForm] = useState<{ title: string; type: WritingType }>({
    title: '',
    type: 'article',
  });

  const countOf = (status: WritingStatus): number =>
    projects.filter((project) => project.status === status).length;

  const totalWords = projects.reduce((sum, project) => sum + project.wordCount, 0);

  const visibleProjects = useMemo(() => {
    const byStatus =
      filter === 'all' ? projects : projects.filter((project) => project.status === filter);
    return filterByKeyword(byStatus, keyword, (project) => [
      project.title,
      project.notes,
      TYPE_LABEL[project.type],
    ]);
  }, [projects, filter, keyword]);

  const noteProject = projects.find((project) => project.id === noteId) ?? null;
  const deletingProject = projects.find((project) => project.id === pendingDeleteId) ?? null;

  const openAddModal = (): void => {
    setForm({ title: '', type: 'article' });
    setShowAddModal(true);
  };

  const handleAdd = (): void => {
    const title = form.title.trim();
    if (!title) return;
    addProject(title, form.type);
    setShowAddModal(false);
  };

  const openNotes = (id: string, notes: string): void => {
    setNoteInput(notes);
    setNoteId(id);
  };

  return (
    <div className="space-y-section">
      <PageHeader
        title="写作"
        description="长文、文案与书稿的进度和灵感都在这里"
        icon={PenLine}
        actions={
          <Button icon={<Plus size={16} aria-hidden />} onClick={openAddModal}>
            新建项目
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="项目总数"
          value={projects.length}
          unit="个"
          icon={<FileText size={16} aria-hidden />}
        />
        <StatCard
          label="进行中项目"
          value={countOf('in-progress')}
          unit="个"
          tone="accent"
          icon={<PenLine size={16} aria-hidden />}
        />
        <StatCard
          label="已完成项目"
          value={countOf('completed')}
          unit="个"
          tone="success"
          icon={<CheckCircle2 size={16} aria-hidden />}
        />
        <StatCard
          label="累计字数"
          value={formatNumber(totalWords)}
          unit="字"
          icon={<Hash size={16} aria-hidden />}
          footer={
            projects.length > 0
              ? `平均每篇 ${formatNumber(Math.round(totalWords / projects.length))} 字`
              : undefined
          }
        />
      </div>

      <Toolbar
        search={{ value: keyword, onChange: setKeyword, placeholder: '搜索标题、笔记或类型…' }}
        actions={
          <SegmentedControl
            label="按写作状态筛选"
            value={filter}
            onChange={setFilter}
            options={FILTER_OPTIONS.map((option) => ({
              ...option,
              count: option.value === 'all' ? projects.length : countOf(option.value),
            }))}
          />
        }
      />

      {visibleProjects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PenLine size={22} aria-hidden />}
            title={projects.length === 0 ? '还没有写作项目' : '没有符合条件的项目'}
            description={
              projects.length === 0
                ? '新建一个项目，把想写的东西先记下来，再慢慢推进。'
                : '换个关键词，或者切换上面的状态筛选。'
            }
            action={
              projects.length === 0 ? (
                <Button icon={<Plus size={16} aria-hidden />} onClick={openAddModal}>
                  新建项目
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
        <ul className="grid gap-4">
          {visibleProjects.map((project) => (
            <li key={project.id}>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-content">{project.title}</h3>
                      <Badge tone="info">{TYPE_LABEL[project.type]}</Badge>
                      <Badge tone={STATUS_TONE[project.status]}>
                        {STATUS_LABEL[project.status]}
                      </Badge>
                    </div>

                    <p
                      className={`mt-1.5 text-sm ${
                        project.notes.trim()
                          ? 'line-clamp-2 text-content-secondary'
                          : 'text-content-tertiary'
                      }`}
                    >
                      {project.notes.trim() || '还没有创作笔记'}
                    </p>

                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <div className="w-36">
                        <NumberInput
                          ariaLabel={`「${project.title}」的字数`}
                          value={project.wordCount}
                          onChange={(value) =>
                            updateWordCount(project.id, value === '' ? 0 : value)
                          }
                          min={0}
                          step={100}
                          suffix="字"
                        />
                      </div>
                      <div className="w-36">
                        <Select
                          aria-label={`调整「${project.title}」的状态`}
                          value={project.status}
                          onChange={(value) => updateStatus(project.id, value as WritingStatus)}
                          options={STATUS_OPTIONS}
                        />
                      </div>
                      <span className="text-2xs text-content-tertiary">
                        更新于 {new Date(project.updatedAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {project.status !== 'completed' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<CheckCircle2 size={13} aria-hidden />}
                          onClick={() => updateStatus(project.id, 'completed')}
                        >
                          标记完成
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<StickyNote size={13} aria-hidden />}
                        onClick={() => openNotes(project.id, project.notes)}
                      >
                        创作笔记
                      </Button>
                    </div>
                  </div>

                  <IconButton
                    label={`删除《${project.title}》`}
                    size="sm"
                    icon={<Trash2 size={15} />}
                    onClick={() => setPendingDeleteId(project.id)}
                    className="hover:text-danger"
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="新建写作项目"
        description="先取个名字，字数与状态之后随时可以改"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              取消
            </Button>
            <Button onClick={handleAdd} disabled={!form.title.trim()}>
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="标题"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="输入标题"
            required
          />
          <Select
            label="类型"
            value={form.type}
            onChange={(value) => setForm({ ...form, type: value as WritingType })}
            options={TYPE_OPTIONS}
          />
        </div>
      </Modal>

      <Modal
        isOpen={noteProject !== null}
        onClose={() => setNoteId(null)}
        title={noteProject ? `《${noteProject.title}》的创作笔记` : '创作笔记'}
        description="留空并保存即可清空笔记"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoteId(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (noteId) updateNotes(noteId, noteInput);
                setNoteId(null);
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <Textarea
          label="创作笔记"
          value={noteInput}
          onChange={(event) => setNoteInput(event.target.value)}
          rows={8}
          placeholder="记录你的创作想法、待补的段落、参考素材…"
        />
      </Modal>

      <ConfirmDialog
        isOpen={deletingProject !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => {
          const target = deletingProject;
          const snapshot = projects;
          if (pendingDeleteId) deleteProject(pendingDeleteId);
          setPendingDeleteId(null);
          if (target) {
            undoableRemove({
              message: `已删除《${target.title}》`,
              description: '连同创作笔记一起删除，点「撤销」可以恢复。',
              snapshot,
              restore: replaceProjects,
            });
          }
        }}
        title="删除写作项目"
        description={
          deletingProject
            ? `确定要删除《${deletingProject.title}》吗？项目里的创作笔记也会一起删除，且无法恢复。`
            : ''
        }
        confirmText="删除"
        tone="danger"
      />
    </div>
  );
};

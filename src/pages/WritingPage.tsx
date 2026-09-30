import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Hash,
  History,
  PenLine,
  Plus,
  StickyNote,
  Trash2,
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
  NumberInput,
  SegmentedControl,
  Select,
  StatCard,
  TagEditor,
  TagInput,
  Textarea,
} from '../components/ui';
import { ListEmptyState, MasterDetail, PageHeader, Toolbar } from '../components/layout';
import { useWritingStore } from '../store/writingStore';
import { useEntityList } from '../hooks/useEntityList';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { useTagSuggestions } from '../hooks/useTagSuggestions';
import { formatNumber } from '../utils/date';
import { WritingProject, WritingStatus, WritingType } from '../types';
import { useNewEntryShortcut } from '../hooks/useShortcuts';
import { usePaletteFocus } from '../hooks/usePaletteFocus';
import { ToastContext } from '../components/ui/toastContext';
import { downloadBlob, downloadTextFile } from '../utils/download';
import { buildDocxBlob, composeExportMarkdown } from '../utils/docx';
import { MarkdownEditor } from '../components/writing/MarkdownEditor';

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

/** 搜索时参与匹配的字段；模块级常量，引用稳定，useEntityList 的缓存才不会白费 */
const projectSearchFields = (project: WritingProject): string[] => [
  project.title,
  project.notes,
  TYPE_LABEL[project.type],
  ...project.tags,
];

const projectStatusOf = (project: WritingProject): WritingStatus => project.status;

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
    updateContent,
    setTargetWords,
    updateProject,
    replaceProjects,
  } = useWritingStore();
  const undoableRemove = useUndoableRemove();
  const tagSuggestions = useTagSuggestions();
  const toastContext = React.useContext(ToastContext);

  const [showAddModal, setShowAddModal] = useState(false);
  useNewEntryShortcut(() => setShowAddModal(true));

  const [noteId, setNoteId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [editorId, setEditorId] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [contentDraft, setContentDraft] = useState('');

  const [form, setForm] = useState<{ title: string; type: WritingType; tags: string[] }>({
    title: '',
    type: 'article',
    tags: [],
  });

  /** 关键词 + 状态筛选 + 计数 + 「是空列表还是没筛出来」，六个列表页共用同一份实现 */
  const {
    keyword,
    setKeyword,
    filter,
    setFilter,
    visible: visibleProjects,
    countOf,
    filteredOut,
    clearFilters,
  } = useEntityList<WritingProject, WritingStatus>({
    items: projects,
    searchFields: projectSearchFields,
    statusOf: projectStatusOf,
  });

  const totalWords = projects.reduce((sum, project) => sum + project.wordCount, 0);

  const noteProject = projects.find((project) => project.id === noteId) ?? null;
  const deletingProject = projects.find((project) => project.id === pendingDeleteId) ?? null;

  const openAddModal = (): void => {
    setForm({ title: '', type: 'article', tags: [] });
    setShowAddModal(true);
  };

  const handleAdd = (): void => {
    const title = form.title.trim();
    if (!title) return;
    addProject(title, form.type, form.tags);
    setShowAddModal(false);
  };

  const editorProject = projects.find((project) => project.id === editorId) ?? null;
  const draftWords = contentDraft.length;
  const draftParagraphs = contentDraft.split(/\n+/).filter((part) => part.trim()).length;
  const draftMinutes = Math.max(1, Math.round(draftWords / 400));

  const openEditor = (id: string): void => {
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    setContentDraft(project.content);
    setEditorId(id);
    setFocusMode(false);
  };

  /** 关掉正文编辑器时，专注模式也要跟着复位 */
  const closeEditor = (): void => {
    setEditorId(null);
    setFocusMode(false);
  };

  // 命令面板搜到本页的稿件时，直接打开编辑器
  usePaletteFocus('/writing', openEditor);

  const handleSaveContent = (): void => {
    if (!editorId) return;
    const project = projects.find((item) => item.id === editorId);
    if (!project) return;
    const before = project.wordCount;
    updateContent(editorId, contentDraft);
    if (
      project.targetWords > 0 &&
      before < project.targetWords &&
      contentDraft.length >= project.targetWords
    ) {
      toastContext?.toast({
        tone: 'success',
        title: `🎉 《${project.title}》达标了！`,
        description: `正文达到 ${contentDraft.length} 字，完成了 ${project.targetWords} 字的目标。`,
      });
    }
    closeEditor();
  };

  /** 同一篇稿子的导出正文：Markdown 与 Word 共用一份，免得两边内容漂移 */
  const exportSourceOf = (project: WritingProject): string =>
    composeExportMarkdown({
      title: project.title,
      meta: `类型：${TYPE_LABEL[project.type]} · 状态：${STATUS_LABEL[project.status]} · 字数：${project.wordCount}`,
      content: project.content,
      notes: project.notes,
    });

  const handleExport = (id: string): void => {
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    downloadTextFile(`${project.title}.md`, exportSourceOf(project));
  };

  const handleExportDocx = (id: string): void => {
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    downloadBlob(`${project.title}.docx`, buildDocxBlob(exportSourceOf(project)));
  };

  const openNotes = (id: string, notes: string): void => {
    setNoteInput(notes);
    setNoteId(id);
  };

  const closeNotes = (): void => {
    setNoteId(null);
  };

  const handleSaveNotes = (): void => {
    if (noteId) updateNotes(noteId, noteInput);
    closeNotes();
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

      <MasterDetail
        detailTitle={noteProject ? `《${noteProject.title}》的创作笔记` : '创作笔记'}
        detailOpen={noteProject !== null}
        onCloseDetail={closeNotes}
        drawerWidth="lg"
        emptyDetail={
          <EmptyState
            icon={<StickyNote size={20} aria-hidden />}
            title="还没有选中项目"
            description="点左边任意一个项目的「创作笔记」，就能在这里记想法。"
            className="py-6"
          />
        }
        detail={
          noteProject ? (
            <div className="space-y-4">
              <p className="text-xs text-content-tertiary">留空并保存即可清空笔记</p>
              <Textarea
                label="创作笔记"
                value={noteInput}
                onChange={(event) => setNoteInput(event.target.value)}
                rows={8}
                placeholder="记录你的创作想法、待补的段落、参考素材…"
              />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="secondary" onClick={closeNotes}>
                  取消
                </Button>
                <Button onClick={handleSaveNotes}>保存</Button>
              </div>
            </div>
          ) : null
        }
      >
        <Toolbar
          search={{
            value: keyword,
            onChange: setKeyword,
            placeholder: '搜索标题、笔记、类型或标签…',
          }}
          actions={
            <SegmentedControl
              label="按写作状态筛选"
              value={filter}
              onChange={setFilter}
              options={FILTER_OPTIONS.map((option) => ({
                ...option,
                count: countOf(option.value),
              }))}
            />
          }
        />

        {visibleProjects.length === 0 ? (
          <ListEmptyState
            icon={<PenLine size={22} aria-hidden />}
            filtered={filteredOut}
            emptyTitle="还没有写作项目"
            emptyDescription="新建一个项目，把想写的东西先记下来，再慢慢推进。"
            emptyAction={
              <Button icon={<Plus size={16} aria-hidden />} onClick={openAddModal}>
                新建项目
              </Button>
            }
            filteredTitle="没有符合条件的项目"
            filteredDescription="换个关键词，或者切换上面的状态筛选。"
            onClearFilters={clearFilters}
          />
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

                      {project.content.trim() ? (
                        <p className="mt-1.5 line-clamp-2 text-sm text-content-tertiary">
                          {project.content.trim().split('\n')[0]}
                        </p>
                      ) : null}
                      <div className="mt-2">
                        <TagEditor
                          tags={project.tags}
                          suggestions={tagSuggestions}
                          onChange={(tags) => updateProject(project.id, { tags })}
                        />
                      </div>

                      {project.targetWords > 0 && (
                        <div className="mt-2 max-w-md">
                          <ProgressBar
                            value={project.wordCount}
                            max={project.targetWords}
                            showValue
                            label={`目标 ${formatNumber(project.targetWords)} 字`}
                            tone={project.wordCount >= project.targetWords ? 'success' : 'accent'}
                          />
                        </div>
                      )}

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
                          <NumberInput
                            ariaLabel={`「${project.title}」的目标字数`}
                            value={project.targetWords}
                            onChange={(value) =>
                              setTargetWords(project.id, value === '' ? 0 : value)
                            }
                            min={0}
                            step={1000}
                            suffix="目标"
                            hint="0 表示未设置"
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
                          variant="secondary"
                          icon={<PenLine size={13} aria-hidden />}
                          onClick={() => openEditor(project.id)}
                        >
                          编辑正文
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<StickyNote size={13} aria-hidden />}
                          onClick={() => openNotes(project.id, project.notes)}
                        >
                          创作笔记
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Download size={13} aria-hidden />}
                          aria-label={`导出《${project.title}》为 Markdown`}
                          onClick={() => handleExport(project.id)}
                        >
                          导出
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<FileText size={13} aria-hidden />}
                          aria-label={`导出《${project.title}》为 Word`}
                          onClick={() => handleExportDocx(project.id)}
                        >
                          导出 Word
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
      </MasterDetail>

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
          <TagInput
            label="标签"
            hint="回车或逗号分隔；标签跨模块通用，可在命令面板里输入 #标签 直接找"
            value={form.tags}
            suggestions={tagSuggestions}
            onChange={(tags) => setForm({ ...form, tags })}
          />
        </div>
      </Modal>

      <Modal
        isOpen={editorProject !== null}
        onClose={closeEditor}
        title={editorProject ? `《${editorProject.title}》编辑正文` : '编辑正文'}
        size={focusMode ? 'full' : 'lg'}
        footer={
          <>
            <Button variant="secondary" onClick={closeEditor}>
              取消
            </Button>
            <Button onClick={handleSaveContent}>保存</Button>
          </>
        }
      >
        <div className="space-y-4">
          <MarkdownEditor
            label="正文"
            value={contentDraft}
            onChange={setContentDraft}
            rows={focusMode ? 22 : 14}
            placeholder="从这里开始写……"
            focus={focusMode}
            onToggleFocus={() => setFocusMode((on) => !on)}
          />
          <div className="flex flex-wrap gap-2 text-xs text-content-tertiary">
            <Badge tone="info">字数 {formatNumber(draftWords)}</Badge>
            <Badge>段落 {draftParagraphs}</Badge>
            <Badge>约读 {draftMinutes} 分钟</Badge>
            {editorProject && editorProject.targetWords > 0 && (
              <Badge tone={draftWords >= editorProject.targetWords ? 'success' : 'default'}>
                目标 {formatNumber(editorProject.targetWords)} 字
              </Badge>
            )}
          </div>

          {editorProject && editorProject.snapshots.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-sm font-medium text-content-secondary">
                <History size={14} aria-hidden />
                版本快照（最近 {editorProject.snapshots.length} 版）
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded border border-line-subtle">
                {editorProject.snapshots.map((snapshot) => (
                  <li key={snapshot.id} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                    <span className="text-content-tertiary tabular">
                      {new Date(snapshot.createdAt).toLocaleString('zh-CN')}
                    </span>
                    <span className="text-content-secondary tabular">
                      {formatNumber(snapshot.wordCount)} 字
                    </span>
                    <span className="min-w-0 flex-1 truncate text-content-tertiary">
                      {snapshot.content.trim().slice(0, 30) || '（空）'}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setContentDraft(snapshot.content)}
                    >
                      回滚到此版
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-2xs text-content-tertiary">
                回滚会把那一版载入编辑器，点「保存」才会写回。
              </p>
            </div>
          )}
        </div>
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

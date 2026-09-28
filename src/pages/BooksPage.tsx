import React, { useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, NotebookPen, Play, Plus, StickyNote, Trash2 } from 'lucide-react';
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
  Slider,
} from '../components/ui';
import { PageHeader, Toolbar } from '../components/layout';
import { useBookStore } from '../store/bookStore';
import { filterByKeyword } from '../utils/search';
import { Book, BookStatus } from '../types';

type Filter = 'all' | BookStatus;

const STATUS_LABEL: Record<BookStatus, string> = {
  'want-to-read': '想读',
  reading: '在读',
  finished: '已读',
};

const STATUS_TONE: Record<BookStatus, 'default' | 'accent' | 'success'> = {
  'want-to-read': 'default',
  reading: 'accent',
  finished: 'success',
};

const FILTER_OPTIONS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'want-to-read', label: '想读' },
  { value: 'reading', label: '在读' },
  { value: 'finished', label: '已读' },
];

export const BooksPage: React.FC = () => {
  const { books, addBook, deleteBook, updateBookStatus, updateProgress, addNote, deleteNote } =
    useBookStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [noteBookId, setNoteBookId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [form, setForm] = useState({ title: '', author: '', category: '' });

  const countOf = (status: BookStatus): number =>
    books.filter((book) => book.status === status).length;

  const visibleBooks = useMemo(() => {
    const byStatus = filter === 'all' ? books : books.filter((book) => book.status === filter);
    return filterByKeyword(byStatus, keyword, (book) => [book.title, book.author, book.category]);
  }, [books, filter, keyword]);

  const noteBook = books.find((book) => book.id === noteBookId) ?? null;
  const deletingBook = books.find((book) => book.id === pendingDeleteId) ?? null;

  const handleAdd = (): void => {
    if (!form.title.trim()) return;
    addBook(form.title.trim(), form.author.trim(), form.category.trim());
    setForm({ title: '', author: '', category: '' });
    setShowAddModal(false);
  };

  const handleAddNote = (): void => {
    if (!noteBookId) return;
    const content = noteInput.trim();
    if (!content) {
      setNoteError('笔记内容不能为空');
      return;
    }
    addNote(noteBookId, content);
    setNoteInput('');
    setNoteError(undefined);
  };

  const closeNotes = (): void => {
    setNoteBookId(null);
    setNoteInput('');
    setNoteError(undefined);
  };

  const progressTone = (book: Book) => (book.progress >= 100 ? 'success' : 'accent');

  return (
    <div className="space-y-section">
      <PageHeader
        title="读书"
        description="书单、进度与读书笔记都在这里"
        icon={BookOpen}
        actions={
          <Button
            icon={<Plus size={16} aria-hidden />}
            onClick={() => {
              setForm({ title: '', author: '', category: '' });
              setShowAddModal(true);
            }}
          >
            添加书籍
          </Button>
        }
      />

      <Toolbar
        search={{ value: keyword, onChange: setKeyword, placeholder: '搜索书名、作者或分类…' }}
        actions={
          <SegmentedControl
            label="按阅读状态筛选"
            value={filter}
            onChange={setFilter}
            options={FILTER_OPTIONS.map((option) => ({
              ...option,
              count: option.value === 'all' ? books.length : countOf(option.value),
            }))}
          />
        }
      />

      {visibleBooks.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen size={22} aria-hidden />}
            title={books.length === 0 ? '书单还是空的' : '没有符合条件的书'}
            description={
              books.length === 0
                ? '把想读的书加进来，之后可以记录进度和笔记。'
                : '换个关键词，或者切换上面的状态筛选。'
            }
            action={
              books.length === 0 ? (
                <Button icon={<Plus size={16} aria-hidden />} onClick={() => setShowAddModal(true)}>
                  添加书籍
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
          {visibleBooks.map((book) => (
            <li key={book.id}>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-content">{book.title}</h3>
                      <Badge tone={STATUS_TONE[book.status]}>{STATUS_LABEL[book.status]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-content-tertiary">
                      {[book.author, book.category].filter(Boolean).join(' · ') ||
                        '未填写作者与分类'}
                    </p>

                    {book.status === 'reading' && (
                      <div className="mt-3 space-y-2">
                        <ProgressBar
                          value={book.progress}
                          showValue
                          label="阅读进度"
                          tone={progressTone(book)}
                        />
                        <Slider
                          ariaLabel={`调整「${book.title}」的阅读进度`}
                          value={book.progress}
                          onChange={(value) => updateProgress(book.id, value)}
                          showValue
                          formatValue={(value) => `${value}%`}
                        />
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {book.status !== 'reading' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Play size={13} aria-hidden />}
                          onClick={() => updateBookStatus(book.id, 'reading')}
                        >
                          开始阅读
                        </Button>
                      )}
                      {book.status !== 'finished' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<CheckCircle2 size={13} aria-hidden />}
                          onClick={() => {
                            updateBookStatus(book.id, 'finished');
                            updateProgress(book.id, 100);
                          }}
                        >
                          标记已读
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<StickyNote size={13} aria-hidden />}
                        onClick={() => {
                          setNoteInput('');
                          setNoteError(undefined);
                          setNoteBookId(book.id);
                        }}
                      >
                        笔记（{book.notes.length}）
                      </Button>
                    </div>
                  </div>

                  <IconButton
                    label={`删除《${book.title}》`}
                    size="sm"
                    icon={<Trash2 size={15} />}
                    onClick={() => setPendingDeleteId(book.id)}
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
        title="添加书籍"
        description="填上书名即可，作者与分类可以之后再补"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              取消
            </Button>
            <Button onClick={handleAdd} disabled={!form.title.trim()}>
              添加
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="书名"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="输入书名"
            required
          />
          <Input
            label="作者"
            value={form.author}
            onChange={(event) => setForm({ ...form, author: event.target.value })}
            placeholder="输入作者"
          />
          <Input
            label="分类"
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value })}
            placeholder="如：技术、文学、历史"
          />
        </div>
      </Modal>

      <Modal
        isOpen={noteBook !== null}
        onClose={closeNotes}
        title={noteBook ? `《${noteBook.title}》的笔记` : '读书笔记'}
        description="回车即可保存，笔记会按时间倒序排列"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Input
                aria-label="笔记内容"
                value={noteInput}
                onChange={(event) => {
                  setNoteInput(event.target.value);
                  if (noteError) setNoteError(undefined);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddNote();
                  }
                }}
                placeholder="写下这一段的收获…"
                error={noteError}
              />
            </div>
            <IconButton
              label="保存笔记"
              variant="primary"
              icon={<Plus size={16} />}
              onClick={handleAddNote}
            />
          </div>

          {noteBook && noteBook.notes.length === 0 ? (
            <EmptyState
              icon={<NotebookPen size={20} aria-hidden />}
              title="还没有笔记"
              description="读到有感触的地方，随手记一句。"
              className="py-6"
            />
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {noteBook?.notes.map((note) => (
                <li key={note.id} className="group rounded bg-inset p-3">
                  <p className="text-sm text-content-secondary">{note.content}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-2xs text-content-tertiary">
                      {new Date(note.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                    <IconButton
                      label="删除这条笔记"
                      size="sm"
                      icon={<Trash2 size={13} />}
                      onClick={() => noteBook && deleteNote(noteBook.id, note.id)}
                      className="hover:text-danger"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deletingBook !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteId) deleteBook(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        title="删除书籍"
        description={
          deletingBook
            ? `确定要删除《${deletingBook.title}》吗？这本书的 ${deletingBook.notes.length} 条笔记也会一起删除。`
            : ''
        }
        confirmText="删除"
        tone="danger"
      />
    </div>
  );
};

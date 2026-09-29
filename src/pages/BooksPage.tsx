import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Hourglass,
  NotebookPen,
  Play,
  Plus,
  StickyNote,
  Trash2,
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
  ProgressRing,
  SegmentedControl,
  Select,
  Slider,
  TagEditor,
  TagInput,
} from '../components/ui';
import { PageHeader, Toolbar } from '../components/layout';
import { useBookStore } from '../store/bookStore';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { BarChart } from '../components/charts';
import { filterByKeyword } from '../utils/search';
import { percentOf, seriesByWeek } from '../utils/stats';
import { daysBetween, formatDuration, formatNumber, formatShortDate, todayKey } from '../utils/date';
import { Book, BookStatus, ReadingSession } from '../types';
import { useNewEntryShortcut } from '../hooks/useShortcuts';
import { usePaletteFocus } from '../hooks/usePaletteFocus';
import { useTagSuggestions } from '../hooks/useTagSuggestions';

/** 年度阅读目标：一年读完 12 本，进度环按它算 */
const YEARLY_GOAL = 12;

/** 「近期阅读」最多列几条流水 */
const SESSION_PREVIEW_COUNT = 6;

/** 投入图表画最近几周 */
const WEEK_COUNT = 8;

/** 开读超过这么多天还没读完就提醒 */
const STALLED_AFTER_DAYS = 30;

/** 删除阅读流水只影响 sessions 数组，撤销整表还原 */
type ReadingLogSnapshot = ReadingSession[];

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
  const {
    books,
    addBook,
    deleteBook,
    updateBookStatus,
    updateProgress,
    updateBook,
    addNote,
    deleteNote,
    replaceBooks,
    sessions,
    addReadingSession,
    deleteReadingSession,
    replaceSessions,
  } = useBookStore();
  const undoableRemove = useUndoableRemove();
  const tagSuggestions = useTagSuggestions();

  const [showAddModal, setShowAddModal] = useState(false);
  useNewEntryShortcut(() => setShowAddModal(true));

  const [noteBookId, setNoteBookId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [form, setForm] = useState({ title: '', author: '', category: '', tags: [] as string[] });
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState<{
    bookId: string;
    date: string;
    minutes: number | '';
    note: string;
  }>({ bookId: '', date: todayKey(), minutes: 30, note: '' });
  const [notePage, setNotePage] = useState<number | ''>('');

  const countOf = (status: BookStatus): number =>
    books.filter((book) => book.status === status).length;

  const today = todayKey();
  const totalMinutes = sessions.reduce((sum, session) => sum + session.minutes, 0);

  const weeklyMinutes = useMemo(
    () =>
      seriesByWeek(sessions, WEEK_COUNT, today, (session) => session.date, (session) => session.minutes),
    [sessions, today],
  );

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, SESSION_PREVIEW_COUNT),
    [sessions],
  );

  /** 流水里只存 bookId，展示时换成书名 */
  const bookNameOf = (id: string): string =>
    books.find((book) => book.id === id)?.title ?? '已删除的书';

  const pendingSession = sessions.find((session) => session.id === pendingSessionId) ?? null;

  /** 按开读以来的平均速度估算还需几天读完；估不出来返回 null */
  const estimateDaysLeft = (book: Book): number | null => {
    if (book.status !== 'reading' || !book.startedAt) return null;
    if (book.progress <= 0 || book.progress >= 100) return null;
    const startDay = book.startedAt.slice(0, 10);
    const days = Math.max(1, daysBetween(startDay, today) ?? 1);
    const ratePerDay = book.progress / days;
    return Math.min(999, Math.ceil((100 - book.progress) / ratePerDay));
  };

  /** 开读超过阈值还没读完的提醒 */
  const stalledDaysOf = (book: Book): number | null => {
    if (book.status !== 'reading' || !book.startedAt) return null;
    const days = daysBetween(book.startedAt.slice(0, 10), today);
    return days !== null && days >= STALLED_AFTER_DAYS ? days : null;
  };

  const openSessionModal = (bookId?: string): void => {
    const fallback = books.length > 0 ? books[0].id : '';
    setSessionForm({ bookId: bookId ?? fallback, date: today, minutes: 30, note: '' });
    setShowSessionModal(true);
  };

  /** 打开某本书的笔记面板；命令面板搜到这本书时也走这里 */
  const openNotes = (bookId: string): void => {
    if (!books.some((book) => book.id === bookId)) return;
    setNoteInput('');
    setNoteError(undefined);
    setNotePage('');
    setNoteBookId(bookId);
  };

  usePaletteFocus('/books', openNotes);

  const sessionMinutes = typeof sessionForm.minutes === 'number' ? sessionForm.minutes : 0;
  const canSaveSession = Boolean(sessionForm.bookId) && sessionMinutes > 0;

  const handleAddSession = (): void => {
    if (!canSaveSession) return;
    addReadingSession(sessionForm.bookId, sessionForm.date || today, sessionMinutes, sessionForm.note.trim());
    setShowSessionModal(false);
  };

  /** 当前页码 ↔ 进度百分比换算 */
  const pageOf = (book: Book): number | '' => {
    const total = book.totalPages;
    if (!total || total <= 0) return '';
    return Math.min(total, Math.round((book.progress / 100) * total));
  };

  const handlePageChange = (book: Book, page: number): void => {
    if (!book.totalPages || book.totalPages <= 0) return;
    const clamped = Math.max(0, Math.min(book.totalPages, page));
    updateProgress(book.id, Math.round((clamped / book.totalPages) * 1000) / 10);
  };

  const visibleBooks = useMemo(() => {
    const byStatus = filter === 'all' ? books : books.filter((book) => book.status === filter);
    return filterByKeyword(byStatus, keyword, (book) => [
      book.title,
      book.author,
      book.category,
      ...book.tags,
    ]);
  }, [books, filter, keyword]);

  const currentYear = new Date().getFullYear();
  const finishedThisYear = books.filter(
    (book) => book.finishedAt?.slice(0, 4) === String(currentYear),
  ).length;
  const yearlyPercent = percentOf(finishedThisYear, YEARLY_GOAL);
  const noteTotal = books.reduce((sum, book) => sum + book.notes.length, 0);

  const noteBook = books.find((book) => book.id === noteBookId) ?? null;
  const deletingBook = books.find((book) => book.id === pendingDeleteId) ?? null;

  const handleAdd = (): void => {
    if (!form.title.trim()) return;
    addBook(form.title.trim(), form.author.trim(), form.category.trim(), form.tags);
    setForm({ title: '', author: '', category: '', tags: [] });
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
    setNotePage('');
  };

  const progressTone = (book: Book) => (book.progress >= 100 ? 'success' : 'accent');

  return (
    <div className="space-y-section">
      <PageHeader
        title="读书"
        description="书单、进度与读书笔记都在这里"
        icon={BookOpen}
        actions={
          <>
            {books.length > 0 && (
              <Button
                variant="secondary"
                icon={<Clock size={16} aria-hidden />}
                onClick={() => openSessionModal()}
              >
                记阅读
              </Button>
            )}
            <Button
              icon={<Plus size={16} aria-hidden />}
              onClick={() => {
                setForm({ title: '', author: '', category: '', tags: [] });
                setShowAddModal(true);
              }}
            >
              添加书籍
            </Button>
          </>
        }
      />

      {books.length > 0 && (
        <Card>
          <CardBody className="flex flex-wrap items-center gap-6">
            <ProgressRing
              value={yearlyPercent}
              size={88}
              tone={yearlyPercent >= 100 ? 'success' : 'accent'}
              label="年度阅读目标完成度"
            >
              {finishedThisYear}/{YEARLY_GOAL}
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-content">年度阅读目标</p>
              <p className="mt-0.5 text-xs text-content-tertiary">
                {currentYear} 年已读完 {finishedThisYear} 本，目标 {YEARLY_GOAL} 本
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="accent">在读 {countOf('reading')} 本</Badge>
                <Badge tone="success">已读 {countOf('finished')} 本</Badge>
                <Badge>想读 {countOf('want-to-read')} 本</Badge>
                <Badge>笔记 {noteTotal} 条</Badge>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {sessions.length > 0 && (
        <Card>
          <CardHeader
            title="近期阅读"
            subtitle={`累计 ${formatDuration(totalMinutes / 60)} · ${sessions.length} 条记录`}
          />
          <CardBody className="space-y-4">
            <BarChart
              data={weeklyMinutes}
              label="近 8 周每周阅读分钟"
              formatValue={(value) => `${formatNumber(value)} 分钟`}
              formatDate={formatShortDate}
            />

            <ul className="divide-y divide-line-subtle rounded border border-line-subtle">
              {recentSessions.map((session) => (
                <li key={session.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="truncate text-sm text-content">
                        {bookNameOf(session.bookId)}
                      </span>
                      <span className="text-xs text-content-tertiary tabular">
                        {formatShortDate(session.date)} · {formatNumber(session.minutes)} 分钟
                      </span>
                    </div>
                    {session.note && (
                      <p className="mt-0.5 truncate text-xs text-content-tertiary">{session.note}</p>
                    )}
                  </div>
                  <IconButton
                    label={`删除 ${formatShortDate(session.date)} 的《${bookNameOf(session.bookId)}》阅读记录`}
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

      <Toolbar
        search={{
          value: keyword,
          onChange: setKeyword,
          placeholder: '搜索书名、作者、分类或标签…',
        }}
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
                      {(() => {
                        const stalled = stalledDaysOf(book);
                        return stalled !== null ? (
                          <Badge tone="warning">开读 {stalled} 天未完</Badge>
                        ) : null;
                      })()}
                    </div>
                    <p className="mt-1 text-sm text-content-tertiary">
                      {[book.author, book.category].filter(Boolean).join(' · ') ||
                        '未填写作者与分类'}
                    </p>

                    <div className="mt-2">
                      <TagEditor
                        tags={book.tags}
                        suggestions={tagSuggestions}
                        onChange={(tags) => updateBook(book.id, { tags })}
                      />
                    </div>

                    {(() => {
                      const daysLeft = estimateDaysLeft(book);
                      return daysLeft !== null ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-content-tertiary">
                          <Hourglass size={11} aria-hidden />
                          按当前速度约还需 {daysLeft} 天读完
                        </p>
                      ) : null;
                    })()}

                    {book.status === 'reading' && (
                      <div className="mt-3 space-y-2">
                        <ProgressBar
                          value={book.progress}
                          showValue
                          label="阅读进度"
                          tone={progressTone(book)}
                        />
                        {book.totalPages ? (
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="w-32">
                              <NumberInput
                                label="总页数"
                                value={book.totalPages}
                                onChange={(value) =>
                                  updateBook(book.id, {
                                    totalPages: typeof value === 'number' && value > 0 ? value : undefined,
                                  })
                                }
                                min={1}
                                step={10}
                                suffix="页"
                              />
                            </div>
                            <div className="w-32">
                              <NumberInput
                                label="当前页码"
                                value={pageOf(book)}
                                onChange={(value) =>
                                  handlePageChange(book, value === '' ? 0 : value)
                                }
                                min={0}
                                step={10}
                                suffix="页"
                              />
                            </div>
                          </div>
                        ) : (
                          <>
                            <Slider
                              ariaLabel={`调整「${book.title}」的阅读进度`}
                              value={book.progress}
                              onChange={(value) => updateProgress(book.id, value)}
                              showValue
                              formatValue={(value) => `${value}%`}
                            />
                            <div className="w-32">
                              <NumberInput
                                label="总页数"
                                value={book.totalPages ?? 0}
                                onChange={(value) =>
                                  updateBook(book.id, {
                                    totalPages: typeof value === 'number' && value > 0 ? value : undefined,
                                  })
                                }
                                min={0}
                                step={10}
                                suffix="页"
                                hint="填上总页数后可以用页码记录进度"
                              />
                            </div>
                          </>
                        )}
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
                        icon={<Clock size={13} aria-hidden />}
                        aria-label={`记录《${book.title}》的阅读`}
                        onClick={() => openSessionModal(book.id)}
                      >
                        记阅读
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<StickyNote size={13} aria-hidden />}
                        onClick={() => openNotes(book.id)}
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
        isOpen={noteBook !== null}
        onClose={closeNotes}
        title={noteBook ? `《${noteBook.title}》的笔记` : '读书笔记'}
        description="回车即可保存，笔记会按时间倒序排列"
      >
        <div className="space-y-4">
          <div className="w-40">
            <NumberInput
              label="页码"
              value={notePage}
              onChange={(value) => setNotePage(value)}
              min={0}
              step={1}
              suffix="页"
              hint="可选"
            />
          </div>

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
                      {note.page ? ` · 第 ${note.page} 页` : ''}
                    </span>
                    <IconButton
                      label="删除这条笔记"
                      size="sm"
                      icon={<Trash2 size={13} />}
                      onClick={() => {
                        if (!noteBook) return;
                        const snapshot = books;
                        deleteNote(noteBook.id, note.id);
                        undoableRemove({
                          message: '已删除这条笔记',
                          description: '点「撤销」可以恢复。',
                          snapshot,
                          restore: replaceBooks,
                        });
                      }}
                      className="hover:text-danger"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showSessionModal}
        onClose={() => setShowSessionModal(false)}
        title="记录阅读"
        description="记一次会写进阅读流水，用于统计每周阅读时长"
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
            label="书籍"
            value={sessionForm.bookId}
            onChange={(value) => setSessionForm({ ...sessionForm, bookId: value })}
            options={books.map((book) => ({ value: book.id, label: book.title }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="日期"
              type="date"
              value={sessionForm.date}
              onChange={(event) => setSessionForm({ ...sessionForm, date: event.target.value })}
            />
            <NumberInput
              label="时长"
              value={sessionForm.minutes}
              onChange={(value) => setSessionForm({ ...sessionForm, minutes: value })}
              min={0}
              step={10}
              suffix="分钟"
            />
          </div>
          <Input
            label="备注"
            value={sessionForm.note}
            onChange={(event) => setSessionForm({ ...sessionForm, note: event.target.value })}
            placeholder="读到哪一章…（可选）"
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={pendingSession !== null}
        onClose={() => setPendingSessionId(null)}
        onConfirm={() => {
          const target = pendingSession;
          const snapshot: ReadingLogSnapshot = sessions;
          if (pendingSessionId) deleteReadingSession(pendingSessionId);
          setPendingSessionId(null);
          if (target) {
            undoableRemove({
              message: `已删除 ${formatShortDate(target.date)} 的阅读记录`,
              description: `${bookNameOf(target.bookId)} 的 ${formatNumber(target.minutes)} 分钟已删除，点「撤销」可以恢复。`,
              snapshot,
              restore: replaceSessions,
            });
          }
        }}
        title="删除阅读记录"
        description={
          pendingSession
            ? `确定要删除 ${formatShortDate(pendingSession.date)} 读《${bookNameOf(pendingSession.bookId)}》的 ${formatNumber(pendingSession.minutes)} 分钟记录吗？`
            : ''
        }
        confirmText="删除"
        tone="danger"
      />

      <ConfirmDialog
        isOpen={deletingBook !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => {
          const target = deletingBook;
          const snapshot = books;
          if (pendingDeleteId) deleteBook(pendingDeleteId);
          setPendingDeleteId(null);
          if (target) {
            undoableRemove({
              message: `已删除《${target.title}》`,
              description: `连同 ${target.notes.length} 条笔记一起删除，点「撤销」可以恢复。`,
              snapshot,
              restore: replaceBooks,
            });
          }
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

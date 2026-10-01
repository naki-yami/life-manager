import React, { useMemo, useState } from 'react';
import { Clock, Gamepad2, ListChecks, Plus, Star, StickyNote, Trash2, Trophy } from 'lucide-react';
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
  SegmentedControl,
  Select,
  SelectionBar,
  Slider,
  StatCard,
  SubmitForm,
  TagEditor,
  TagInput,
  Textarea,
} from '../components/ui';
import { ListEmptyState, MasterDetail, PageHeader, Toolbar } from '../components/layout';
import { BarChart } from '../components/charts';
import { useGameStore } from '../store/gameStore';
import { useEntityList } from '../hooks/useEntityList';
import { useMultiSelect } from '../hooks/useMultiSelect';
import { ROW_FOCUS_PROP, rowProps, useRovingList } from '../hooks/useRovingList';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { normalizeTags } from '../utils/tags';
import {
  formatDuration,
  formatMonthLabel,
  formatNumber,
  formatShortDate,
  todayKey,
} from '../utils/date';
import { seriesByMonth } from '../utils/stats';
import { Game, GamePlatform, GameSession, GameStatus } from '../types';
import { useNewEntryShortcut } from '../hooks/useShortcuts';
import { usePaletteFocus } from '../hooks/usePaletteFocus';
import { useTagSuggestions } from '../hooks/useTagSuggestions';

type Filter = 'all' | GameStatus;

const STATUS_LABEL: Record<GameStatus, string> = {
  playing: '在玩',
  completed: '已通关',
  backlog: '搁置',
};

const PLATFORMS: GamePlatform[] = ['PC', 'PS5', 'Xbox', 'Switch', 'Mobile', 'Other'];

const PLATFORM_OPTIONS = PLATFORMS.map((platform) => ({ value: platform, label: platform }));

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as GameStatus[]).map((value) => ({
  value,
  label: STATUS_LABEL[value],
}));

/** 搜索时参与匹配的字段；模块级常量，引用稳定，useEntityList 的缓存才不会白费 */
const gameSearchFields = (game: Game): string[] => [
  game.name,
  game.platform,
  game.notes,
  ...game.tags,
  ...game.achievements.map((achievement) => achievement.name),
];

const gameStatusOf = (game: Game): GameStatus => game.status;

const FILTER_OPTIONS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'playing', label: '在玩' },
  { value: 'completed', label: '已通关' },
  { value: 'backlog', label: '搁置' },
];

/** 「最近游玩」最多列几条 */
const SESSION_PREVIEW_COUNT = 6;

/** 封面占位的渐变色（全部来自设计令牌），按游戏名稳定取色 */
const COVER_GRADIENTS = [
  'linear-gradient(135deg, var(--lm-accent), var(--lm-info))',
  'linear-gradient(135deg, var(--lm-success), var(--lm-info))',
  'linear-gradient(135deg, var(--lm-warning), var(--lm-accent))',
  'linear-gradient(135deg, var(--lm-danger), var(--lm-warning))',
  'linear-gradient(135deg, var(--lm-info), var(--lm-success))',
  'linear-gradient(135deg, var(--lm-accent-strong), var(--lm-danger))',
];

function coverGradientOf(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash + (ch.codePointAt(0) ?? 0)) % 997;
  return COVER_GRADIENTS[hash % COVER_GRADIENTS.length]!;
}

function coverCharOf(name: string): string {
  return [...name.trim()][0] ?? '游';
}

/** 删一条流水会同时改动 sessions 与游戏上的总时长，撤销得把两边一起还原 */
interface PlayLogSnapshot {
  sessions: GameSession[];
  games: Game[];
}

export const GamesPage: React.FC = () => {
  const {
    games,
    addGame,
    deleteGame,
    updateGame,
    updateGameStatus,
    updateHoursPlayed,
    addAchievement,
    toggleAchievement,
    deleteAchievement,
    sessions,
    addSession,
    deleteSession,
    replaceGames,
    replaceSessions,
  } = useGameStore();
  const undoableRemove = useUndoableRemove();
  const tagSuggestions = useTagSuggestions();

  /** 关键词 + 状态筛选 + 计数 + 「是空库还是没筛出来」，六个列表页共用同一份实现 */
  const {
    keyword,
    setKeyword,
    filter,
    setFilter,
    visible: visibleGames,
    countOf,
    filteredOut,
    clearFilters,
  } = useEntityList<Game, GameStatus>({
    items: games,
    searchFields: gameSearchFields,
    statusOf: gameStatusOf,
  });

  /**
   * 「只看收藏」：状态筛选归那个六页共用的 hook 管，收藏只有书和游戏才有，
   * 所以叠在 visible 之上再筛一道，不动 useEntityList 的接口。
   */
  const [onlyFavorite, setOnlyFavorite] = useState(false);
  const favoriteCount = useMemo(() => games.filter((game) => game.favorite).length, [games]);
  const shownGames = useMemo(
    () => (onlyFavorite ? visibleGames.filter((game) => game.favorite) : visibleGames),
    [onlyFavorite, visibleGames],
  );
  /** 列表被筛空的两种来源：关键词 / 状态，或「只看收藏」；空态文案据此区分「库是空的」 */
  const listFilteredOut = filteredOut || (onlyFavorite && games.length > 0);
  const clearListFilters = (): void => {
    clearFilters();
    setOnlyFavorite(false);
  };

  /*
   * 批量操作（F16）。范围是「当前列表里看得见的游戏」—— 筛过之后全选，动的是筛出来的那批。
   */
  const shownGameIds = useMemo(() => shownGames.map((game) => game.id), [shownGames]);
  const selection = useMultiSelect({ ids: shownGameIds });
  /** 行间键盘导航（U8）：j / k 走行、x 进批量 */
  const listNav = useRovingList({ ids: shownGameIds, onToggleSelect: selection.toggle });
  const [bulkTagModal, setBulkTagModal] = useState(false);
  const [bulkTagDraft, setBulkTagDraft] = useState<string[]>([]);
  const [bulkTagsRemove, setBulkTagsRemove] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const applyBulkTags = (): void => {
    const wanted = normalizeTags(bulkTagDraft);
    if (wanted.length === 0) return;

    for (const id of selection.selectedIds) {
      const game = games.find((item) => item.id === id);
      if (!game) continue;
      const merged = bulkTagsRemove
        ? game.tags.filter((tag) => !wanted.includes(tag))
        : normalizeTags([...game.tags, ...wanted]);
      updateGame(id, { tags: merged });
    }

    setBulkTagDraft([]);
    setBulkTagsRemove(false);
    setBulkTagModal(false);
  };

  const confirmBulkDelete = (): void => {
    const snapshot = games;
    const doomed = new Set(selection.selectedIds);
    const removed = games.filter((game) => doomed.has(game.id));
    for (const id of doomed) deleteGame(id);

    setBulkDeleteOpen(false);
    selection.clear();

    if (removed.length > 0) {
      undoableRemove({
        message: `已删除 ${removed.length} 款游戏`,
        description: '点「撤销」可以全部放回原来的位置。',
        snapshot,
        restore: replaceGames,
      });
    }
  };

  const [showAddModal, setShowAddModal] = useState(false);
  useNewEntryShortcut(() => setShowAddModal(true));

  /**
   * 右栏当前展示哪一款游戏的哪一块。
   * 成就与笔记是同一款游戏的两面，共用一份「选中了什么」的状态：
   * 宽屏下它决定右栏内容，窄屏下它决定抽屉开不开。
   */
  const [detail, setDetail] = useState<{ gameId: string; kind: 'achievements' | 'notes' } | null>(
    null,
  );
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; platform: GamePlatform; tags: string[] }>({
    name: '',
    platform: 'PC',
    tags: [],
  });
  const [achievementForm, setAchievementForm] = useState({ name: '', description: '' });
  const [noteInput, setNoteInput] = useState('');
  const [reviewInput, setReviewInput] = useState('');
  const [finishedAtInput, setFinishedAtInput] = useState('');
  /** 评分草稿：和短评 / 通关日期一样随「保存」写入，`取消` 就该什么都不改 */
  const [ratingInput, setRatingInput] = useState(0);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState<{
    gameId: string;
    date: string;
    hours: number | '';
    note: string;
  }>({ gameId: '', date: todayKey(), hours: 1, note: '' });

  const totalHours = games.reduce((sum, game) => sum + game.hoursPlayed, 0);

  // 「下一步玩什么」（F11）：搁置的优先，按选定方式挑一个推荐
  const [nextUpSort, setNextUpSort] = useState<'backlog' | 'rating' | 'hours'>('backlog');
  const backlogCount = games.filter((game) => game.status === 'backlog').length;
  const nextUpCandidates = useMemo(
    () =>
      games.filter(
        (game) => game.status === 'backlog' || (game.status === 'playing' && game.hoursPlayed < 2),
      ),
    [games],
  );
  const nextUpGame = useMemo(() => {
    const sorted = [...nextUpCandidates].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'backlog' ? -1 : 1;
      if (nextUpSort === 'rating') return b.rating - a.rating;
      if (nextUpSort === 'hours') return a.hoursPlayed - b.hoursPlayed;
      return a.createdAt.localeCompare(b.createdAt);
    });
    return sorted[0] ?? null;
  }, [nextUpCandidates, nextUpSort]);

  const today = todayKey();
  const currentYear = today.slice(0, 4);
  /** 今年已经过去的月份数，用来决定年度图表画几根柱子（1 月就是 1 根） */
  const monthCount = Number(today.slice(5, 7));

  const yearSessions = useMemo(
    () => sessions.filter((session) => session.date.slice(0, 4) === currentYear),
    [sessions, currentYear],
  );
  const monthlyHours = useMemo(
    () =>
      seriesByMonth(
        yearSessions,
        monthCount,
        today,
        (session) => session.date,
        (session) => session.hours,
      ),
    [yearSessions, monthCount, today],
  );
  const yearHours =
    Math.round(yearSessions.reduce((sum, session) => sum + session.hours, 0) * 10) / 10;
  const yearDays = new Set(yearSessions.map((session) => session.date)).size;

  /** 流水里只存 gameId，展示时换成游戏名 */
  const gameNameOf = (gameId: string): string =>
    games.find((game) => game.id === gameId)?.name ?? '已删除的游戏';

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, SESSION_PREVIEW_COUNT),
    [sessions],
  );

  const detailGame = games.find((game) => game.id === detail?.gameId) ?? null;
  /** 详情栏标题：宽屏是卡片标题，窄屏是抽屉的可访问名称 */
  const detailKindLabel = detail?.kind === 'notes' ? '笔记' : '成就';
  const detailTitle = detail
    ? detailGame
      ? `《${detailGame.name}》的${detailKindLabel}`
      : detailKindLabel
    : '游戏详情';
  const pendingGame = games.find((game) => game.id === pendingDeleteId) ?? null;
  const pendingSession = sessions.find((session) => session.id === pendingSessionId) ?? null;

  const openNotes = (game: Game): void => {
    setNoteInput(game.notes);
    setReviewInput(game.review);
    setFinishedAtInput(game.finishedAt ?? '');
    setRatingInput(game.rating);
    setDetail({ gameId: game.id, kind: 'notes' });
  };

  const closeDetail = (): void => {
    setDetail(null);
    setAchievementForm({ name: '', description: '' });
  };

  const handleSaveNotes = (): void => {
    if (detail) {
      updateGame(detail.gameId, {
        notes: noteInput.trim(),
        review: reviewInput.trim(),
        rating: ratingInput,
        finishedAt: finishedAtInput || undefined,
      });
    }
    closeDetail();
  };

  // 命令面板搜到本页的游戏时，直接打开它的笔记面板
  usePaletteFocus('/games', (gameId) => {
    const game = games.find((item) => item.id === gameId);
    if (game) openNotes(game);
  });

  const handleAddGame = (): void => {
    const name = form.name.trim();
    if (!name) return;
    addGame(name, form.platform, form.tags);
    setForm({ name: '', platform: 'PC', tags: [] });
    setShowAddModal(false);
  };

  const handleAddAchievement = (): void => {
    if (!detail || detail.kind !== 'achievements') return;
    const name = achievementForm.name.trim();
    if (!name) return;
    addAchievement(detail.gameId, name, achievementForm.description.trim());
    setAchievementForm({ name: '', description: '' });
  };

  const openSessionModal = (gameId?: string): void => {
    const fallback = games.length > 0 ? games[0].id : '';
    setSessionForm({ gameId: gameId ?? fallback, date: today, hours: 1, note: '' });
    setShowSessionModal(true);
  };

  const sessionHours = typeof sessionForm.hours === 'number' ? sessionForm.hours : 0;
  const canSaveSession = Boolean(sessionForm.gameId) && sessionHours > 0;

  const handleAddSession = (): void => {
    if (!canSaveSession) return;
    addSession(
      sessionForm.gameId,
      sessionForm.date || today,
      sessionHours,
      sessionForm.note.trim(),
    );
    setShowSessionModal(false);
  };

  /**
   * 删一条流水会同时改 sessions 与游戏上的总时长，
   * 撤销时两边都要还原，所以快照里把两个数组一起带上。
   */
  const restorePlayLog = (snapshot: PlayLogSnapshot[]): void => {
    const entry = snapshot[0];
    if (!entry) return;
    replaceSessions(entry.sessions);
    replaceGames(entry.games);
  };

  return (
    <div className="space-y-section">
      <PageHeader
        title="游戏"
        description="游戏库、游玩时长与成就进度"
        icon={Gamepad2}
        actions={
          <>
            {games.length > 0 && (
              <Button
                variant="secondary"
                icon={<Clock size={16} aria-hidden />}
                onClick={() => openSessionModal()}
              >
                记录游玩
              </Button>
            )}
            <Button
              icon={<Plus size={16} aria-hidden />}
              onClick={() => {
                setForm({ name: '', platform: 'PC', tags: [] });
                setShowAddModal(true);
              }}
            >
              添加游戏
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="游戏总数"
          value={games.length}
          unit="款"
          icon={<Gamepad2 size={16} aria-hidden />}
        />
        <StatCard
          label="在玩中"
          value={countOf('playing')}
          unit="款"
          tone="accent"
          icon={<Gamepad2 size={16} aria-hidden />}
        />
        <StatCard
          label="已通关数"
          value={countOf('completed')}
          unit="款"
          tone="success"
          icon={<Trophy size={16} aria-hidden />}
        />
        <StatCard
          label="总时长"
          value={formatDuration(totalHours)}
          icon={<Clock size={16} aria-hidden />}
          footer={`合计 ${formatNumber(Math.round(totalHours * 10) / 10)} 小时`}
        />
      </div>

      {sessions.length > 0 && (
        <Card>
          <CardHeader
            title={`${currentYear} 年游玩`}
            subtitle={
              yearSessions.length > 0
                ? `累计 ${formatNumber(yearHours)} 小时 · 游玩 ${yearDays} 天 · ${yearSessions.length} 条记录`
                : '今年还没有记录，记一次就会出现在这里'
            }
          />
          <CardBody className="space-y-4">
            {yearSessions.length > 0 && (
              <BarChart
                data={monthlyHours}
                label={`${currentYear} 年每月游玩时长`}
                formatValue={(value) => `${formatNumber(value)} 小时`}
                formatDate={formatMonthLabel}
              />
            )}

            <ul className="divide-y divide-line-subtle rounded border border-line-subtle">
              {recentSessions.map((session) => (
                <li key={session.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="truncate text-sm text-content">
                        {gameNameOf(session.gameId)}
                      </span>
                      <span className="text-xs text-content-tertiary tabular">
                        {formatShortDate(session.date)} · {formatNumber(session.hours)} 小时
                      </span>
                    </div>
                    {session.note && (
                      <p className="mt-0.5 truncate text-xs text-content-tertiary">
                        {session.note}
                      </p>
                    )}
                  </div>
                  <IconButton
                    label={`删除 ${formatShortDate(session.date)} 的「${gameNameOf(session.gameId)}」游玩记录`}
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

      <MasterDetail
        detailTitle={detailTitle}
        detailOpen={detail !== null}
        onCloseDetail={closeDetail}
        drawerWidth="lg"
        emptyDetail={
          <EmptyState
            icon={<Trophy size={20} aria-hidden />}
            title="还没有选中游戏"
            description="点左边任意一款游戏的「管理成就」或「笔记」，就能在这里处理。"
            className="py-6"
          />
        }
        detail={
          detail === null || detailGame === null ? null : detail.kind === 'achievements' ? (
            <div className="space-y-4">
              <p className="text-xs text-content-tertiary">点击已有成就可以切换解锁状态</p>
              <div className="space-y-2">
                <Input
                  label="成就名称"
                  value={achievementForm.name}
                  onChange={(event) =>
                    setAchievementForm({ ...achievementForm, name: event.target.value })
                  }
                  placeholder="如：无伤通关"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddAchievement();
                    }
                  }}
                />
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      label="描述"
                      value={achievementForm.description}
                      onChange={(event) =>
                        setAchievementForm({ ...achievementForm, description: event.target.value })
                      }
                      placeholder="可选"
                    />
                  </div>
                  <Button onClick={handleAddAchievement} disabled={!achievementForm.name.trim()}>
                    添加
                  </Button>
                </div>
              </div>

              {detailGame && detailGame.achievements.length === 0 ? (
                <EmptyState
                  icon={<Trophy size={20} aria-hidden />}
                  title="还没有成就"
                  description="把想要拿的成就先列出来，解锁后点一下就行。"
                  className="py-6"
                />
              ) : (
                <ul className="space-y-1">
                  {detailGame?.achievements.map((achievement) => (
                    <li
                      key={achievement.id}
                      className="flex items-center justify-between gap-3 rounded px-2 py-1.5 hover:bg-hover"
                    >
                      <button
                        type="button"
                        aria-pressed={achievement.unlocked}
                        onClick={() =>
                          detailGame && toggleAchievement(detailGame.id, achievement.id)
                        }
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-2xs ${
                            achievement.unlocked
                              ? 'border-success bg-success text-white'
                              : 'border-line text-transparent'
                          }`}
                          aria-hidden
                        >
                          ✓
                        </span>
                        <span className="min-w-0">
                          <span
                            className={`block truncate text-sm ${
                              achievement.unlocked ? 'text-content' : 'text-content-secondary'
                            }`}
                          >
                            {achievement.name}
                          </span>
                          {achievement.description && (
                            <span className="block truncate text-2xs text-content-tertiary">
                              {achievement.description}
                            </span>
                          )}
                        </span>
                      </button>
                      <IconButton
                        label={`删除成就「${achievement.name}」`}
                        size="sm"
                        icon={<Trash2 size={13} />}
                        onClick={() => {
                          if (!detailGame) return;
                          const snapshot = games;
                          deleteAchievement(detailGame.id, achievement.id);
                          undoableRemove({
                            message: `已删除成就「${achievement.name}」`,
                            description: '点「撤销」可以恢复。',
                            snapshot,
                            restore: replaceGames,
                          });
                        }}
                        className="hover:text-danger"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <SubmitForm id="game-detail-form" onSubmit={handleSaveNotes} className="space-y-4">
              {detailGame && (
                <>
                  <div>
                    <p className="mb-1.5 text-sm font-medium text-content-secondary">评分</p>
                    <div
                      role="group"
                      aria-label={`给「${detailGame.name}」评分`}
                      className="flex flex-wrap gap-1"
                    >
                      {Array.from({ length: 10 }, (_, index) => index + 1).map((score) => (
                        <button
                          key={score}
                          type="button"
                          aria-pressed={ratingInput === score}
                          onClick={() => setRatingInput(score)}
                          className={`h-8 w-8 rounded text-xs font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
                            ratingInput >= score
                              ? 'bg-warning-soft text-warning'
                              : 'bg-inset text-content-tertiary hover:text-content-secondary'
                          }`}
                        >
                          {score}
                        </button>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => setRatingInput(0)}>
                        清除
                      </Button>
                    </div>
                  </div>

                  <Input
                    label="短评"
                    value={reviewInput}
                    onChange={(event) => setReviewInput(event.target.value)}
                    placeholder="一句话说说怎么样（可与笔记分开）"
                  />

                  {detailGame.status === 'completed' && (
                    <Input
                      label="通关日期"
                      type="date"
                      value={finishedAtInput}
                      onChange={(event) => setFinishedAtInput(event.target.value)}
                    />
                  )}

                  {detailGame.statusHistory.length > 0 && (
                    <div>
                      <p className="mb-1 text-sm font-medium text-content-secondary">状态时间线</p>
                      <ul className="space-y-1 text-xs text-content-tertiary">
                        {detailGame.statusHistory.map((entry) => (
                          <li key={entry.id} className="flex items-center gap-2">
                            <Badge tone="default">
                              {STATUS_LABEL[entry.status as GameStatus] ?? entry.status}
                            </Badge>
                            <span className="tabular">{entry.date}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              <p className="text-xs text-content-tertiary">笔记留空并保存即可清空</p>
              <Textarea
                label="笔记"
                value={noteInput}
                onChange={(event) => setNoteInput(event.target.value)}
                rows={6}
                placeholder="攻略、心得、待补的 DLC…"
              />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="secondary" onClick={closeDetail}>
                  取消
                </Button>
                <Button type="submit" form="game-detail-form">
                  保存
                </Button>
              </div>
            </SubmitForm>
          )
        }
      >
        {nextUpCandidates.length >= 2 && (
          <Card>
            <CardHeader
              title="下一步玩什么"
              subtitle={'从搁置和刚开坑的游戏里挑一个，按你选的方式排'}
              action={
                backlogCount > 1 ? (
                  <Select
                    aria-label="推荐排序方式"
                    value={nextUpSort}
                    onChange={(value) => setNextUpSort(value as typeof nextUpSort)}
                    className="w-36"
                    options={[
                      { value: 'backlog', label: '积压最久优先' },
                      { value: 'rating', label: '评分最高优先' },
                      { value: 'hours', label: '耗时最短优先' },
                    ]}
                  />
                ) : null
              }
            />
            <CardBody>
              {nextUpGame ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Gamepad2 size={18} className="shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                    {nextUpGame.name}
                  </span>
                  <Badge tone="info">{nextUpGame.platform}</Badge>
                  {nextUpGame.rating > 0 && <Badge tone="warning">★ {nextUpGame.rating}</Badge>}
                  <span className="text-xs text-content-tertiary tabular">
                    已玩 {formatNumber(Math.round(nextUpGame.hoursPlayed * 10) / 10)} 小时
                    {nextUpGame.status === 'backlog' ? ' · 还没开过' : ' · 进行中'}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-content-tertiary">没有搁置的游戏，随便玩！</p>
              )}
            </CardBody>
          </Card>
        )}

        <Toolbar
          search={{
            value: keyword,
            onChange: setKeyword,
            placeholder: '搜索游戏、平台、标签或成就…',
          }}
          actions={
            <>
              <Button
                variant="secondary"
                icon={<Star size={15} aria-hidden />}
                aria-pressed={onlyFavorite}
                onClick={() => setOnlyFavorite((previous) => !previous)}
              >
                只看收藏
                {favoriteCount > 0 && (
                  <span className="tabular text-content-tertiary">{favoriteCount}</span>
                )}
              </Button>
              <SegmentedControl
                label="按游玩状态筛选"
                value={filter}
                onChange={setFilter}
                options={FILTER_OPTIONS.map((option) => ({
                  ...option,
                  count: countOf(option.value),
                }))}
              />
              {shownGames.length > 0 && (
                <Button
                  variant="secondary"
                  icon={<ListChecks size={15} aria-hidden />}
                  onClick={() => selection.toggle(shownGames[0]!.id)}
                  disabled={selection.isActive}
                >
                  批量
                </Button>
              )}
            </>
          }
        />

        {shownGames.length === 0 ? (
          <ListEmptyState
            icon={<Gamepad2 size={22} aria-hidden />}
            filtered={listFilteredOut}
            emptyTitle="游戏库还是空的"
            emptyDescription="把在玩的、想玩的都加进来，时长和成就可以慢慢补。"
            emptyAction={
              <Button icon={<Plus size={16} aria-hidden />} onClick={() => setShowAddModal(true)}>
                添加游戏
              </Button>
            }
            filteredTitle="没有符合条件的游戏"
            filteredDescription="换个关键词、切换状态筛选，或者关掉上面的「只看收藏」。"
            onClearFilters={clearListFilters}
          />
        ) : (
          // 列表自己承载行间导航：焦点落在行里时 j / k / x 才生效，离开列表就不管
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          <ul className="grid gap-4 sm:grid-cols-2" onKeyDown={listNav.onKeyDown}>
            {shownGames.map((game) => {
              const unlocked = game.achievements.filter(
                (achievement) => achievement.unlocked,
              ).length;
              return (
                <li key={game.id} {...rowProps(game.id)}>
                  <Card className="p-4">
                    <div className="flex items-start gap-4">
                      {selection.isActive && (
                        <input
                          type="checkbox"
                          checked={selection.has(game.id)}
                          aria-label={`选中「${game.name}」`}
                          onChange={() => selection.toggle(game.id)}
                          style={{ accentColor: 'var(--lm-accent)' }}
                          className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded-sm border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                        />
                      )}
                      <div
                        aria-hidden
                        className="flex h-28 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg shadow-xs"
                        style={{ background: coverGradientOf(game.name) }}
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/25 text-lg font-semibold text-white">
                          {coverCharOf(game.name)}
                        </span>
                        <Gamepad2 size={14} className="text-white/80" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-content">{game.name}</h3>
                          <button
                            type="button"
                            aria-pressed={game.favorite}
                            aria-label={
                              game.favorite ? `取消收藏「${game.name}」` : `收藏「${game.name}」`
                            }
                            onClick={() => updateGame(game.id, { favorite: !game.favorite })}
                            className={`shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
                              game.favorite
                                ? 'text-warning'
                                : 'text-content-tertiary hover:text-content-secondary'
                            }`}
                          >
                            <Star
                              size={15}
                              fill={game.favorite ? 'currentColor' : 'none'}
                              aria-hidden
                            />
                          </button>
                          <Badge tone="info">{game.platform}</Badge>
                          {game.rating > 0 && <Badge tone="warning">★ {game.rating}</Badge>}
                          {game.achievements.length > 0 && (
                            <Badge tone={unlocked > 0 ? 'success' : 'default'}>
                              成就 {unlocked}/{game.achievements.length}
                            </Badge>
                          )}
                        </div>

                        {game.notes && (
                          <p className="mt-1.5 line-clamp-2 text-sm text-content-tertiary">
                            {game.notes}
                          </p>
                        )}

                        <div className="mt-1.5">
                          <TagEditor
                            tags={game.tags}
                            suggestions={tagSuggestions}
                            onChange={(tags) => updateGame(game.id, { tags })}
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap items-end gap-3">
                          <div className="w-36">
                            <NumberInput
                              ariaLabel={`「${game.name}」的游玩时长`}
                              label="游玩时长"
                              value={game.hoursPlayed}
                              onChange={(value) =>
                                updateHoursPlayed(game.id, value === '' ? 0 : value)
                              }
                              min={0}
                              step={0.5}
                              suffix="小时"
                            />
                          </div>
                          <div className="w-32">
                            <Select
                              aria-label={`调整「${game.name}」的状态`}
                              value={game.status}
                              onChange={(value) => updateGameStatus(game.id, value as GameStatus)}
                              options={STATUS_OPTIONS}
                            />
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          <ProgressBar
                            value={game.progress}
                            label="通关进度"
                            showValue
                            tone={game.progress >= 100 ? 'success' : 'accent'}
                          />
                          <Slider
                            ariaLabel={`调整「${game.name}」的进度`}
                            value={game.progress}
                            onChange={(value) => updateGame(game.id, { progress: value })}
                            showValue
                            formatValue={(value) => `${value}%`}
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {game.achievements.map((achievement) => (
                            <button
                              key={achievement.id}
                              type="button"
                              aria-pressed={achievement.unlocked}
                              title={achievement.description || achievement.name}
                              onClick={() => toggleAchievement(game.id, achievement.id)}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
                                achievement.unlocked
                                  ? 'bg-success-soft text-success'
                                  : 'bg-inset text-content-tertiary hover:text-content-secondary'
                              }`}
                            >
                              <Trophy size={11} aria-hidden />
                              {achievement.name}
                            </button>
                          ))}
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Trophy size={13} aria-hidden />}
                            onClick={() => setDetail({ gameId: game.id, kind: 'achievements' })}
                          >
                            管理成就
                          </Button>
                          {/* j / k 落在这一颗上：回车 = 打开这款游戏的笔记 */}
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<StickyNote size={13} aria-hidden />}
                            onClick={() => openNotes(game)}
                            {...ROW_FOCUS_PROP}
                          >
                            笔记
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Clock size={13} aria-hidden />}
                            aria-label={`记录《${game.name}》的游玩`}
                            onClick={() => openSessionModal(game.id)}
                          >
                            记录游玩
                          </Button>
                        </div>
                      </div>

                      {!selection.isActive && (
                        <IconButton
                          label={`删除《${game.name}》`}
                          size="sm"
                          className="ml-auto shrink-0 self-start hover:text-danger"
                          icon={<Trash2 size={15} />}
                          onClick={() => setPendingDeleteId(game.id)}
                        />
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        {selection.isActive && (
          <SelectionBar
            count={selection.count}
            onClear={selection.clear}
            onSelectAll={selection.selectAll}
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setBulkTagDraft([]);
                setBulkTagsRemove(false);
                setBulkTagModal(true);
              }}
            >
              打标签
            </Button>
            <Select
              aria-label="批量修改平台"
              className="w-28"
              value=""
              onChange={(value) => {
                for (const id of selection.selectedIds)
                  updateGame(id, { platform: value as GamePlatform });
              }}
              options={[{ value: '', label: '平台…' }, ...PLATFORM_OPTIONS]}
            />
            <Select
              aria-label="批量修改游玩状态"
              className="w-32"
              value=""
              onChange={(value) => {
                for (const id of selection.selectedIds) updateGameStatus(id, value as GameStatus);
              }}
              options={[{ value: '', label: '状态…' }, ...STATUS_OPTIONS]}
            />
            <Button size="sm" variant="danger" onClick={() => setBulkDeleteOpen(true)}>
              删除
            </Button>
          </SelectionBar>
        )}
      </MasterDetail>

      <Modal
        isOpen={showSessionModal}
        onClose={() => setShowSessionModal(false)}
        title="记录游玩"
        description="记一次会写进流水，同时把时长累加到这款游戏上"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowSessionModal(false)}>
              取消
            </Button>
            <Button type="submit" form="game-session-form" disabled={!canSaveSession}>
              保存
            </Button>
          </>
        }
      >
        <SubmitForm id="game-session-form" onSubmit={handleAddSession} className="space-y-4">
          <Select
            label="游戏"
            value={sessionForm.gameId}
            onChange={(value) => setSessionForm({ ...sessionForm, gameId: value })}
            options={games.map((game) => ({ value: game.id, label: game.name }))}
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
            placeholder="打到哪一章、和谁一起玩…（可选）"
          />
        </SubmitForm>
      </Modal>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="添加游戏"
        description="新加入的游戏默认是「在玩」，之后可以改状态"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              取消
            </Button>
            <Button type="submit" form="game-add-form" disabled={!form.name.trim()}>
              添加
            </Button>
          </>
        }
      >
        <SubmitForm id="game-add-form" onSubmit={handleAddGame}>
          <div className="space-y-4">
            <Input
              label="游戏名称"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="输入游戏名称"
              required
            />
            <Select
              label="平台"
              value={form.platform}
              onChange={(value) => setForm({ ...form, platform: value as GamePlatform })}
              options={PLATFORM_OPTIONS}
            />
            <TagInput
              label="标签"
              hint="回车或逗号分隔；标签跨模块通用，可在命令面板里输入 #标签 直接找"
              value={form.tags}
              suggestions={tagSuggestions}
              onChange={(tags) => setForm({ ...form, tags })}
            />
          </div>
        </SubmitForm>
      </Modal>

      <ConfirmDialog
        isOpen={pendingGame !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => {
          const target = pendingGame;
          const snapshot = games;
          if (pendingDeleteId) deleteGame(pendingDeleteId);
          setPendingDeleteId(null);
          if (target) {
            undoableRemove({
              message: `已删除《${target.name}》`,
              description: `连同 ${target.achievements.length} 个成就记录一起删除，点「撤销」可以恢复。`,
              snapshot,
              restore: replaceGames,
            });
          }
        }}
        title="删除游戏"
        description={
          pendingGame
            ? `确定要删除《${pendingGame.name}》吗？${pendingGame.achievements.length} 个成就记录与 ${pendingGame.hoursPlayed} 小时时长会一起删除。`
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
          const playLog: PlayLogSnapshot = { sessions, games };
          if (pendingSessionId) deleteSession(pendingSessionId);
          setPendingSessionId(null);
          if (target) {
            undoableRemove({
              message: `已删除 ${formatShortDate(target.date)} 的游玩记录`,
              description: `${gameNameOf(target.gameId)} 的 ${formatNumber(target.hours)} 小时已从总时长里减回，点「撤销」可以恢复。`,
              snapshot: [playLog],
              restore: restorePlayLog,
            });
          }
        }}
        title="删除游玩记录"
        description={
          pendingSession
            ? `确定要删除 ${formatShortDate(pendingSession.date)} 的「${gameNameOf(pendingSession.gameId)}」记录吗？删掉后这款游戏的总时长会相应减少。`
            : ''
        }
        confirmText="删除"
        tone="danger"
      />

      <Modal
        isOpen={bulkTagModal}
        onClose={() => setBulkTagModal(false)}
        title="批量打标签"
        description={`将对选中的 ${selection.count} 款游戏生效`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkTagModal(false)}>
              取消
            </Button>
            <Button onClick={applyBulkTags} disabled={bulkTagDraft.length === 0}>
              应用
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SegmentedControl
            label="标签处理方式"
            value={bulkTagsRemove ? 'remove' : 'add'}
            onChange={(value) => setBulkTagsRemove(value === 'remove')}
            options={[
              { value: 'add', label: '添加' },
              { value: 'remove', label: '移除' },
            ]}
          />
          <TagInput
            label="标签"
            hint="回车或逗号分隔；添加是并集，移除只影响已选中的这批"
            value={bulkTagDraft}
            suggestions={tagSuggestions}
            onChange={setBulkTagDraft}
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={confirmBulkDelete}
        title="批量删除游戏"
        description={`确定要删除选中的 ${selection.count} 款游戏吗？成就记录与时长会一起删除，删完可以点「撤销」全部放回去。`}
        confirmText="删除"
        tone="danger"
      />
    </div>
  );
};

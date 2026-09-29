import React, { useMemo, useState } from 'react';
import { Clock, Gamepad2, Plus, StickyNote, Trash2, Trophy } from 'lucide-react';
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
  Slider,
  StatCard,
  Textarea,
} from '../components/ui';
import { PageHeader, Toolbar } from '../components/layout';
import { BarChart } from '../components/charts';
import { useGameStore } from '../store/gameStore';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { filterByKeyword } from '../utils/search';
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

  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  useNewEntryShortcut(() => setShowAddModal(true));

  const [achievementGameId, setAchievementGameId] = useState<string | null>(null);
  const [noteGameId, setNoteGameId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; platform: GamePlatform }>({
    name: '',
    platform: 'PC',
  });
  const [achievementForm, setAchievementForm] = useState({ name: '', description: '' });
  const [noteInput, setNoteInput] = useState('');
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [sessionForm, setSessionForm] = useState<{
    gameId: string;
    date: string;
    hours: number | '';
    note: string;
  }>({ gameId: '', date: todayKey(), hours: 1, note: '' });

  const countOf = (status: GameStatus): number =>
    games.filter((game) => game.status === status).length;

  const totalHours = games.reduce((sum, game) => sum + game.hoursPlayed, 0);

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

  const visibleGames = useMemo(() => {
    const byStatus = filter === 'all' ? games : games.filter((game) => game.status === filter);
    return filterByKeyword(byStatus, keyword, (game) => [
      game.name,
      game.platform,
      game.notes,
      ...game.achievements.map((achievement) => achievement.name),
    ]);
  }, [games, filter, keyword]);

  const achievementGame = games.find((game) => game.id === achievementGameId) ?? null;
  const noteGame = games.find((game) => game.id === noteGameId) ?? null;
  const pendingGame = games.find((game) => game.id === pendingDeleteId) ?? null;
  const pendingSession = sessions.find((session) => session.id === pendingSessionId) ?? null;

  const openNotes = (game: Game): void => {
    setNoteInput(game.notes);
    setNoteGameId(game.id);
  };

  // 命令面板搜到本页的游戏时，直接打开它的笔记面板
  usePaletteFocus('/games', (gameId) => {
    const game = games.find((item) => item.id === gameId);
    if (game) openNotes(game);
  });

  const handleAddGame = (): void => {
    const name = form.name.trim();
    if (!name) return;
    addGame(name, form.platform);
    setShowAddModal(false);
  };

  const handleAddAchievement = (): void => {
    if (!achievementGameId) return;
    const name = achievementForm.name.trim();
    if (!name) return;
    addAchievement(achievementGameId, name, achievementForm.description.trim());
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
                setForm({ name: '', platform: 'PC' });
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

      <Toolbar
        search={{ value: keyword, onChange: setKeyword, placeholder: '搜索游戏、平台或成就…' }}
        actions={
          <SegmentedControl
            label="按游玩状态筛选"
            value={filter}
            onChange={setFilter}
            options={FILTER_OPTIONS.map((option) => ({
              ...option,
              count: option.value === 'all' ? games.length : countOf(option.value),
            }))}
          />
        }
      />

      {visibleGames.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Gamepad2 size={22} aria-hidden />}
            title={games.length === 0 ? '游戏库还是空的' : '没有符合条件的游戏'}
            description={
              games.length === 0
                ? '把在玩的、想玩的都加进来，时长和成就可以慢慢补。'
                : '换个关键词，或者切换上面的状态筛选。'
            }
            action={
              games.length === 0 ? (
                <Button icon={<Plus size={16} aria-hidden />} onClick={() => setShowAddModal(true)}>
                  添加游戏
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
        <ul className="grid gap-4 sm:grid-cols-2">
          {visibleGames.map((game) => {
            const unlocked = game.achievements.filter((achievement) => achievement.unlocked).length;
            return (
              <li key={game.id}>
                <Card className="p-4">
                  <div className="flex items-start gap-4">
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
                        <Badge tone="info">{game.platform}</Badge>
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
                          onClick={() => setAchievementGameId(game.id)}
                        >
                          管理成就
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<StickyNote size={13} aria-hidden />}
                          onClick={() => openNotes(game)}
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

                    <IconButton
                      label={`删除《${game.name}》`}
                      size="sm"
                      className="ml-auto shrink-0 self-start hover:text-danger"
                      icon={<Trash2 size={15} />}
                      onClick={() => setPendingDeleteId(game.id)}
                    />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

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
            <Button onClick={handleAddSession} disabled={!canSaveSession}>
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
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
        </div>
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
            <Button onClick={handleAddGame} disabled={!form.name.trim()}>
              添加
            </Button>
          </>
        }
      >
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
        </div>
      </Modal>

      <Modal
        isOpen={achievementGame !== null}
        onClose={() => {
          setAchievementGameId(null);
          setAchievementForm({ name: '', description: '' });
        }}
        title={achievementGame ? `《${achievementGame.name}》的成就` : '成就'}
        description="点击已有成就可以切换解锁状态"
      >
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
            <Input
              label="描述"
              value={achievementForm.description}
              onChange={(event) =>
                setAchievementForm({ ...achievementForm, description: event.target.value })
              }
              placeholder="可选"
            />
            <Button onClick={handleAddAchievement} disabled={!achievementForm.name.trim()}>
              添加
            </Button>
          </div>

          {achievementGame && achievementGame.achievements.length === 0 ? (
            <EmptyState
              icon={<Trophy size={20} aria-hidden />}
              title="还没有成就"
              description="把想要拿的成就先列出来，解锁后点一下就行。"
              className="py-6"
            />
          ) : (
            <ul className="space-y-1">
              {achievementGame?.achievements.map((achievement) => (
                <li
                  key={achievement.id}
                  className="flex items-center justify-between gap-3 rounded px-2 py-1.5 hover:bg-hover"
                >
                  <button
                    type="button"
                    aria-pressed={achievement.unlocked}
                    onClick={() =>
                      achievementGame && toggleAchievement(achievementGame.id, achievement.id)
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
                      if (!achievementGame) return;
                      const snapshot = games;
                      deleteAchievement(achievementGame.id, achievement.id);
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
      </Modal>

      <Modal
        isOpen={noteGame !== null}
        onClose={() => setNoteGameId(null)}
        title={noteGame ? `《${noteGame.name}》的笔记` : '笔记'}
        description="留空并保存即可清空"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoteGameId(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (noteGameId) updateGame(noteGameId, { notes: noteInput.trim() });
                setNoteGameId(null);
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <Textarea
          label="笔记"
          value={noteInput}
          onChange={(event) => setNoteInput(event.target.value)}
          rows={6}
          placeholder="攻略、心得、待补的 DLC…"
        />
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
    </div>
  );
};

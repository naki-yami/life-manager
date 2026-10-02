import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  Code2,
  Gamepad2,
  Heart,
  LayoutDashboard,
  ListPlus,
  NotebookPen,
  PenTool,
  Plus,
  Send,
  Target,
  Trash2,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxRow,
  IconButton,
  Input,
  Kbd,
  StatStrip,
  useToast,
} from '../components/ui';
import { MetaSeparator, PageHeader } from '../components/layout';
import { DashboardGrid, type DashboardWidgetView } from '../components/dashboard';
import { GoalProgressList } from '../components/goals';
import { FocusCard } from '../components/timeline/FocusCard';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { ChartEmpty, Heatmap, Sparkline } from '../components/charts';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useGameStore } from '../store/gameStore';
import { useHabitStore } from '../store/habitStore';
import { useBodyStore } from '../store/bodyStore';
import { useFocusStore } from '../store/focusStore';
import { useUiStore } from '../store/uiStore';
import { useGoalStore } from '../store/goalStore';
import { useJournalStore } from '../store/journalStore';
import {
  dayKeyOf,
  daysBetween,
  formatDateNumbers,
  formatNumber,
  greeting,
  isoWeekNumber,
  todayKey,
  weekdayName,
} from '../utils/date';
import {
  activeDays,
  changeRate,
  currentStreak,
  longestStreak,
  seriesByDay,
  splitWindow,
  sumOf,
  sumSeries,
} from '../utils/stats';
import { habitAmountOn, habitTarget, pendingHabits, scheduleLabel } from '../utils/habits';
import { MOOD_LEVELS, clampMood, journalEntryOn, moodLabel } from '../utils/journal';
import {
  bodyFatOf,
  bodyPoints,
  changeFromPrevious,
  formatDelta,
  formatMetric,
  latestPoint,
  weightOf,
} from '../utils/body';

import { focusSummary } from '../utils/focus';
import { parseQuickTask } from '../utils/quickParse';
import { goalProgress, sortGoals, summarizeGoals } from '../utils/goals';
import type { MetricSnapshot } from '../utils/metrics';
import type { MoodLevel, Priority, Task } from '../types';

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** 今日聚焦：逾期最久 > 今天到期 > 优先级最高 > 截止最早 */
const focusPick = (pendingTasks: Task[], today: string): Task | null => {
  if (pendingTasks.length === 0) return null;
  const rank = (task: Task): number => {
    if (task.dueDate && task.dueDate < today) return 0;
    if (task.dueDate === today) return 1;
    return 2;
  };
  return [...pendingTasks].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (byPriority !== 0) return byPriority;
    return a.dueDate.localeCompare(b.dueDate);
  })[0]!;
};

/** 首页热力图与环比都按「近 30 天窗口、近 7 天环比」这两个口径 */
const ACTIVITY_DAYS = 30;

type ModuleTone = 'accent' | 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASS: Record<ModuleTone, string> = {
  accent: 'bg-accent-soft text-accent',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

const PRIORITY_BADGE: Record<Priority, { tone: 'danger' | 'warning' | 'default'; label: string }> =
  {
    high: { tone: 'danger', label: '紧急' },
    medium: { tone: 'warning', label: '中等' },
    low: { tone: 'default', label: '较低' },
  };

/** 五档心情各自的表情；键与 `MOOD_LEVELS` 对齐（1 最糟 → 5 最好）。0 是「没记」，不画 */
const MOOD_FACES: Record<MoodLevel, string> = {
  0: '',
  1: '😞',
  2: '😐',
  3: '🙂',
  4: '😄',
  5: '🤩',
};

/**
 * 「今天」卡里每行右边那截时间说明。
 *
 * 时间盒排在截止日期前面 —— 它回答「我打算什么时候做」，比「最晚什么时候做完」更具体。
 * 两者都没有时明写「无截止」：留空会让人以为是没渲染出来。
 * `scheduled` 为真表示这条该当胶囊画（「已排」是个状态），其余的当行小字。
 */
const whenHintOf = (task: Task, today: string): { text: string; scheduled: boolean } => {
  if (task.timebox && task.timebox.date === today) {
    return { text: `今天 ${task.timebox.start} · 已排`, scheduled: true };
  }
  if (!task.dueDate) return { text: '无截止', scheduled: false };
  if (task.dueDate === today) return { text: '今天到期', scheduled: false };
  if (task.dueDate < today) {
    return { text: `已逾期 ${daysBetween(task.dueDate, today) ?? 1} 天`, scheduled: false };
  }
  return { text: task.dueDate, scheduled: false };
};

interface ModuleCard {
  icon: LucideIcon;
  label: string;
  stat: string;
  detail: string;
  tone: ModuleTone;
  path: string;
}

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    tasks,
    memos,
    addMemo,
    deleteMemo,
    toggleTaskStatus,
    replaceMemos,
    addTask,
    replaceTasks,
  } = useTaskStore();
  const undoableRemove = useUndoableRemove();
  const books = useBookStore((state) => state.books);
  const devProjects = useDevStore((state) => state.projects);
  const writingProjects = useWritingStore((state) => state.projects);
  const workoutRecords = useFitnessStore((state) => state.records);
  const mealRecords = useDietStore((state) => state.records);
  const games = useGameStore((state) => state.games);
  const habits = useHabitStore((state) => state.habits);
  const journalEntries = useJournalStore((state) => state.entries);
  const saveJournalEntry = useJournalStore((state) => state.saveEntry);
  const toggleHabitLog = useHabitStore((state) => state.toggleHabitLog);
  const bodyRecords = useBodyStore((state) => state.records);
  const readingSessions = useBookStore((state) => state.sessions);
  const workSessions = useDevStore((state) => state.sessions);
  const goals = useGoalStore((state) => state.goals);

  const focusSessions = useFocusStore((state) => state.sessions);

  // 仪表盘排布存在 lm:ui 里，这里只读出来渲染
  const dashboard = useUiStore((state) => state.dashboard);
  const moveDashboardWidget = useUiStore((state) => state.moveDashboardWidget);
  const setWidgetSize = useUiStore((state) => state.setWidgetSize);
  const setWidgetHidden = useUiStore((state) => state.setWidgetHidden);
  const resetDashboard = useUiStore((state) => state.resetDashboard);

  const [memoInput, setMemoInput] = useState('');
  const [memoError, setMemoError] = useState<string | undefined>();
  const [quickInput, setQuickInput] = useState('');
  const [editingLayout, setEditingLayout] = useState(false);
  const today = todayKey();

  /** 今天还没打卡的习惯：既喂「今日习惯」卡片，也用来算欢迎语里的提醒 */
  const pendingHabitList = useMemo(() => pendingHabits(habits, today), [habits, today]);

  /** 身体指标卡片：最近一次体重 / 体脂，以及与上一次的差 */
  const latestWeight = useMemo(() => latestPoint(bodyRecords, weightOf), [bodyRecords]);
  const latestBodyFat = useMemo(() => latestPoint(bodyRecords, bodyFatOf), [bodyRecords]);
  const weightChange = useMemo(() => changeFromPrevious(bodyRecords, weightOf), [bodyRecords]);
  const weightPoints = useMemo(() => bodyPoints(bodyRecords, weightOf, 14), [bodyRecords]);

  /** 写过日记的日子：既是活动量的一部分，也用来算日记的连续记录天数 */
  const journalSeries = useMemo(
    () => seriesByDay(journalEntries, ACTIVITY_DAYS, today, (entry) => entry.date),
    [journalEntries, today],
  );

  /**
   * 完成任务 / 训练 / 饮食 / 日记任意一条都算一次活动，用来喂热力图与环比。
   * 写日记也算「这一天有在记录自己」—— 它和训练、饮食一样是主动留下的一条数据。
   */
  const activitySeries = useMemo(
    () =>
      sumSeries(
        seriesByDay(
          tasks.filter((task) => task.status === 'completed' && task.completedAt),
          ACTIVITY_DAYS,
          today,
          (task) => dayKeyOf(task.completedAt),
        ),
        seriesByDay(workoutRecords, ACTIVITY_DAYS, today, (record) => record.date),
        seriesByDay(mealRecords, ACTIVITY_DAYS, today, (record) => record.date),
        journalSeries,
      ),
    [tasks, workoutRecords, mealRecords, journalSeries, today],
  );

  const completionSeries = useMemo(
    () =>
      seriesByDay(
        tasks.filter((task) => task.status === 'completed' && task.completedAt),
        14,
        today,
        (task) => dayKeyOf(task.completedAt),
      ),
    [tasks, today],
  );

  const activityTotal = sumOf(activitySeries.map((point) => point.value));
  const weekActivity = splitWindow(activitySeries.slice(-14));
  const weekCompletion = splitWindow(completionSeries);
  const completionChange = changeRate(weekCompletion.current, weekCompletion.previous);

  const pendingTasks = useMemo(() => tasks.filter((task) => task.status === 'pending'), [tasks]);
  const completedCount = tasks.length - pendingTasks.length;
  const todayTasks = pendingTasks.slice(0, 5);

  const focusTask = focusPick(pendingTasks, today);
  /** 列表里去掉已经单独摆在最上面的那一件，免得同一件事出现两次 */
  const restTasks = todayTasks.filter((task) => task.id !== focusTask?.id);

  const dueTodayTasks = tasks.filter((task) => task.dueDate === today);
  const dueTodayDone = dueTodayTasks.filter((task) => task.status === 'completed').length;
  const completedToday = tasks.filter(
    (task) => task.status === 'completed' && dayKeyOf(task.completedAt) === today,
  ).length;

  const streak = currentStreak(activitySeries, today);

  /** 今日心情卡：只读今天这一条，没有就提示去写 */
  const todayJournal = journalEntryOn(journalEntries, today);
  const journalStreak = currentStreak(journalSeries, today);
  const { toast } = useToast();

  /**
   * 点表情直接记下今天的心情（saveEntry 按天 upsert，标签与正文原样保留）。
   * 以前这里只会跳日记页，副标题却写着「挑一档就行」——affordance 骗人。
   * 点同一档是无效操作，不给 toast。
   */
  const recordMood = (level: MoodLevel): void => {
    if (todayJournal && clampMood(todayJournal.mood) === level) return;
    const previous = todayJournal;
    saveJournalEntry(today, {
      mood: level,
      tags: previous?.tags ?? [],
      text: previous?.text ?? '',
    });
    toast({
      tone: 'success',
      title: `已记下今天的心情：${moodLabel(level)}`,
      description: previous
        ? '心情已更新，写错了点「撤销」。'
        : '想补几个字？点右上角「写今天的日记」。',
      action: {
        label: '撤销',
        onClick: () => {
          if (previous) {
            saveJournalEntry(today, {
              mood: previous.mood,
              tags: previous.tags,
              text: previous.text,
            });
          } else {
            const created = useJournalStore
              .getState()
              .entries.find((entry) => entry.date === today);
            if (created) useJournalStore.getState().deleteEntry(created.id);
          }
        },
      },
    });
  };

  /** 页头那行元信息要念「已专注 N 次」，所以这里也得有一份今日专注汇总 */
  const todayFocus = useMemo(() => focusSummary(focusSessions, today), [focusSessions, today]);

  /** 目标达成：数字全走 metrics registry，与复盘页共用同一段取数 */
  const goalProgressList = useMemo(() => {
    const snapshot: MetricSnapshot = {
      tasks,
      focusSessions,
      fitnessRecords: workoutRecords,
      readingSessions,
      dietRecords: mealRecords,
      habits,
      workSessions,
    };
    return sortGoals(goals).map((goal) => goalProgress(goal, snapshot, today));
  }, [
    goals,
    tasks,
    focusSessions,
    workoutRecords,
    readingSessions,
    mealRecords,
    habits,
    workSessions,
    today,
  ]);
  const goalSummary = summarizeGoals(goalProgressList);

  const handleAddQuickTask = (): void => {
    const parsed = parseQuickTask(quickInput, today);
    if (!parsed.title) return;
    addTask(parsed.title, '', parsed.priority, parsed.dueDate);
    setQuickInput('');
  };

  const moduleCards = useMemo<ModuleCard[]>(() => {
    const today = todayKey();
    const reading = books.filter((book) => book.status === 'reading').length;
    const activeProjects = devProjects.filter((project) => project.status === 'in-progress').length;
    const totalWords = writingProjects.reduce((sum, project) => sum + project.wordCount, 0);
    const caloriesToday = mealRecords
      .filter((record) => record.date === today)
      .reduce((sum, record) => sum + record.totalCalories, 0);
    const playing = games.filter((game) => game.status === 'playing').length;

    return [
      {
        icon: BookOpen,
        label: '读书',
        stat: `${reading} 本在读`,
        detail: `书库共 ${books.length} 本`,
        tone: 'info',
        path: '/study/books',
      },
      {
        icon: Code2,
        label: '开发工作',
        stat: `${activeProjects} 个进行中`,
        detail: `项目共 ${devProjects.length} 个`,
        tone: 'accent',
        path: '/dev',
      },
      {
        icon: PenTool,
        label: '写作',
        stat: `${formatNumber(totalWords)} 字`,
        detail: `稿件共 ${writingProjects.length} 篇`,
        tone: 'success',
        path: '/study/writing',
      },
      {
        icon: Heart,
        label: '健身',
        stat: `累计 ${workoutRecords.length} 次`,
        detail:
          workoutRecords.length > 0
            ? `最近一次 ${workoutRecords[workoutRecords.length - 1]!.date}`
            : '还没有训练记录',
        tone: 'warning',
        path: '/health/fitness',
      },
      {
        icon: UtensilsCrossed,
        label: '饮食',
        stat: `${formatNumber(caloriesToday)} kcal`,
        detail: '今日已记录',
        tone: 'danger',
        path: '/health/diet',
      },
      {
        icon: Gamepad2,
        label: '游戏娱乐',
        stat: `${playing} 款在玩`,
        detail: `库中共 ${games.length} 款`,
        tone: 'info',
        path: '/games',
      },
    ];
  }, [books, devProjects, writingProjects, workoutRecords, mealRecords, games]);

  const handleAddMemo = (): void => {
    const content = memoInput.trim();
    if (!content) {
      setMemoError('先写点什么再保存');
      return;
    }
    addMemo(content);
    setMemoInput('');
    setMemoError(undefined);
  };

  /**
   * 仪表盘卡片。顺序、宽度、是否隐藏由 `lm:ui` 决定，这里只负责「每张卡片长什么样」。
   * content 为 null 表示当前没数据 —— 平时不占位，进编辑态会渲染成占位卡（见 DashboardGrid）。
   */
  const widgetViews: DashboardWidgetView[] = [
    {
      id: 'stats',
      title: '概览统计',
      content: (
        <StatStrip
          label="概览统计"
          items={[
            {
              label: '待办任务',
              value: pendingTasks.length,
              unit: '项',
              tone: 'accent',
              hint: `已完成 ${completedCount} 项`,
            },
            dueTodayTasks.length > 0
              ? {
                  label: '今日完成率',
                  value: Math.round((dueTodayDone / dueTodayTasks.length) * 100),
                  unit: '%',
                  tone: 'success',
                  hint: `今日到期 ${dueTodayDone}/${dueTodayTasks.length}`,
                }
              : {
                  label: '今日完成率',
                  value: completedToday,
                  unit: '项',
                  tone: 'success',
                  hint: '今天没有到期任务',
                },
            {
              label: '连续打卡',
              value: streak,
              unit: '天',
              tone: streak > 0 ? 'warning' : 'default',
              hint: '完成任务/训练/饮食都算',
            },
            {
              label: '近 7 天完成',
              value: weekCompletion.current,
              unit: '项',
              tone: 'success',
              trend: { value: completionChange, label: '较上一周' },
            },
          ]}
        />
      ),
    },
    {
      id: 'today',
      title: '今天',
      content: (
        <Card>
          <CardHeader
            title="今天"
            subtitle={
              focusTask ? '先做最该先做的一件，剩下的排在下面' : `${pendingTasks.length} 个待完成`
            }
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
                查看全部
              </Button>
            }
          />
          <CardBody>
            {focusTask && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-inset px-3.5 py-3">
                <Badge tone="accent">先做这件</Badge>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                  {focusTask.title}
                </span>
                <Badge tone={PRIORITY_BADGE[focusTask.priority].tone} dot>
                  {PRIORITY_BADGE[focusTask.priority].label}
                </Badge>
                <span className="text-xs text-content-tertiary tabular">
                  {whenHintOf(focusTask, today).text}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<CheckCircle2 size={14} aria-hidden />}
                  onClick={() => {
                    const snapshot = tasks;
                    toggleTaskStatus(focusTask.id);
                    undoableRemove({
                      message: `已完成「${focusTask.title}」`,
                      description: '点「撤销」可以还原。',
                      snapshot,
                      restore: replaceTasks,
                    });
                  }}
                >
                  一键完成
                </Button>
              </div>
            )}
            {todayTasks.length === 0 ? (
              <p className="flex items-center gap-2 rounded bg-inset px-3 py-2 text-sm text-content-secondary">
                <CheckCircle2 size={16} className="shrink-0 text-success" aria-hidden />
                待办清空了 —— 今天的都处理完了，下面直接加一件就行。
              </p>
            ) : (
              <ul className="space-y-1">
                {restTasks.map((task) => {
                  const when = whenHintOf(task, today);
                  return (
                    <li key={task.id} className="flex items-center gap-3 rounded px-1.5 py-1">
                      <CheckboxRow
                        className="min-w-0 flex-1"
                        checked={task.status === 'completed'}
                        onChange={() => toggleTaskStatus(task.id)}
                        label={task.title}
                      />
                      <Badge tone={PRIORITY_BADGE[task.priority].tone} dot>
                        {PRIORITY_BADGE[task.priority].label}
                      </Badge>
                      {when.scheduled ? (
                        <Badge tone="default">{when.text}</Badge>
                      ) : (
                        <span className="shrink-0 text-xs text-content-tertiary tabular">
                          {when.text}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-3 flex items-start gap-2 border-t border-line-subtle pt-3">
              <div className="relative min-w-0 flex-1">
                <Input
                  aria-label="快速添加任务"
                  className="pr-14"
                  value={quickInput}
                  onChange={(event) => setQuickInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleAddQuickTask();
                    }
                  }}
                  placeholder="加一件事…（写周报 !高 @今天）"
                />
                <Kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                  Enter
                </Kbd>
              </div>
              <IconButton
                label="添加任务"
                variant="primary"
                icon={<Plus size={16} />}
                onClick={handleAddQuickTask}
              />
            </div>
          </CardBody>
        </Card>
      ),
    },
    {
      id: 'focus',
      title: '专注',
      content: <FocusCard />,
    },
    {
      id: 'memos',
      title: '快速备忘',
      content: (
        <Card>
          <CardHeader title="快速备忘" subtitle={`${memos.length} 条 · 回车即可保存`} />
          <CardBody>
            {memos.length === 0 ? (
              <p className="flex items-center gap-2 rounded bg-inset px-3 py-2 text-sm text-content-secondary">
                <NotebookPen size={16} className="shrink-0 text-content-tertiary" aria-hidden />
                还没有备忘，随手记下临时想法，回车就保存。
              </p>
            ) : (
              <ul className="max-h-64 overflow-y-auto">
                {memos.slice(0, 10).map((memo) => (
                  <li
                    key={memo.id}
                    className="group flex items-start gap-2.5 border-t border-line-subtle py-2 first:border-t-0 first:pt-0.5"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong"
                    />
                    <p className="min-w-0 flex-1 text-sm text-content-secondary">{memo.content}</p>
                    <IconButton
                      label={`把备忘「${memo.content}」转为任务`}
                      size="sm"
                      icon={<ListPlus size={14} />}
                      onClick={() => addTask(memo.content, '', 'medium', '')}
                      className="opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-visible:opacity-100"
                    />
                    <IconButton
                      label="删除备忘"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={() => {
                        const snapshot = memos;
                        deleteMemo(memo.id);
                        undoableRemove({
                          message: '已删除备忘',
                          description: '点「撤销」可以恢复这条备忘。',
                          snapshot,
                          restore: replaceMemos,
                        });
                      }}
                      className="opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-visible:opacity-100"
                    />
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex items-start gap-2 border-t border-line-subtle pt-3">
              <div className="relative min-w-0 flex-1">
                <Input
                  aria-label="备忘内容"
                  className={memoError ? undefined : 'pr-14'}
                  value={memoInput}
                  onChange={(event) => {
                    setMemoInput(event.target.value);
                    if (memoError) setMemoError(undefined);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleAddMemo();
                    }
                  }}
                  placeholder="输入备忘内容…"
                  error={memoError}
                />
                {/* 有错误时下面多出一行红字，绝对定位的胶囊会偏，索性收起来 */}
                {!memoError && (
                  <Kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                    Enter
                  </Kbd>
                )}
              </div>
              <IconButton
                label="保存备忘"
                variant="primary"
                icon={<Send size={16} />}
                onClick={handleAddMemo}
              />
            </div>
          </CardBody>
        </Card>
      ),
    },
    {
      id: 'habits',
      title: '今日习惯',
      content:
        habits.length > 0 ? (
          <Card>
            <CardHeader
              title="今日习惯"
              subtitle={
                pendingHabitList.length === 0
                  ? '今天该打卡的都完成了'
                  : `还有 ${pendingHabitList.length} 个没打卡 · 点一下即可`
              }
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate('/growth/habits')}>
                  管理习惯
                </Button>
              }
            />
            <CardBody>
              {pendingHabitList.length === 0 ? (
                <p className="text-sm text-content-secondary">全部完成，明天继续保持 ✨</p>
              ) : (
                <ul className="space-y-1">
                  {pendingHabitList.slice(0, 6).map((habit) => {
                    const amount = habitAmountOn(habit, today);
                    return (
                      <li key={habit.id} className="flex items-center gap-3 rounded px-1.5 py-1">
                        <CheckboxRow
                          className="min-w-0 flex-1"
                          checked={false}
                          onChange={() => toggleHabitLog(habit.id, today)}
                          label={habit.name}
                        />
                        {habit.kind === 'count' && (
                          <Badge tone="info">
                            {amount}/{habitTarget(habit)} {habit.unit}
                          </Badge>
                        )}
                        <Badge tone="default" dot>
                          {scheduleLabel(habit.schedule)}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        ) : null,
    },
    {
      id: 'body',
      title: '身体指标',
      content: latestWeight ? (
        <Card>
          <CardHeader
            title="身体指标"
            subtitle={
              weightChange
                ? `较上次 ${formatDelta(weightChange.delta)} kg · 上次 ${formatMetric(weightChange.previous.value)} kg`
                : '第一次记录，坚持量下去就能看到趋势'
            }
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/health/fitness')}>
                记录
              </Button>
            }
          />
          <CardBody>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-semibold tabular text-content">
                    {formatMetric(latestWeight.value)}
                  </span>
                  <span className="text-xs text-content-tertiary">kg</span>
                </div>
                <p className="mt-1 truncate text-xs text-content-tertiary">
                  {latestBodyFat ? `体脂 ${formatMetric(latestBodyFat.value)}% · ` : ''}
                  {latestWeight.date}
                </p>
              </div>
              <div className="w-24 shrink-0">
                <Sparkline
                  data={weightPoints.map((point) => point.value)}
                  label="最近体重趋势"
                  height={36}
                />
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null,
    },
    {
      id: 'journal',
      title: '今日心情',
      content: (
        <Card>
          <CardHeader
            title="今日心情"
            subtitle={todayJournal ? '今天已记' : '今天还没写'}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/growth/journal')}>
                {todayJournal ? '去写日记' : '写今天的日记'}
              </Button>
            }
          />
          <CardBody>
            <div className="flex items-center gap-1.5">
              {MOOD_LEVELS.map((level) => {
                const active = todayJournal ? clampMood(todayJournal.mood) === level : false;
                return (
                  <button
                    key={level}
                    type="button"
                    aria-label={`记今天的心情：${moodLabel(level)}`}
                    aria-current={active ? 'true' : undefined}
                    aria-pressed={active}
                    onClick={() => recordMood(level)}
                    className={`grid h-8 w-8 place-items-center rounded-lg text-base transition-transform duration-fast ease-standard active:scale-90 motion-reduce:active:scale-100 ${
                      active
                        ? 'bg-accent-soft ring-1 ring-inset ring-accent-ring'
                        : 'bg-inset hover:bg-accent-soft'
                    }`}
                  >
                    <span aria-hidden>{MOOD_FACES[level]}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-xs text-content-tertiary">
              挑一档就行 —— 攒起来是一条能回看的曲线。已连续记录 {journalStreak} 天。
            </p>
            {todayJournal?.text && (
              <p className="mt-2 line-clamp-2 text-sm text-content-secondary">
                {todayJournal.text}
              </p>
            )}
          </CardBody>
        </Card>
      ),
    },
    {
      id: 'goals',
      title: '目标达成',
      /*
       * 样稿里「目标」是常驻的右列卡片。以前一条目标都没有就整张不渲染，
       * 首页看上去像「少了一块」；现在留着卡、给一句引导 —— 位置稳定，
       * 也不会因为今天没定目标就让右列忽然变短。
       */
      content: (
        <Card>
          <CardHeader
            title="目标达成"
            subtitle={
              goalProgressList.length > 0
                ? `${goalSummary.reached}/${goalSummary.total} 个已达成 · 数字从各模块记录现算`
                : '还没有目标'
            }
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/growth/goals')}>
                管理目标
              </Button>
            }
          />
          <CardBody>
            {goalProgressList.length > 0 ? (
              <GoalProgressList items={goalProgressList.slice(0, 4)} />
            ) : (
              <p className="flex items-center gap-2 rounded bg-inset px-3 py-2 text-sm text-content-secondary">
                <Target size={16} className="shrink-0 text-content-tertiary" aria-hidden />
                给「读书」「训练」这类指标定个数，这里就会长出进度条。
              </p>
            )}
          </CardBody>
        </Card>
      ),
    },
    {
      id: 'activity',
      title: '近 30 天活动',
      /*
       * 同样改成常驻：这 30 天一次记录都没有时，热力图位置交给 `ChartEmpty`
       * 写「暂无数据」，而不是让整张卡消失 —— 样稿里它是固定的一张。
       * 四个 KPI 照常摆出来（都是 0），那本身也是有用的读数。
       */
      content: (
        <Card>
          <CardHeader
            title="近 30 天活动"
            subtitle="完成任务 / 训练 / 饮食 / 写日记都算一次"
            action={<Badge tone={streak > 0 ? 'success' : 'default'}>连续 {streak} 天</Badge>}
          />
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            {activityTotal > 0 ? (
              <Heatmap data={activitySeries} label="近 30 天活动热力图" />
            ) : (
              <ChartEmpty
                label="近 30 天活动热力图"
                height={108}
                suffix="这 30 天还没有记录"
                className="shrink-0 sm:w-44"
              />
            )}
            <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-4">
              {[
                { label: '30 天合计', value: `${activityTotal} 次` },
                { label: '近 7 天', value: `${weekActivity.current} 次` },
                { label: '最长连续', value: `${longestStreak(activitySeries)} 天` },
                {
                  label: '有记录的天数',
                  value: `${activeDays(activitySeries).length} / ${activitySeries.length}`,
                },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-2sm text-content-tertiary">{item.label}</dt>
                  <dd className="mt-1 text-[17px] font-[620] tabular text-content">{item.value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      ),
    },
    {
      id: 'modules',
      title: '模块概览',
      content: (
        <section>
          <div className="mb-3">
            <h2 className="text-base font-semibold text-content">模块概览</h2>
            <p className="mt-0.5 text-2sm text-content-tertiary">点一下进对应模块</p>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {moduleCards.map((module) => {
              const Icon = module.icon;
              return (
                <Card
                  key={module.path}
                  onClick={() => navigate(module.path)}
                  className="rounded-md px-[11px] py-[10px]"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] ${TONE_CLASS[module.tone]}`}
                    >
                      <Icon size={14} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-2sm font-semibold text-content">{module.label}</p>
                      {/* 样稿的瓦片是两行：名字一行，「数字 · 补充」一行 */}
                      <p className="truncate text-2xs text-content-tertiary">
                        <span className="text-content-secondary">{module.stat}</span>
                        {' · '}
                        {module.detail}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ),
    },
  ];

  /**
   * 页头那行元信息。
   *
   * 每个片段自己带单位（「0/1」而不是干巴巴一个 0），彼此之间插一根竖线；
   * 这样一行里塞四件事也读得清 —— 老版本把它们揉成一句「今天是……今天有……其中……」
   * 的长句，赶上紧急项多的时候会折成两行半。
   */
  const heroMeta = [
    formatDateNumbers(),
    dueTodayTasks.length > 0
      ? `今日完成 ${dueTodayDone}/${dueTodayTasks.length}`
      : `今日完成 ${completedToday} 项`,
    `已专注 ${todayFocus.count} 次`,
    `连续记录 ${journalStreak} 天`,
  ];

  return (
    <div className="space-y-section">
      <PageHeader
        // eyebrow 给这一天一个坐标；星期只在这里出现一次，下面不再重复
        eyebrow={`第 ${isoWeekNumber()} 周 · ${weekdayName()}`}
        // 标题直接给结论：先看还剩几件事，再看别的
        title={
          pendingTasks.length > 0
            ? `${greeting()}，今天还剩 ${pendingTasks.length} 件事`
            : `${greeting()}，今天没有要赶的事了`
        }
        meta={heroMeta.map((item, index) => (
          <React.Fragment key={item}>
            {index > 0 && <MetaSeparator />}
            <span>{item}</span>
          </React.Fragment>
        ))}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<LayoutDashboard size={16} aria-hidden />}
              aria-pressed={editingLayout}
              onClick={() => setEditingLayout((previous) => !previous)}
            >
              {editingLayout ? '完成编辑' : '编辑布局'}
            </Button>
            <Button onClick={() => navigate('/tasks')}>管理今日计划</Button>
          </>
        }
      />

      <DashboardGrid
        widgets={dashboard}
        views={widgetViews}
        editing={editingLayout}
        onMove={moveDashboardWidget}
        onResize={setWidgetSize}
        onHide={setWidgetHidden}
        onReset={resetDashboard}
      />
    </div>
  );
};

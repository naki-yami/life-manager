import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CheckCircle2,
  Code2,
  Dumbbell,
  Flame,
  Gamepad2,
  LayoutDashboard,
  ListPlus,
  ListTodo,
  NotebookPen,
  PenTool,
  Plus,
  Send,
  Trash2,
  TrendingUp,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxRow,
  EmptyState,
  IconButton,
  Input,
  StatCard,
} from '../components/ui';
import { PageHeader } from '../components/layout';
import { DashboardGrid, type DashboardWidgetView } from '../components/dashboard';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { Heatmap, Sparkline } from '../components/charts';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useGameStore } from '../store/gameStore';
import { useHabitStore } from '../store/habitStore';
import { useUiStore } from '../store/uiStore';
import {
  dayKeyOf,
  daysBetween,
  formatLongDate,
  formatNumber,
  greeting,
  todayKey,
} from '../utils/date';
import {
  changeRate,
  currentStreak,
  seriesByDay,
  splitWindow,
  sumOf,
  sumSeries,
} from '../utils/stats';
import { habitAmountOn, habitTarget, pendingHabits, scheduleLabel } from '../utils/habits';
import { parseQuickTask } from '../utils/quickParse';
import type { Priority, Task } from '../types';

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
  const toggleHabitLog = useHabitStore((state) => state.toggleHabitLog);

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

  /** 完成任务 / 训练 / 饮食任意一条都算一次活动，用来喂热力图与环比 */
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
      ),
    [tasks, workoutRecords, mealRecords, today],
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
  const activityChange = changeRate(weekActivity.current, weekActivity.previous);
  const weekCompletion = splitWindow(completionSeries);
  const completionChange = changeRate(weekCompletion.current, weekCompletion.previous);

  const pendingTasks = useMemo(() => tasks.filter((task) => task.status === 'pending'), [tasks]);
  const completedCount = tasks.length - pendingTasks.length;
  const urgentTasks = pendingTasks.filter((task) => task.priority === 'high');
  const todayTasks = pendingTasks.slice(0, 5);

  const focusTask = focusPick(pendingTasks, today);

  const dueTodayTasks = tasks.filter((task) => task.dueDate === today);
  const dueTodayDone = dueTodayTasks.filter((task) => task.status === 'completed').length;
  const completedToday = tasks.filter(
    (task) => task.status === 'completed' && dayKeyOf(task.completedAt) === today,
  ).length;

  const streak = currentStreak(activitySeries, today);

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
        path: '/books',
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
        path: '/writing',
      },
      {
        icon: Dumbbell,
        label: '健身计划',
        stat: `累计 ${workoutRecords.length} 次`,
        detail:
          workoutRecords.length > 0
            ? `最近一次 ${workoutRecords[workoutRecords.length - 1]!.date}`
            : '还没有训练记录',
        tone: 'warning',
        path: '/fitness',
      },
      {
        icon: UtensilsCrossed,
        label: '饮食计划',
        stat: `${formatNumber(caloriesToday)} kcal`,
        detail: '今日已记录',
        tone: 'danger',
        path: '/diet',
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
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="待办任务"
            value={pendingTasks.length}
            tone="accent"
            icon={<ListTodo size={16} aria-hidden />}
            footer={`已完成 ${completedCount} 项`}
          />
          {dueTodayTasks.length > 0 ? (
            <StatCard
              label="今日完成率"
              value={Math.round((dueTodayDone / dueTodayTasks.length) * 100)}
              unit="%"
              tone="success"
              icon={<CheckCircle2 size={16} aria-hidden />}
              footer={`今日到期 ${dueTodayDone}/${dueTodayTasks.length}`}
            />
          ) : (
            <StatCard
              label="今日完成率"
              value={completedToday}
              unit="项"
              tone="success"
              icon={<CheckCircle2 size={16} aria-hidden />}
              footer="今天没有到期任务"
            />
          )}
          <StatCard
            label="连续打卡"
            value={streak}
            unit="天"
            tone={streak > 0 ? 'warning' : 'default'}
            icon={<Flame size={16} aria-hidden />}
            footer="完成任务/训练/饮食都算"
          />
          <StatCard
            label="近 7 天完成"
            value={weekCompletion.current}
            unit="项"
            tone="success"
            icon={<TrendingUp size={16} aria-hidden />}
            trend={{ value: completionChange, label: '较上一周' }}
            footer={
              <Sparkline
                data={completionSeries.map((point) => point.value)}
                label="近 14 天每日完成任务数趋势"
                tone="success"
                height={24}
              />
            }
          />
        </div>
      ),
    },
    {
      id: 'capture',
      title: '快速添加任务',
      content: (
        <Card>
          <CardHeader title="快速添加任务" subtitle="支持语法：写周报 !高 @今天" />
          <CardBody>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label="快速添加任务"
                  value={quickInput}
                  onChange={(event) => setQuickInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleAddQuickTask();
                    }
                  }}
                  placeholder="写周报 !高 @今天（!高/!中/!低 设优先级，@今天/@明天/@日期 设截止）"
                />
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
      title: '今日聚焦',
      content: focusTask ? (
        <Card>
          <CardHeader
            title="今日聚焦"
            subtitle="按逾期、今天到期与优先级自动挑出的最该先做的一件"
            action={<Badge tone="accent">先做这件</Badge>}
          />
          <CardBody>
            <div className="flex flex-wrap items-center gap-3">
              <Zap size={18} className="shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                {focusTask.title}
              </span>
              <Badge tone={PRIORITY_BADGE[focusTask.priority].tone} dot>
                {PRIORITY_BADGE[focusTask.priority].label}
              </Badge>
              {focusTask.dueDate && (
                <span className="text-xs text-content-tertiary tabular">
                  {focusTask.dueDate === today
                    ? '今天到期'
                    : focusTask.dueDate < today
                      ? `已逾期 ${daysBetween(focusTask.dueDate, today) ?? 1} 天`
                      : focusTask.dueDate}
                </span>
              )}
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
          </CardBody>
        </Card>
      ) : null,
    },
    {
      id: 'todos',
      title: '今日待办',
      content: (
        <Card>
          <CardHeader
            title="今日待办"
            subtitle={`${pendingTasks.length} 个待完成`}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
                查看全部
              </Button>
            }
          />
          <CardBody>
            {todayTasks.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={20} aria-hidden />}
                title="待办清空了"
                description="今天的任务都处理完了，可以去「今日计划」添加新的。"
                className="py-6"
              />
            ) : (
              <ul className="space-y-1">
                {todayTasks.map((task) => (
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
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ),
    },
    {
      id: 'memos',
      title: '快速备忘',
      content: (
        <Card>
          <CardHeader title="快速备忘" subtitle={`${memos.length} 条 · 回车即可保存`} />
          <CardBody>
            <div className="mb-3 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label="备忘内容"
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
              </div>
              <IconButton
                label="保存备忘"
                variant="primary"
                icon={<Send size={16} />}
                onClick={handleAddMemo}
              />
            </div>

            {memos.length === 0 ? (
              <EmptyState
                icon={<NotebookPen size={20} aria-hidden />}
                title="还没有备忘"
                description="随手记下临时想法，回车就保存。"
                className="py-6"
              />
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {memos.slice(0, 10).map((memo) => (
                  <li
                    key={memo.id}
                    className="group flex items-start gap-2 rounded bg-inset px-3 py-2"
                  >
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
                <Button variant="ghost" size="sm" onClick={() => navigate('/habits')}>
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
      id: 'activity',
      title: '近 30 天活动',
      content:
        activityTotal > 0 ? (
          <Card>
            <CardHeader
              title="近 30 天活动"
              subtitle={`近 7 天 ${weekActivity.current} 次，上一周 ${weekActivity.previous} 次`}
              action={
                <Badge tone={activityChange >= 0 ? 'success' : 'default'}>
                  环比 {activityChange >= 0 ? '+' : ''}
                  {activityChange}%
                </Badge>
              }
            />
            <CardBody>
              <Heatmap data={activitySeries} label="近 30 天活动热力图" />
            </CardBody>
          </Card>
        ) : null,
    },
    {
      id: 'modules',
      title: '模块概览',
      content: (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-content">模块概览</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moduleCards.map((module) => {
              const Icon = module.icon;
              return (
                <Card key={module.path} onClick={() => navigate(module.path)} className="p-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONE_CLASS[module.tone]}`}
                    >
                      <Icon size={20} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-content">{module.label}</p>
                      <p className="truncate text-xs text-content-secondary">{module.stat}</p>
                      <p className="truncate text-2xs text-content-tertiary">{module.detail}</p>
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

  return (
    <div className="space-y-section">
      <PageHeader
        title={`${greeting()} 👋`}
        description={`今天是 ${formatLongDate()} · ${
          pendingTasks.length > 0
            ? `今天有 ${pendingTasks.length} 件事待办${
                urgentTasks.length > 0 ? `，其中 ${urgentTasks.length} 件紧急` : ''
              }`
            : '今天暂无待办，可以安排点想做的事'
        }`}
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
            <Button variant="secondary" onClick={() => navigate('/tasks')}>
              管理今日计划
            </Button>
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

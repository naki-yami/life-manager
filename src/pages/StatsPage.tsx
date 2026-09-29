import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, BarChart3, CalendarCheck, Flame, TrendingUp } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ProgressRing,
  StatCard,
} from '../components/ui';
import { BarChart, Heatmap, Sparkline } from '../components/charts';
import { ProgressBar } from '../components/ui';
import { PageHeader } from '../components/layout';
import { GoalProgressList } from '../components/goals';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useGameStore } from '../store/gameStore';
import { useFocusStore } from '../store/focusStore';
import { useHabitStore } from '../store/habitStore';
import { useGoalStore } from '../store/goalStore';
import {
  activeDays,
  averageOf,
  currentStreak,
  percentOf,
  seriesByDay,
  seriesByWeek,
  sumOf,
  sumSeries,
} from '../utils/stats';
import { dayKeyOf, formatNumber, formatShortDate, todayKey } from '../utils/date';
import { goalProgress, sortGoals, summarizeGoals } from '../utils/goals';
import type { MetricSnapshot } from '../utils/metrics';

const WINDOW_DAYS = 30;
const CHART_DAYS = 14;

export const StatsPage: React.FC = () => {
  const navigate = useNavigate();
  const tasks = useTaskStore((state) => state.tasks);
  const books = useBookStore((state) => state.books);
  const devProjects = useDevStore((state) => state.projects);
  const writingProjects = useWritingStore((state) => state.projects);
  const fitnessRecords = useFitnessStore((state) => state.records);
  const dietRecords = useDietStore((state) => state.records);
  const games = useGameStore((state) => state.games);
  const devSessions = useDevStore((state) => state.sessions);
  const readingSessions = useBookStore((state) => state.sessions);
  const gameSessions = useGameStore((state) => state.sessions);
  const focusSessions = useFocusStore((state) => state.sessions);
  const habits = useHabitStore((state) => state.habits);
  const goals = useGoalStore((state) => state.goals);

  const today = todayKey();

  /** 目标达成：与首页、复盘共用 metrics registry，三处不会算出不同的数 */
  const goalProgressList = useMemo(() => {
    const snapshot: MetricSnapshot = {
      tasks,
      focusSessions,
      fitnessRecords,
      readingSessions,
      dietRecords,
      habits,
      workSessions: devSessions,
    };
    return sortGoals(goals).map((goal) => goalProgress(goal, snapshot, today));
  }, [
    goals,
    tasks,
    focusSessions,
    fitnessRecords,
    readingSessions,
    dietRecords,
    habits,
    devSessions,
    today,
  ]);
  const goalSummary = summarizeGoals(goalProgressList);

  const taskSeries = useMemo(
    () =>
      seriesByDay(
        tasks.filter((task) => task.status === 'completed' && task.completedAt),
        WINDOW_DAYS,
        today,
        (task) => dayKeyOf(task.completedAt),
      ),
    [tasks, today],
  );
  const fitnessSeries = useMemo(
    () => seriesByDay(fitnessRecords, WINDOW_DAYS, today, (record) => record.date),
    [fitnessRecords, today],
  );
  const dietCountSeries = useMemo(
    () => seriesByDay(dietRecords, WINDOW_DAYS, today, (record) => record.date),
    [dietRecords, today],
  );
  const calorieSeries = useMemo(
    () =>
      seriesByDay(
        dietRecords,
        WINDOW_DAYS,
        today,
        (record) => record.date,
        (record) => record.totalCalories,
      ),
    [dietRecords, today],
  );

  const activitySeries = useMemo(
    () => sumSeries(taskSeries, fitnessSeries, dietCountSeries),
    [taskSeries, fitnessSeries, dietCountSeries],
  );

  const taskChart = taskSeries.slice(-CHART_DAYS);
  const calorieChart = calorieSeries.slice(-CHART_DAYS);

  const completedInWindow = sumOf(taskSeries.map((point) => point.value));
  const workoutInWindow = sumOf(fitnessSeries.map((point) => point.value));
  const activityTotal = sumOf(activitySeries.map((point) => point.value));
  const streak = currentStreak(activitySeries, today);
  const trainedDays = activeDays(fitnessSeries).length;

  const lastWeekCalories = calorieSeries.slice(-7).filter((point) => point.value > 0);
  const averageCalories = averageOf(lastWeekCalories.map((point) => point.value));

  const readingBooks = books.filter((book) => book.status === 'reading');
  const readingProgress = averageOf(readingBooks.map((book) => book.progress));
  const finishedBooks = books.filter((book) => book.status === 'finished').length;

  const finishedWritings = writingProjects.filter(
    (project) => project.status === 'completed',
  ).length;
  const writingProgress = percentOf(finishedWritings, writingProjects.length);

  const devTasks = devProjects.flatMap((project) => project.tasks);
  const devDone = devTasks.filter((task) => task.status === 'done').length;
  const devProgress = percentOf(devDone, devTasks.length);

  const totalAchievements = games.reduce((sum, game) => sum + game.achievements.length, 0);
  const unlockedAchievements = games.reduce(
    (sum, game) => sum + game.achievements.filter((achievement) => achievement.unlocked).length,
    0,
  );
  const achievementProgress = percentOf(unlockedAchievements, totalAchievements);

  const hasAnyData =
    tasks.length > 0 ||
    books.length > 0 ||
    devProjects.length > 0 ||
    writingProjects.length > 0 ||
    fitnessRecords.length > 0 ||
    dietRecords.length > 0 ||
    games.length > 0;

/** 三类流水的近 8 周趋势（周一起始） */
  const WEEKS = 8;
  const devWeekly = useMemo(
    () => seriesByWeek(devSessions, WEEKS, today, (session) => session.date, (session) => session.hours),
    [devSessions, today],
  );
  const readingWeekly = useMemo(
    () =>
      seriesByWeek(readingSessions, WEEKS, today, (session) => session.date, (session) => session.minutes),
    [readingSessions, today],
  );
  const gameWeekly = useMemo(
    () => seriesByWeek(gameSessions, WEEKS, today, (session) => session.date, (session) => session.hours),
    [gameSessions, today],
  );

  /** 各模块的数据量分布 */
  const moduleDistribution = useMemo(
    () =>
      [
        { label: '今日计划', count: tasks.length, tone: 'success' as const },
        { label: '读书', count: books.length, tone: 'accent' as const },
        { label: '开发项目', count: devProjects.length, tone: 'accent' as const },
        { label: '写作', count: writingProjects.length, tone: 'success' as const },
        { label: '训练记录', count: fitnessRecords.length, tone: 'warning' as const },
        { label: '饮食记录', count: dietRecords.length, tone: 'danger' as const },
        { label: '游戏', count: games.length, tone: 'warning' as const },
      ].sort((a, b) => b.count - a.count),
    [tasks, books, devProjects, writingProjects, fitnessRecords, dietRecords, games],
  );
  const maxModuleCount = Math.max(1, ...moduleDistribution.map((item) => item.count));

  const rings = [
    {
      label: '阅读进度',
      value: readingProgress,
      tone: 'accent' as const,
      detail:
        readingBooks.length > 0
          ? `在读 ${readingBooks.length} 本 · 已读 ${finishedBooks} 本`
          : `暂无在读 · 已读 ${finishedBooks} 本`,
    },
    {
      label: '写作完成度',
      value: writingProgress,
      tone: 'success' as const,
      detail: `${finishedWritings}/${writingProjects.length} 个项目已完成`,
    },
    {
      label: '开发任务完成度',
      value: devProgress,
      tone: 'accent' as const,
      detail: `${devDone}/${devTasks.length} 个任务已完成`,
    },
    {
      label: '成就解锁',
      value: achievementProgress,
      tone: 'warning' as const,
      detail: `${unlockedAchievements}/${totalAchievements} 个成就已解锁`,
    },
  ];

  return (
    <div className="space-y-section">
      <PageHeader
        title="统计"
        description={`最近 ${WINDOW_DAYS} 天的活动趋势与各模块进度`}
        icon={BarChart3}
        meta={
          <>
            <Badge tone="accent">近 30 天活动 {formatNumber(activityTotal)} 次</Badge>
            {streak > 0 && (
              <Badge tone="success" dot>
                连续记录 {streak} 天
              </Badge>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="近 30 天完成任务"
          value={completedInWindow}
          unit="个"
          tone="success"
          icon={<CalendarCheck size={16} aria-hidden />}
          footer={
            <Sparkline
              data={taskChart.map((point) => point.value)}
              label="近 14 天每日完成任务数趋势"
              tone="success"
              height={28}
            />
          }
        />
        <StatCard
          label="近 30 天训练"
          value={workoutInWindow}
          unit="次"
          tone="accent"
          icon={<Activity size={16} aria-hidden />}
          footer={trainedDays > 0 ? `分布在 ${trainedDays} 天里` : '这段时间还没有训练记录'}
        />
        <StatCard
          label="近 7 天日均热量"
          value={formatNumber(averageCalories)}
          unit="kcal"
          tone="warning"
          icon={<Flame size={16} aria-hidden />}
          footer={
            lastWeekCalories.length > 0
              ? `按 ${lastWeekCalories.length} 天有记录的天数计算`
              : '最近 7 天还没有饮食记录'
          }
        />
        <StatCard
          label="连续记录"
          value={streak}
          unit="天"
          icon={<TrendingUp size={16} aria-hidden />}
          footer="任务 / 训练 / 饮食任意一天有记录即算"
        />
      </div>

      {!hasAnyData ? (
        <Card>
          <EmptyState
            icon={<BarChart3 size={22} aria-hidden />}
            title="还没有可统计的数据"
            description="先去「今日计划」「健身」「饮食」里记几笔，这里会自动长出趋势图。"
            action={<Button onClick={() => navigate('/tasks')}>去记一件事</Button>}
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title="活动热力图"
              subtitle={`最近 ${WINDOW_DAYS} 天，每天的任务完成、训练与饮食记录合起来算一次活动`}
            />
            <CardBody>
              <Heatmap data={activitySeries} label="最近 30 天活动热力图" />
            </CardBody>
          </Card>

          {goalProgressList.length > 0 && (
            <Card>
              <CardHeader
                title="目标达成"
                subtitle={`${goalSummary.reached}/${goalSummary.total} 个已达成 · 进度现算，不做快照`}
              />
              <CardBody>
                <GoalProgressList items={goalProgressList} className="lg:grid lg:grid-cols-2 lg:gap-x-8 lg:space-y-0" />
              </CardBody>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="任务完成趋势" subtitle={`最近 ${CHART_DAYS} 天每天完成的任务数`} />
              <CardBody>
                <BarChart
                  data={taskChart}
                  label="最近 14 天每日完成任务数"
                  tone="success"
                  formatValue={(value) => `${value} 个`}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="热量趋势" subtitle={`最近 ${CHART_DAYS} 天每天的摄入热量`} />
              <CardBody>
                <BarChart
                  data={calorieChart}
                  label="最近 14 天每日摄入热量"
                  tone="warning"
                  formatValue={(value) => `${formatNumber(value)} kcal`}
                />
              </CardBody>
            </Card>
          </div>

          {moduleDistribution.some((item) => item.count > 0) && (
            <Card>
              <CardHeader title="各模块数据分布" subtitle="每个模块累计的记录条数" />
              <CardBody className="space-y-3">
                {moduleDistribution.map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs text-content-secondary">{item.label}</span>
                    <ProgressBar
                      className="min-w-0 flex-1"
                      value={item.count}
                      max={maxModuleCount}
                      label={`${item.label} ${item.count} 条`}
                      tone={item.count > 0 ? item.tone : 'accent'}
                    />
                    <span className="w-10 shrink-0 text-right text-xs text-content-tertiary tabular">
                      {item.count}
                    </span>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {(devSessions.length > 0 || readingSessions.length > 0 || gameSessions.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-3">
              {devSessions.length > 0 && (
                <Card>
                  <CardHeader title="工时趋势" subtitle="近 8 周每周投入的开发工时" />
                  <CardBody>
                    <BarChart
                      data={devWeekly}
                      label="近 8 周每周投入工时"
                      formatValue={(value) => `${formatNumber(value)} 小时`}
                      formatDate={formatShortDate}
                    />
                  </CardBody>
                </Card>
              )}
              {readingSessions.length > 0 && (
                <Card>
                  <CardHeader title="阅读趋势" subtitle="近 8 周每周阅读时长" />
                  <CardBody>
                    <BarChart
                      data={readingWeekly}
                      label="近 8 周每周阅读分钟"
                      formatValue={(value) => `${formatNumber(value)} 分钟`}
                      formatDate={formatShortDate}
                    />
                  </CardBody>
                </Card>
              )}
              {gameSessions.length > 0 && (
                <Card>
                  <CardHeader title="游玩趋势" subtitle="近 8 周每周游玩时长" />
                  <CardBody>
                    <BarChart
                      data={gameWeekly}
                      label="近 8 周每周游玩小时"
                      formatValue={(value) => `${formatNumber(value)} 小时`}
                      formatDate={formatShortDate}
                    />
                  </CardBody>
                </Card>
              )}
            </div>
          )}

          <Card>
            <CardHeader title="各模块进度" subtitle="阅读 / 写作 / 开发 / 游戏的整体完成情况" />
            <CardBody>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {rings.map((ring) => (
                  <div key={ring.label} className="flex flex-col items-center gap-2 text-center">
                    <ProgressRing value={ring.value} label={ring.label} tone={ring.tone}>
                      {ring.value}%
                    </ProgressRing>
                    <div>
                      <p className="text-sm font-medium text-content">{ring.label}</p>
                      <p className="mt-0.5 text-2xs text-content-tertiary">{ring.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
};

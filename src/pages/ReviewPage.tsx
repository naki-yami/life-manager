import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, NotebookPen, Save, TrendingDown, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SegmentedControl,
  StatCard,
  Textarea,
} from '../components/ui';
import { PageHeader } from '../components/layout';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { useOptionalToast } from '../components/ui/toastContext';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useHabitStore } from '../store/habitStore';
import { useFocusStore } from '../store/focusStore';
import { useReviewStore, type ReviewAnswers } from '../store/reviewStore';
import {
  REVIEW_PERIODS,
  REVIEW_PERIOD_LABELS,
  findReview,
  hasAnswer,
  periodEndOf,
  periodLabel,
  periodStartOf,
  reviewKey,
  reviewMetrics,
  reviewQuestions,
  shiftPeriod,
  stalledProjects,
} from '../utils/review';
import { todayKey } from '../utils/date';
import type { ReviewEntry, ReviewPeriod } from '../types';

/**
 * 每日 / 每周复盘。
 *
 * 三个取舍：
 * - **数字是自动的，判断是手写的**：完成任务、专注时长这些从各模块流水现算，
 *   用户只需要回答三个问题 —— 复盘的价值在写下判断，不在多填字段；
 * - **一个周期一条，写第二次是修正**：切换周期时把已存的内容读回表单，
 *   保存走 store 的 upsert，不会攒出一堆「这周的 v2、v3」；
 * - **没写过内容的记录不占历史位**：只写了半句就搁下的，不算一次复盘。
 */

/** 历史列表最多回看多少条：再多也不该在页面上铺开，统计页才是看趋势的地方 */
const HISTORY_LIMIT = 6;

const PERIOD_OPTIONS: Array<{ value: ReviewPeriod; label: string }> = REVIEW_PERIODS.map(
  (period) => ({ value: period, label: REVIEW_PERIOD_LABELS[period] }),
);

const answersOf = (entry: ReviewEntry | undefined): ReviewAnswers => ({
  best: entry?.best ?? '',
  blocker: entry?.blocker ?? '',
  next: entry?.next ?? '',
});

const EMPTY_ANSWERS: ReviewAnswers = { best: '', blocker: '', next: '' };

const PLACEHOLDERS: Record<keyof ReviewAnswers, string> = {
  best: '写一件具体的事，比写「还行」有用得多',
  blocker: '时间、精力、还是外部打断？',
  next: '只写一件，写多了就等于没写',
};

export const ReviewPage: React.FC = () => {
  const reviews = useReviewStore((state) => state.reviews);
  const saveReview = useReviewStore((state) => state.saveReview);
  const deleteReview = useReviewStore((state) => state.deleteReview);
  const replaceReviews = useReviewStore((state) => state.replaceReviews);

  const tasks = useTaskStore((state) => state.tasks);
  const readingSessions = useBookStore((state) => state.sessions);
  const devProjects = useDevStore((state) => state.projects);
  const workSessions = useDevStore((state) => state.sessions);
  const writingProjects = useWritingStore((state) => state.projects);
  const workoutRecords = useFitnessStore((state) => state.records);
  const mealRecords = useDietStore((state) => state.records);
  const habits = useHabitStore((state) => state.habits);
  const focusSessions = useFocusStore((state) => state.sessions);

  const toast = useOptionalToast();
  const undoableRemove = useUndoableRemove();

  const today = todayKey();
  const [period, setPeriod] = useState<ReviewPeriod>('week');
  const [start, setStart] = useState(() => periodStartOf('week', today));

  const activeKey = reviewKey(period, start);
  const stored = findReview(reviews, period, start);

  // 「换周期就重置表单」用渲染期同步而不是 useEffect：effect 会先渲染一次旧内容再闪一下
  const [loadedKey, setLoadedKey] = useState(activeKey);
  const [draft, setDraft] = useState<ReviewAnswers>(() => answersOf(stored));
  if (loadedKey !== activeKey) {
    setLoadedKey(activeKey);
    setDraft(answersOf(stored));
  }

  const end = periodEndOf(period, start);
  const questions = reviewQuestions(period);

  const metrics = useMemo(
    () =>
      reviewMetrics(
        {
          tasks,
          focusSessions,
          fitnessRecords: workoutRecords,
          readingSessions,
          dietRecords: mealRecords,
          habits,
        },
        start,
        end,
      ),
    [tasks, focusSessions, workoutRecords, readingSessions, mealRecords, habits, start, end],
  );

  const stalled = useMemo(
    () => stalledProjects({ devProjects, workSessions, writingProjects }, end),
    [devProjects, workSessions, writingProjects, end],
  );

  const history = useMemo(
    () =>
      reviews
        .filter(hasAnswer)
        .sort((a, b) => b.date.localeCompare(a.date) || a.period.localeCompare(b.period)),
    [reviews],
  );

  const isCurrent = start === periodStartOf(period, today);
  const dirty = (['best', 'blocker', 'next'] as const).some(
    (key) => draft[key] !== (stored?.[key] ?? ''),
  );

  const switchPeriod = (next: ReviewPeriod): void => {
    setPeriod(next);
    setStart(periodStartOf(next, start));
  };

  const goToCurrent = (): void => setStart(periodStartOf(period, today));

  const openHistory = (entry: ReviewEntry): void => {
    setPeriod(entry.period);
    setStart(entry.date);
  };

  const handleSave = (): void => {
    saveReview(period, start, draft);
    setDraft({
      best: draft.best.trim(),
      blocker: draft.blocker.trim(),
      next: draft.next.trim(),
    });
    toast?.toast({
      tone: 'success',
      title: '复盘已保存',
      description: `${periodLabel(period, start)} · 三个问题都记下来了`,
    });
  };

  const handleDelete = (): void => {
    if (!stored) return;
    const snapshot = reviews;
    deleteReview(stored.id);
    setDraft(EMPTY_ANSWERS);
    undoableRemove({
      message: '已删除这次复盘',
      description: periodLabel(stored.period, stored.date),
      snapshot,
      restore: replaceReviews,
    });
  };

  return (
    <div className="space-y-section">
      <PageHeader
        icon={NotebookPen}
        title="复盘"
        description="把这一段时间看清楚：数字自动汇总，判断留给你自己写"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<ChevronLeft size={16} aria-hidden />}
              onClick={() => setStart((value) => shiftPeriod(period, value, -1))}
            >
              上一{period === 'week' ? '周' : '天'}
            </Button>
            <Button variant="secondary" disabled={isCurrent} onClick={goToCurrent}>
              {period === 'week' ? '回到本周' : '回到今天'}
            </Button>
            <Button
              variant="secondary"
              iconRight={<ChevronRight size={16} aria-hidden />}
              onClick={() => setStart((value) => shiftPeriod(period, value, 1))}
            >
              下一{period === 'week' ? '周' : '天'}
            </Button>
          </>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              label="复盘周期"
              value={period}
              onChange={switchPeriod}
              options={PERIOD_OPTIONS}
            />
            <span className="text-sm font-medium text-content">{periodLabel(period, start)}</span>
            {isCurrent && <Badge tone="accent">当前{period === 'week' ? '周' : '日'}</Badge>}
            {stored && !dirty && <Badge tone="success">已保存</Badge>}
            {dirty && <Badge tone="warning">有未保存的修改</Badge>}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {metrics.map((metric) => (
          <StatCard
            key={metric.key}
            label={metric.label}
            value={metric.value}
            unit={metric.unit || undefined}
            tone={metric.tone}
            footer={metric.footer}
          />
        ))}
      </div>

      {stalled.length > 0 && (
        <Card>
          <CardHeader
            title="停滞项目"
            subtitle={`${stalled.length} 个在推进的项目超过两周没有投入`}
          />
          <CardBody>
            <ul className="space-y-2">
              {stalled.map((project) => (
                <li key={`${project.kind}-${project.id}`} className="flex items-center gap-3">
                  <TrendingDown size={15} className="shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-content">
                    {project.name}
                  </span>
                  <Badge tone="default">{project.kind === 'dev' ? '开发' : '写作'}</Badge>
                  <span className="shrink-0 text-xs tabular text-content-tertiary">
                    已停 {project.idleDays} 天
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="这三个问题" subtitle="不用写得漂亮，写清楚就行" />
        <CardBody>
          <div className="space-y-4">
            <Textarea
              label={questions.best}
              value={draft.best}
              rows={2}
              placeholder={PLACEHOLDERS.best}
              onChange={(event) => setDraft((value) => ({ ...value, best: event.target.value }))}
            />
            <Textarea
              label={questions.blocker}
              value={draft.blocker}
              rows={2}
              placeholder={PLACEHOLDERS.blocker}
              onChange={(event) => setDraft((value) => ({ ...value, blocker: event.target.value }))}
            />
            <Textarea
              label={questions.next}
              value={draft.next}
              rows={2}
              placeholder={PLACEHOLDERS.next}
              onChange={(event) => setDraft((value) => ({ ...value, next: event.target.value }))}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={<Save size={15} aria-hidden />} onClick={handleSave}>
                保存这次复盘
              </Button>
              {stored && (
                <Button
                  variant="ghost"
                  icon={<Trash2 size={15} aria-hidden />}
                  onClick={handleDelete}
                >
                  删除
                </Button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="往期复盘" subtitle={`共 ${history.length} 次`} />
        <CardBody>
          {history.length === 0 ? (
            <EmptyState
              icon={<NotebookPen size={20} aria-hidden />}
              title="还没有写过复盘"
              description="先在上面写一次，之后这里会按时间倒序列出来。"
              className="py-6"
            />
          ) : (
            <ul className="space-y-3">
              {history.slice(0, HISTORY_LIMIT).map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => openHistory(entry)}
                    className="w-full rounded border border-line-subtle px-3 py-2 text-left transition-colors duration-fast hover:border-line hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="default">{entry.period === 'week' ? '周复盘' : '日复盘'}</Badge>
                      <span className="text-xs tabular text-content-secondary">
                        {periodLabel(entry.period, entry.date)}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-sm text-content">
                      {entry.best || entry.blocker || entry.next}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

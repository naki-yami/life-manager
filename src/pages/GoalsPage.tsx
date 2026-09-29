import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2, Trophy } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  IconButton,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  type SelectOption,
} from '../components/ui';
import { PageHeader } from '../components/layout';
import { GoalProgressList } from '../components/goals';
import { useOptionalToast } from '../components/ui/toastContext';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useHabitStore } from '../store/habitStore';
import { useFocusStore } from '../store/focusStore';
import { useGoalStore } from '../store/goalStore';
import {
  GOAL_PERIODS,
  GOAL_PERIOD_LABELS,
  findGoalConflict,
  goalProgress,
  goalRange,
  goalRangeLabel,
  groupGoalsByPeriod,
  sortGoals,
  summarizeGoals,
} from '../utils/goals';
import {
  GOAL_METRIC_IDS,
  METRICS,
  formatMetricValue,
  metricValue,
  type MetricSnapshot,
} from '../utils/metrics';
import { todayKey } from '../utils/date';
import type { Goal, GoalMetric, GoalPeriod } from '../types';

/**
 * 目标与达成率。
 *
 * 三个取舍：
 * - **进度永远是算出来的**：卡片上的百分比来自各模块流水，不是存下来的快照，
 *   所以补一条训练记录，目标立刻跟着动；
 * - **同一指标同一周期只留一条**：重复的目标只会让人不知道该看哪个，
 *   所以新建时撞车直接拦下来，并指向「改那一条」；
 * - **数字都走 registry**：`utils/metrics.ts` 是取数的唯一实现，
 *   复盘页的「训练次数」和这里的「每周训练 4 次」不会算出两个数。
 */

const METRIC_OPTIONS: SelectOption[] = GOAL_METRIC_IDS.map((id) => ({
  value: id,
  label: METRICS[id].label,
}));

const PERIOD_OPTIONS: Array<{ value: GoalPeriod; label: string }> = GOAL_PERIODS.map((period) => ({
  value: period,
  label: GOAL_PERIOD_LABELS[period],
}));

/** 新建时的默认指标：训练次数最好理解，也最常被设成目标 */
const DEFAULT_METRIC: GoalMetric = 'fitness.sessions';
const DEFAULT_PERIOD: GoalPeriod = 'week';

interface GoalForm {
  /** null 表示新建 */
  id: string | null;
  metric: GoalMetric;
  period: GoalPeriod;
  target: number | '';
}

const suggestedTarget = (metric: GoalMetric, period: GoalPeriod): number =>
  METRICS[metric].suggested[period];

/** 「每周训练次数」这类说法，按钮的可访问名称与提示都用它 */
const goalTitle = (goal: Pick<Goal, 'metric' | 'period'>): string =>
  `${GOAL_PERIOD_LABELS[goal.period]}${METRICS[goal.metric].label}`;

export const GoalsPage: React.FC = () => {
  const goals = useGoalStore((state) => state.goals);
  const addGoal = useGoalStore((state) => state.addGoal);
  const updateGoal = useGoalStore((state) => state.updateGoal);
  const removeGoal = useGoalStore((state) => state.removeGoal);
  const replaceGoals = useGoalStore((state) => state.replaceGoals);

  const tasks = useTaskStore((state) => state.tasks);
  const focusSessions = useFocusStore((state) => state.sessions);
  const fitnessRecords = useFitnessStore((state) => state.records);
  const readingSessions = useBookStore((state) => state.sessions);
  const dietRecords = useDietStore((state) => state.records);
  const habits = useHabitStore((state) => state.habits);
  const workSessions = useDevStore((state) => state.sessions);

  const toast = useOptionalToast();
  const undoableRemove = useUndoableRemove();

  const today = todayKey();
  const [form, setForm] = useState<GoalForm | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  const snapshot: MetricSnapshot = useMemo(
    () => ({
      tasks,
      focusSessions,
      fitnessRecords,
      readingSessions,
      dietRecords,
      habits,
      workSessions,
    }),
    [tasks, focusSessions, fitnessRecords, readingSessions, dietRecords, habits, workSessions],
  );

  const progressList = useMemo(
    () => sortGoals(goals).map((goal) => goalProgress(goal, snapshot, today)),
    [goals, snapshot, today],
  );
  const summary = summarizeGoals(progressList);

  const openCreate = (): void => {
    setError(undefined);
    setForm({
      id: null,
      metric: DEFAULT_METRIC,
      period: DEFAULT_PERIOD,
      target: suggestedTarget(DEFAULT_METRIC, DEFAULT_PERIOD),
    });
  };

  const openEdit = (goal: Goal): void => {
    setError(undefined);
    setForm({ id: goal.id, metric: goal.metric, period: goal.period, target: goal.target });
  };

  /** 换指标或周期时重算建议值：件和分钟不是同一把尺子，留着旧数字没有意义 */
  const patchForm = (patch: Partial<Pick<GoalForm, 'metric' | 'period'>>): void => {
    setError(undefined);
    setForm((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      return current.id === null
        ? { ...next, target: suggestedTarget(next.metric, next.period) }
        : next;
    });
  };

  const handleSubmit = (): void => {
    if (!form) return;
    const target = form.target === '' ? 0 : form.target;
    if (!Number.isFinite(target) || target < 1) {
      setError('目标值要是大于 0 的数字');
      return;
    }
    if (findGoalConflict(goals, form.metric, form.period, form.id ?? undefined)) {
      setError(`已经有一个「${goalTitle(form)}」目标了，改那一条更快。`);
      return;
    }

    if (form.id) updateGoal(form.id, { metric: form.metric, period: form.period, target });
    else addGoal({ metric: form.metric, period: form.period, target });

    toast?.toast({
      tone: 'success',
      title: form.id ? '目标已更新' : '目标已创建',
      description: `${goalRangeLabel(form.period, today)} · ${goalTitle(form)} ${formatMetricValue(form.metric, target)}`,
    });
    setForm(null);
  };

  const handleDelete = (goal: Goal): void => {
    const goalsSnapshot = goals;
    removeGoal(goal.id);
    undoableRemove({
      message: '已删除目标',
      description: `「${goalTitle(goal)}」不再出现在首页与统计页。`,
      snapshot: goalsSnapshot,
      restore: replaceGoals,
    });
  };

  const formCurrent = form ? metricValue(form.metric, snapshot, goalRange(form.period, today)) : 0;

  return (
    <div className="space-y-section">
      <PageHeader
        title="目标"
        description={
          summary.total === 0
            ? '给想坚持的事定个数字，进度从各模块记录里自动算'
            : `${summary.total} 个目标，已达成 ${summary.reached} 个 · 数字全部现算，补一条记录就会跟着动`
        }
        actions={
          <Button icon={<Plus size={16} aria-hidden />} onClick={openCreate}>
            新建目标
          </Button>
        }
      />

      {goals.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<Trophy size={20} aria-hidden />}
              title="还没有目标"
              description="例如「每周训练 4 次」「每月读 10 小时」，进度由训练与阅读记录自动累计。"
              action={<Button onClick={openCreate}>新建目标</Button>}
            />
          </CardBody>
        </Card>
      ) : (
        groupGoalsByPeriod(goals).map((group) => {
          const items = progressList.filter((item) => item.goal.period === group.period);
          const reached = items.filter((item) => item.reached).length;
          return (
            <Card key={group.period}>
              <CardHeader
                title={GOAL_PERIOD_LABELS[group.period]}
                subtitle={`${goalRangeLabel(group.period, today)} · ${reached}/${items.length} 个已达成`}
              />
              <CardBody>
                <GoalProgressList
                  items={items}
                  showPeriod={false}
                  renderActions={(item) => (
                    <>
                      <IconButton
                        size="sm"
                        label={`编辑「${goalTitle(item.goal)}」`}
                        icon={<Pencil size={14} />}
                        onClick={() => openEdit(item.goal)}
                      />
                      <IconButton
                        size="sm"
                        label={`删除「${goalTitle(item.goal)}」`}
                        icon={<Trash2 size={14} />}
                        onClick={() => handleDelete(item.goal)}
                      />
                    </>
                  )}
                />
              </CardBody>
            </Card>
          );
        })
      )}

      <Modal
        isOpen={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? '编辑目标' : '新建目标'}
        description="进度从各模块记录里现算，这里只需要定一个数字。"
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              取消
            </Button>
            <Button onClick={handleSubmit}>保存</Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <Select
              label="指标"
              value={form.metric}
              onChange={(value) => patchForm({ metric: value as GoalMetric })}
              options={METRIC_OPTIONS}
              hint="热量日均不在列表里：「越低越好」的指标算不了达成率"
            />

            <div>
              <p className="mb-1.5 text-sm font-medium text-content-secondary">周期</p>
              <SegmentedControl
                label="目标周期"
                value={form.period}
                onChange={(period) => patchForm({ period })}
                options={PERIOD_OPTIONS}
              />
              <p className="mt-1.5 text-xs text-content-tertiary">
                当前区间：{goalRangeLabel(form.period, today)}
              </p>
            </div>

            <div className="w-40">
              <NumberInput
                label="目标值"
                min={1}
                value={form.target}
                onChange={(value) => {
                  setError(undefined);
                  setForm({ ...form, target: value });
                }}
              />
            </div>

            <p className="text-xs text-content-tertiary">
              这一周期已经记下 {formatMetricValue(form.metric, formCurrent)}。
            </p>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

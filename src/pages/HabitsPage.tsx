import React, { useCallback, useMemo, useState } from 'react';
import { Check, Flame, Pencil, Plus, Sparkles, Target, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  IconButton,
  Input,
  Modal,
  NumberInput,
  ProgressBar,
  SegmentedControl,
  StatStrip,
} from '../components/ui';
import { PageHeader } from '../components/layout';
import { useHabitStore } from '../store/habitStore';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { useNewEntryShortcut } from '../hooks/useShortcuts';
import { useOptionalToast } from '../components/ui/toastContext';
import {
  goalLabel,
  habitAmountOn,
  habitDoneCount,
  habitStrength,
  habitStreak,
  habitTarget,
  isHabitDoneOn,
  pendingHabits,
  scheduleLabel,
  strengthLabel,
  weeklyDoneCount,
  weeklyTarget,
} from '../utils/habits';
import { addDays, formatDayLabel, formatShortDate, todayKey } from '../utils/date';
import type { Habit, HabitKind, HabitScheduleKind } from '../types';

/** 每行展示最近 7 天：既是一周的自然跨度，也正好对上「每周 N 次」的节奏 */
const STRIP_DAYS = 7;
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

/** 日期键 -> 单字星期（周一开始），用于格子顶部 */
function weekdayLabel(day: string): string {
  const [year, month, date] = day.split('-').map((part) => Number(part));
  if (!year || !month || !date) return '';
  return WEEKDAY_LABELS[(new Date(year, month - 1, date).getDay() + 6) % 7]!;
}

interface HabitDraft {
  name: string;
  kind: HabitKind;
  target: number;
  unit: string;
  scheduleKind: HabitScheduleKind;
  timesPerWeek: number;
  everyDays: number;
}

const emptyDraft = (): HabitDraft => ({
  name: '',
  kind: 'binary',
  target: 1,
  unit: '',
  scheduleKind: 'daily',
  timesPerWeek: 3,
  everyDays: 2,
});

const draftOf = (habit: Habit): HabitDraft => ({
  name: habit.name,
  kind: habit.kind,
  target: habitTarget(habit),
  unit: habit.unit,
  scheduleKind: habit.schedule.kind,
  timesPerWeek: weeklyTarget(habit.schedule),
  everyDays: Math.max(1, Math.round(habit.schedule.everyDays)),
});

interface DraftState {
  /** 有 id 是编辑，没有就是新建 */
  id?: string;
  values: HabitDraft;
}

const KIND_OPTIONS: Array<{ value: HabitKind; label: string }> = [
  { value: 'binary', label: '做到即可' },
  { value: 'count', label: '计数量' },
];

const SCHEDULE_OPTIONS: Array<{ value: HabitScheduleKind; label: string }> = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周 N 次' },
  { value: 'interval', label: '每 N 天' },
];

/** 强度分数的配色：越高越「稳」 */
function strengthTone(strength: number): 'success' | 'accent' | 'warning' {
  if (strength >= 0.8) return 'success';
  if (strength >= 0.4) return 'accent';
  return 'warning';
}

export const HabitsPage: React.FC = () => {
  const { habits, addHabit, updateHabit, deleteHabit, toggleHabitLog, replaceHabits } =
    useHabitStore();
  const undoableRemove = useUndoableRemove();
  // 页面在测试里经常被单独挂载（没有 ToastProvider），用可选版本不抛错
  const toastContext = useOptionalToast();

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();

  const today = todayKey();
  const days = useMemo(
    () => Array.from({ length: STRIP_DAYS }, (_, index) => addDays(today, index - STRIP_DAYS + 1)),
    [today],
  );

  const closeDraft = useCallback((): void => {
    setDraft(null);
    setNameError(undefined);
  }, []);

  const openCreate = useCallback((): void => {
    setDraft({ values: emptyDraft() });
    setNameError(undefined);
  }, []);

  const openEdit = useCallback((habit: Habit): void => {
    setDraft({ id: habit.id, values: draftOf(habit) });
    setNameError(undefined);
  }, []);

  useNewEntryShortcut(openCreate);

  const patchDraft = (patch: Partial<HabitDraft>): void =>
    setDraft((current) =>
      current ? { ...current, values: { ...current.values, ...patch } } : current,
    );

  const handleSubmit = (): void => {
    if (!draft) return;
    const name = draft.values.name.trim();
    if (name === '') {
      setNameError('给习惯起个名字吧');
      return;
    }

    const schedule = {
      kind: draft.values.scheduleKind,
      timesPerWeek: draft.values.timesPerWeek,
      everyDays: draft.values.everyDays,
    };
    const payload = {
      name,
      kind: draft.values.kind,
      target: draft.values.kind === 'count' ? draft.values.target : 1,
      unit: draft.values.kind === 'count' ? draft.values.unit : '',
      schedule,
    };

    if (draft.id) updateHabit(draft.id, payload);
    else addHabit(payload);

    toastContext?.toast({ title: draft.id ? '已更新习惯' : '已新建习惯', tone: 'success' });
    closeDraft();
  };

  const handleDelete = (habit: Habit): void => {
    const snapshot = habits;
    deleteHabit(habit.id);
    undoableRemove({
      message: '已删除习惯',
      description: `「${habit.name}」的打卡记录也一起删掉了，点「撤销」可以恢复。`,
      snapshot,
      restore: replaceHabits,
    });
  };

  const pending = useMemo(() => pendingHabits(habits, today), [habits, today]);

  const summary = useMemo(() => {
    if (habits.length === 0) {
      return { average: 0, doneToday: 0, bestStreak: 0, weekCount: 0 };
    }
    const strengths = habits.map((habit) => habitStrength(habit, today));
    return {
      average: strengths.reduce((sum, value) => sum + value, 0) / habits.length,
      doneToday: habits.filter((habit) => isHabitDoneOn(habit, today)).length,
      bestStreak: habits.reduce((max, habit) => Math.max(max, habitStreak(habit, today)), 0),
      weekCount: habits.reduce((sum, habit) => sum + habitDoneCount(habit, today, STRIP_DAYS), 0),
    };
  }, [habits, today]);

  return (
    <div className="space-y-section">
      <PageHeader
        title="习惯养成"
        description="点格子就是打卡，再点一下撤销；断签不会清零，强度分会慢慢回落。"
        actions={
          <Button icon={<Plus size={16} aria-hidden />} onClick={openCreate}>
            新建习惯
          </Button>
        }
      />

      {habits.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<Target size={24} aria-hidden />}
              title="还没有习惯"
              description="从一个每天都能做到的小事开始，例如「喝水 8 杯」或「读书 20 分钟」。"
              action={
                <Button icon={<Plus size={16} aria-hidden />} onClick={openCreate}>
                  新建第一个习惯
                </Button>
              }
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <StatStrip
            label="习惯概览"
            items={[
              {
                label: '今日完成',
                value: `${summary.doneToday}/${habits.length}`,
                unit: '个',
                icon: <Check size={16} aria-hidden />,
              },
              {
                label: '平均强度',
                value: Math.round(summary.average * 100),
                unit: '%',
                icon: <Sparkles size={16} aria-hidden />,
                hint: strengthLabel(summary.average),
              },
              {
                label: '最长连续',
                value: summary.bestStreak,
                unit: '次',
                icon: <Flame size={16} aria-hidden />,
              },
              { label: '近 7 天打卡', value: summary.weekCount, unit: '次' },
            ]}
          />

          {pending.length > 0 && (
            <Card>
              <CardHeader
                title="今天还没打卡"
                subtitle={`还有 ${pending.length} 个，点一下就好`}
                action={<Badge tone="warning">待打卡</Badge>}
              />
              <CardBody>
                <ul className="flex flex-wrap gap-2">
                  {pending.map((habit) => {
                    const amount = habitAmountOn(habit, today);
                    const target = habitTarget(habit);
                    return (
                      <li key={habit.id}>
                        <button
                          type="button"
                          onClick={() => toggleHabitLog(habit.id, today)}
                          aria-label={
                            habit.kind === 'count'
                              ? `给「${habit.name}」记一次，当前 ${amount}/${target}`
                              : `打卡「${habit.name}」`
                          }
                          className="flex items-center gap-2 rounded-full border border-line-subtle bg-inset px-3 py-1.5 text-sm text-content-secondary transition-colors duration-fast ease-standard hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                        >
                          <Plus size={14} aria-hidden />
                          <span>{habit.name}</span>
                          {habit.kind === 'count' && (
                            <span className="text-xs text-content-tertiary tabular">
                              {amount}/{target}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="全部习惯"
              subtitle="每行是最近 7 天，最右边是今天"
              action={<Badge tone="info">共 {habits.length} 个</Badge>}
            />
            <CardBody>
              <ul className="space-y-3">
                {habits.map((habit) => {
                  const strength = habitStrength(habit, today);
                  const streak = habitStreak(habit, today);
                  const target = habitTarget(habit);
                  return (
                    <li key={habit.id} className="rounded border border-line-subtle p-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                        <div className="min-w-0 flex-1 basis-56">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium text-content">
                              {habit.name}
                            </p>
                            <Badge tone="default">{scheduleLabel(habit.schedule)}</Badge>
                            {habit.kind === 'count' && (
                              <Badge tone="info">{goalLabel(habit)}</Badge>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <ProgressBar
                              className="w-28"
                              value={Math.round(strength * 100)}
                              tone={strengthTone(strength)}
                              label={`「${habit.name}」的强度`}
                            />
                            <span className="text-xs text-content-tertiary tabular">
                              {Math.round(strength * 100)}% · {strengthLabel(strength)}
                            </span>
                            {streak > 0 && (
                              <span className="flex items-center gap-1 text-xs text-content-tertiary">
                                <Flame size={12} aria-hidden />
                                连续 {streak} 次
                              </span>
                            )}
                            {habit.schedule.kind === 'weekly' && (
                              <span className="text-xs text-content-tertiary tabular">
                                本周 {weeklyDoneCount(habit, today)}/{weeklyTarget(habit.schedule)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div
                          role="group"
                          aria-label={`「${habit.name}」最近 7 天打卡`}
                          className="flex gap-1"
                        >
                          {days.map((day) => {
                            const done = isHabitDoneOn(habit, day);
                            const amount = habitAmountOn(habit, day);
                            const isToday = day === today;
                            return (
                              <button
                                key={day}
                                type="button"
                                aria-pressed={done}
                                aria-current={isToday ? 'date' : undefined}
                                aria-label={`${formatDayLabel(day)}「${habit.name}」${
                                  done
                                    ? '已完成，点击撤销'
                                    : amount > 0
                                      ? `已记 ${amount}/${target}，点击继续`
                                      : '打卡'
                                }`}
                                onClick={() => toggleHabitLog(habit.id, day)}
                                className={`flex h-11 w-9 flex-col items-center justify-center gap-0.5 rounded-sm border text-2xs transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
                                  done
                                    ? 'border-accent bg-accent-soft text-accent'
                                    : amount > 0
                                      ? 'border-info bg-info-soft text-info'
                                      : 'border-line-subtle bg-inset text-content-tertiary hover:text-content-secondary'
                                } ${isToday ? 'ring-1 ring-line-focus' : ''}`}
                              >
                                <span aria-hidden>{weekdayLabel(day)}</span>
                                <span aria-hidden className="tabular font-medium">
                                  {habit.kind === 'count' && amount > 0 ? (
                                    amount
                                  ) : done ? (
                                    <Check size={12} aria-hidden />
                                  ) : (
                                    formatShortDate(day)
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-1">
                          <IconButton
                            size="sm"
                            label={`编辑「${habit.name}」`}
                            icon={<Pencil size={14} />}
                            onClick={() => openEdit(habit)}
                          />
                          <IconButton
                            size="sm"
                            label={`删除「${habit.name}」`}
                            icon={<Trash2 size={14} />}
                            onClick={() => handleDelete(habit)}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </>
      )}

      <Modal
        isOpen={draft !== null}
        onClose={closeDraft}
        title={draft?.id ? '编辑习惯' : '新建习惯'}
        description="打卡只记有打卡的日子，断签不会清零；强度分来自近期完成率的加权平均。"
        footer={
          <>
            <Button variant="secondary" onClick={closeDraft}>
              取消
            </Button>
            <Button onClick={handleSubmit}>保存</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Input
              label="习惯名称"
              value={draft.values.name}
              onChange={(event) => patchDraft({ name: event.target.value })}
              placeholder="例如：晨跑 20 分钟 / 喝水 8 杯"
              error={nameError}
              required
            />

            <div>
              <p className="mb-1.5 text-sm font-medium text-content-secondary">记录方式</p>
              <SegmentedControl
                label="记录方式"
                value={draft.values.kind}
                onChange={(kind) => patchDraft({ kind })}
                options={KIND_OPTIONS}
              />
              <p className="mt-1.5 text-xs text-content-tertiary">
                计数量用于「8 杯水」这类需要累计的习惯
              </p>
            </div>

            {draft.values.kind === 'count' && (
              <div className="flex flex-wrap gap-3">
                <div className="w-36">
                  <NumberInput
                    label="目标数量"
                    min={1}
                    value={draft.values.target}
                    onChange={(value) => patchDraft({ target: value === '' ? 1 : value })}
                  />
                </div>
                <div className="w-36">
                  <Input
                    label="单位"
                    value={draft.values.unit}
                    onChange={(event) => patchDraft({ unit: event.target.value })}
                    placeholder="杯 / 公里 / 页"
                  />
                </div>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-sm font-medium text-content-secondary">节奏</p>
              <SegmentedControl
                label="节奏"
                value={draft.values.scheduleKind}
                onChange={(scheduleKind) => patchDraft({ scheduleKind })}
                options={SCHEDULE_OPTIONS}
              />
            </div>

            {draft.values.scheduleKind === 'weekly' && (
              <div className="w-36">
                <NumberInput
                  label="每周次数"
                  min={1}
                  max={7}
                  value={draft.values.timesPerWeek}
                  onChange={(value) => patchDraft({ timesPerWeek: value === '' ? 1 : value })}
                />
              </div>
            )}

            {draft.values.scheduleKind === 'interval' && (
              <div className="w-36">
                <NumberInput
                  label="间隔天数"
                  min={1}
                  max={365}
                  value={draft.values.everyDays}
                  onChange={(value) => patchDraft({ everyDays: value === '' ? 1 : value })}
                  suffix="天"
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

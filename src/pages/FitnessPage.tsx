import React, { useMemo, useState } from 'react';
import { CalendarDays, Dumbbell, ListChecks, Plus, Trash2, TrendingUp, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Divider,
  EmptyState,
  IconButton,
  Input,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  StatCard,
} from '../components/ui';
import { PageHeader, Toolbar } from '../components/layout';
import { BarChart, Heatmap } from '../components/charts';
import { useFitnessStore } from '../store/fitnessStore';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { filterByKeyword } from '../utils/search';
import { formatNumber, todayKey } from '../utils/date';
import { activeDays, seriesByDay, seriesByWeek } from '../utils/stats';

type View = 'plans' | 'records';

interface ExerciseDraft {
  name: string;
  sets: number;
  reps: number;
  weight: number;
}

const emptyExercise = (): ExerciseDraft => ({ name: '', sets: 3, reps: 10, weight: 0 });

const emptyWorkoutForm = (): {
  planName: string;
  date: string;
  exercises: ExerciseDraft[];
  notes: string;
} => ({
  planName: '',
  date: todayKey(),
  exercises: [emptyExercise()],
  notes: '',
});

/** 训练容量 = 组数 × 次数 × 重量，用来衡量整体训练量 */
const volumeOf = (exercises: Array<{ sets: number; reps: number; weight: number }>): number =>
  exercises.reduce((sum, ex) => sum + ex.sets * ex.reps * ex.weight, 0);

/** 本周一（含）之后的日期键，用于统计本周训练次数 */
const weekStartKey = (): string => {
  const now = new Date();
  const offset = (now.getDay() + 6) % 7;
  return todayKey(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000));
};

/** 热力图看长期习惯，所以窗口比图表长得多 */
const HEATMAP_DAYS = 91;
const TREND_DAYS = 14;
const WEEK_BUCKETS = 8;

export const FitnessPage: React.FC = () => {
  const {
    plans,
    records,
    addPlan,
    deletePlan,
    addRecord,
    deleteRecord,
    replacePlans,
    replaceRecords,
  } = useFitnessStore();
  const undoableRemove = useUndoableRemove();

  const [view, setView] = useState<View>('plans');
  const [keyword, setKeyword] = useState('');
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [pendingRecordId, setPendingRecordId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState({ name: '', description: '' });
  const [workoutForm, setWorkoutForm] = useState(emptyWorkoutForm);

  const totalVolume = records.reduce((sum, record) => sum + volumeOf(record.exercises), 0);
  const weekStart = weekStartKey();
  const today = todayKey();
  const thisWeekCount = records.filter(
    (record) => record.date >= weekStart && record.date <= today,
  ).length;

  const trainingSeries = useMemo(
    () => seriesByDay(records, HEATMAP_DAYS, today, (record) => record.date),
    [records, today],
  );
  const trendSeries = useMemo(
    () => seriesByDay(records, TREND_DAYS, today, (record) => record.date),
    [records, today],
  );
  const weeklyVolume = useMemo(
    () =>
      seriesByWeek(
        records,
        WEEK_BUCKETS,
        today,
        (record) => record.date,
        (record) => volumeOf(record.exercises),
      ),
    [records, today],
  );
  const recentTrainingDays = activeDays(trendSeries).length;

  const visiblePlans = useMemo(
    () => filterByKeyword(plans, keyword, (plan) => [plan.name, plan.description]),
    [plans, keyword],
  );

  const visibleRecords = useMemo(
    () =>
      filterByKeyword(records, keyword, (record) => [
        record.planName,
        record.notes,
        ...record.exercises.map((exercise) => exercise.name),
      ]),
    [records, keyword],
  );

  const groupedRecords = useMemo(() => {
    const sorted = [...visibleRecords].sort((a, b) => b.date.localeCompare(a.date));
    return sorted.reduce<Array<{ date: string; items: typeof sorted }>>((groups, record) => {
      const last = groups[groups.length - 1];
      if (last && last.date === record.date) last.items.push(record);
      else groups.push({ date: record.date, items: [record] });
      return groups;
    }, []);
  }, [visibleRecords]);

  const pendingPlan = plans.find((plan) => plan.id === pendingPlanId) ?? null;
  const pendingRecord = records.find((record) => record.id === pendingRecordId) ?? null;

  const openPlanModal = (): void => {
    setPlanForm({ name: '', description: '' });
    setShowPlanModal(true);
  };

  const openWorkoutModal = (planName = ''): void => {
    setWorkoutForm({ ...emptyWorkoutForm(), planName });
    setShowWorkoutModal(true);
  };

  const handleAddPlan = (): void => {
    const name = planForm.name.trim();
    if (!name) return;
    addPlan(name, planForm.description.trim());
    setShowPlanModal(false);
  };

  const updateExercise = (index: number, patch: Partial<ExerciseDraft>): void => {
    setWorkoutForm((form) => ({
      ...form,
      exercises: form.exercises.map((exercise, i) =>
        i === index ? { ...exercise, ...patch } : exercise,
      ),
    }));
  };

  const handleLogWorkout = (): void => {
    const validExercises = workoutForm.exercises.filter((exercise) => exercise.name.trim());
    if (validExercises.length === 0) return;
    addRecord(
      workoutForm.planName,
      workoutForm.date,
      validExercises.map((exercise) => ({ ...exercise, name: exercise.name.trim() })),
      workoutForm.notes.trim(),
    );
    setShowWorkoutModal(false);
  };

  const canSaveWorkout = workoutForm.exercises.some((exercise) => exercise.name.trim());

  return (
    <div className="space-y-section">
      <PageHeader
        title="健身"
        description="训练计划与每次训练的动作、组次记录"
        icon={Dumbbell}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Plus size={16} aria-hidden />}
              onClick={() => openWorkoutModal()}
            >
              记录训练
            </Button>
            <Button icon={<Plus size={16} aria-hidden />} onClick={openPlanModal}>
              新建计划
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="训练计划数"
          value={plans.length}
          unit="个"
          icon={<ListChecks size={16} aria-hidden />}
        />
        <StatCard
          label="训练记录数"
          value={records.length}
          unit="次"
          icon={<Dumbbell size={16} aria-hidden />}
        />
        <StatCard
          label="本周训练"
          value={thisWeekCount}
          unit="次"
          tone="accent"
          icon={<CalendarDays size={16} aria-hidden />}
          footer={thisWeekCount === 0 ? '本周还没练' : `近 14 天有 ${recentTrainingDays} 天练过`}
        />
        <StatCard
          label="累计容量"
          value={formatNumber(totalVolume)}
          unit="kg"
          icon={<TrendingUp size={16} aria-hidden />}
        />
      </div>

      {records.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="训练频率"
              subtitle={`最近 ${HEATMAP_DAYS} 天里哪些日子练过，颜色越深练得越多`}
            />
            <CardBody>
              <Heatmap data={trainingSeries} label="最近 91 天训练频率热力图" />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="每周训练容量"
              subtitle={`最近 ${WEEK_BUCKETS} 周的总容量（组数 × 次数 × 重量）`}
            />
            <CardBody>
              <BarChart
                data={weeklyVolume}
                label="最近 8 周每周训练容量"
                tone="accent"
                formatValue={(value) => `${formatNumber(value)} kg`}
              />
            </CardBody>
          </Card>
        </div>
      )}

      <Toolbar
        search={{ value: keyword, onChange: setKeyword, placeholder: '搜索计划、动作或备注…' }}
        actions={
          <SegmentedControl
            label="切换健身视图"
            value={view}
            onChange={setView}
            options={[
              { value: 'plans', label: '训练计划', count: plans.length },
              { value: 'records', label: '训练记录', count: records.length },
            ]}
          />
        }
      />

      {view === 'plans' ? (
        visiblePlans.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ListChecks size={22} aria-hidden />}
              title={plans.length === 0 ? '还没有训练计划' : '没有符合条件的计划'}
              description={
                plans.length === 0
                  ? '先建一个计划，比如「推日」「腿日」，之后记录训练时可以直接选它。'
                  : '换个关键词试试。'
              }
              action={
                plans.length === 0 ? (
                  <Button icon={<Plus size={16} aria-hidden />} onClick={openPlanModal}>
                    新建计划
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setKeyword('')}>
                    清除搜索
                  </Button>
                )
              }
            />
          </Card>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {visiblePlans.map((plan) => (
              <li key={plan.id}>
                <Card className="h-full p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-content">{plan.name}</h3>
                      <p className="mt-1 text-sm text-content-tertiary">
                        {plan.description || '没有填写说明'}
                      </p>
                    </div>
                    <IconButton
                      label={`删除计划「${plan.name}」`}
                      size="sm"
                      icon={<Trash2 size={15} />}
                      onClick={() => setPendingPlanId(plan.id)}
                      className="hover:text-danger"
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-2xs text-content-tertiary">
                      建于 {new Date(plan.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => openWorkoutModal(plan.name)}>
                      用它记录训练
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : groupedRecords.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Dumbbell size={22} aria-hidden />}
            title={records.length === 0 ? '还没有训练记录' : '没有符合条件的记录'}
            description={
              records.length === 0
                ? '练完随手记一笔，动作、组次和重量都留着，方便下次对照。'
                : '换个关键词试试。'
            }
            action={
              records.length === 0 ? (
                <Button icon={<Plus size={16} aria-hidden />} onClick={() => openWorkoutModal()}>
                  记录训练
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setKeyword('')}>
                  清除搜索
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-section">
          {groupedRecords.map((group) => (
            <section key={group.date} className="space-y-3">
              <Divider label={group.date} />
              <ul className="grid gap-3">
                {group.items.map((record) => (
                  <li key={record.id}>
                    <Card className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-content">
                              {record.planName || '自由训练'}
                            </h3>
                            <Badge tone="info">{record.exercises.length} 个动作</Badge>
                            <Badge tone="default">
                              {formatNumber(volumeOf(record.exercises))} kg 容量
                            </Badge>
                          </div>

                          <ul className="mt-3 divide-y divide-line-subtle rounded border border-line-subtle">
                            {record.exercises.map((exercise) => (
                              <li
                                key={exercise.id ?? exercise.name}
                                className="flex items-center justify-between gap-3 px-3 py-1.5"
                              >
                                <span className="min-w-0 truncate text-sm text-content-secondary">
                                  {exercise.name}
                                </span>
                                <span className="shrink-0 text-xs text-content-tertiary tabular">
                                  {exercise.sets} 组 × {exercise.reps} 次
                                  {exercise.weight > 0 ? ` · ${exercise.weight} kg` : ''}
                                </span>
                              </li>
                            ))}
                          </ul>

                          {record.notes && (
                            <p className="mt-2 text-sm text-content-tertiary">{record.notes}</p>
                          )}
                        </div>
                        <IconButton
                          label={`删除 ${record.date} 的训练记录`}
                          size="sm"
                          icon={<Trash2 size={15} />}
                          onClick={() => setPendingRecordId(record.id)}
                          className="hover:text-danger"
                        />
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Modal
        isOpen={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        title="新建训练计划"
        description="一个计划可以对应一天或一个训练周期"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPlanModal(false)}>
              取消
            </Button>
            <Button onClick={handleAddPlan} disabled={!planForm.name.trim()}>
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="计划名称"
            value={planForm.name}
            onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })}
            placeholder="如：推日、腿日、减脂周"
            required
          />
          <Input
            label="说明"
            value={planForm.description}
            onChange={(event) => setPlanForm({ ...planForm, description: event.target.value })}
            placeholder="这个计划练什么"
            multiline
            rows={3}
          />
        </div>
      </Modal>

      <Modal
        isOpen={showWorkoutModal}
        onClose={() => setShowWorkoutModal(false)}
        title="记录训练"
        description="只填有做过的动作，重量可以留 0 表示自重"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowWorkoutModal(false)}>
              取消
            </Button>
            <Button onClick={handleLogWorkout} disabled={!canSaveWorkout}>
              保存记录
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="训练计划"
              value={workoutForm.planName}
              onChange={(value) => setWorkoutForm({ ...workoutForm, planName: value })}
              options={[
                { value: '', label: '自由训练' },
                ...plans.map((plan) => ({ value: plan.name, label: plan.name })),
              ]}
            />
            <Input
              label="日期"
              type="date"
              value={workoutForm.date}
              onChange={(event) => setWorkoutForm({ ...workoutForm, date: event.target.value })}
            />
          </div>

          <div className="space-y-3">
            {workoutForm.exercises.map((exercise, index) => (
              <div key={index} className="rounded border border-line-subtle p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      aria-label={`第 ${index + 1} 个动作名称`}
                      value={exercise.name}
                      onChange={(event) => updateExercise(index, { name: event.target.value })}
                      placeholder="动作名，如：杠铃卧推"
                    />
                  </div>
                  <IconButton
                    label={`移除第 ${index + 1} 个动作`}
                    size="sm"
                    icon={<X size={14} />}
                    disabled={workoutForm.exercises.length === 1}
                    onClick={() =>
                      setWorkoutForm((form) => ({
                        ...form,
                        exercises: form.exercises.filter((_, i) => i !== index),
                      }))
                    }
                  />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <NumberInput
                    ariaLabel={`第 ${index + 1} 个动作的组数`}
                    label={index === 0 ? '组数' : undefined}
                    value={exercise.sets}
                    onChange={(value) => updateExercise(index, { sets: value === '' ? 0 : value })}
                    min={0}
                    max={99}
                  />
                  <NumberInput
                    ariaLabel={`第 ${index + 1} 个动作的次数`}
                    label={index === 0 ? '次数' : undefined}
                    value={exercise.reps}
                    onChange={(value) => updateExercise(index, { reps: value === '' ? 0 : value })}
                    min={0}
                    max={999}
                  />
                  <NumberInput
                    ariaLabel={`第 ${index + 1} 个动作的重量`}
                    label={index === 0 ? '重量(kg)' : undefined}
                    value={exercise.weight}
                    onChange={(value) =>
                      updateExercise(index, { weight: value === '' ? 0 : value })
                    }
                    min={0}
                    step={2.5}
                  />
                </div>
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus size={14} aria-hidden />}
              onClick={() =>
                setWorkoutForm((form) => ({
                  ...form,
                  exercises: [...form.exercises, emptyExercise()],
                }))
              }
            >
              添加动作
            </Button>
          </div>

          <Input
            label="备注"
            value={workoutForm.notes}
            onChange={(event) => setWorkoutForm({ ...workoutForm, notes: event.target.value })}
            placeholder="今天的感受、下次要调整的重量…"
            multiline
            rows={2}
          />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={pendingPlan !== null}
        onClose={() => setPendingPlanId(null)}
        onConfirm={() => {
          const target = pendingPlan;
          const snapshot = plans;
          if (pendingPlanId) deletePlan(pendingPlanId);
          setPendingPlanId(null);
          if (target) {
            undoableRemove({
              message: `已删除计划「${target.name}」`,
              description: '已记录的训练数据不受影响，点「撤销」可以恢复计划。',
              snapshot,
              restore: replacePlans,
            });
          }
        }}
        title="删除训练计划"
        description={
          pendingPlan ? `确定要删除「${pendingPlan.name}」吗？已记录的训练数据不受影响。` : ''
        }
        confirmText="删除"
        tone="danger"
      />

      <ConfirmDialog
        isOpen={pendingRecord !== null}
        onClose={() => setPendingRecordId(null)}
        onConfirm={() => {
          const target = pendingRecord;
          const snapshot = records;
          if (pendingRecordId) deleteRecord(pendingRecordId);
          setPendingRecordId(null);
          if (target) {
            undoableRemove({
              message: `已删除 ${target.date} 的训练记录`,
              description: '点「撤销」可以恢复。',
              snapshot,
              restore: replaceRecords,
            });
          }
        }}
        title="删除训练记录"
        description={
          pendingRecord
            ? `确定要删除 ${pendingRecord.date} 的这次训练吗？共 ${pendingRecord.exercises.length} 个动作，删除后无法恢复。`
            : ''
        }
        confirmText="删除"
        tone="danger"
      />
    </div>
  );
};

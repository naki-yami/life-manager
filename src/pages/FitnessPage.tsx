import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  Copy,
  Dumbbell,
  ListChecks,
  Pencil,
  Percent,
  Plus,
  Scale,
  Trash2,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
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
import { ListEmptyState, PageHeader, Toolbar } from '../components/layout';
import { BarChart, Heatmap, LineChart } from '../components/charts';
import { useFitnessStore } from '../store/fitnessStore';
import { useBodyStore } from '../store/bodyStore';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { filterByKeyword } from '../utils/search';
import { useEntityList } from '../hooks/useEntityList';
import { formatNumber, formatShortDate, todayKey } from '../utils/date';
import { activeDays, seriesByDay, seriesByWeek } from '../utils/stats';
import { epley1RM, personalBests } from '../utils/fitness';
import {
  bodyEntries,
  bodyFatOf,
  bodyPoints,
  changeFromPrevious,
  formatDelta,
  formatMetric,
  latestPoint,
  BODY_FAT_META,
  WEIGHT_META,
  measurementFields,
  measurementKeysOf,
  measurementLabel,
  measurementOf,
  round1,
  sortedMetrics,
  weightOf,
  type BodyFieldMeta,
} from '../utils/body';
import type { BodyMetric, Exercise, FitnessPlan, WorkoutRecord } from '../types';
import { ToastContext } from '../components/ui/toastContext';
import { useNewEntryShortcut } from '../hooks/useShortcuts';
import { allExercises, useLibraryStore, type LibraryExercise } from '../store/libraryStore';
import { EQUIPMENTS, EXERCISE_SEEDS, MUSCLE_GROUPS } from '../data/exercises';
import { MonthCalendar, type CalendarMark } from '../components/ui';

type View = 'plans' | 'records' | 'body';

interface ExerciseDraft {
  name: string;
  sets: number;
  reps: number;
  weight: number;
}

const emptyExercise = (): ExerciseDraft => ({ name: '', sets: 3, reps: 10, weight: 0 });

/**
 * 把模板草稿清成能存的样子：丢掉没填名字的行，并剥掉 id。
 *
 * 不剥 id 会出事：同一份草稿保存两次（或先存模板再套用），模板里的动作会带着
 * 上一轮的 id 进新记录，两条记录的动作用同一个 id 后，「按 id 定位动作」的地方
 * 就会改到不该改的那条。
 */
const cleanPlanExercises = (drafts: ExerciseDraft[]): Exercise[] =>
  drafts
    .filter((draft) => draft.name.trim() !== '')
    .map((draft) => ({
      name: draft.name.trim(),
      sets: draft.sets,
      reps: draft.reps,
      weight: draft.weight,
    }));

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

interface BodyFormState {
  date: string;
  weight: number | '';
  bodyFat: number | '';
  /** 部位键 -> 输入框里的值；空串表示这次没量这一项 */
  measurements: Record<string, number | ''>;
  /** 这次要填的围度项：内置五个 + 这条记录里已经有的自定义部位 */
  parts: BodyFieldMeta[];
}

/** 记录里的围度 → 表单值；空对象表示这天还没记过 */
const measurementsFrom = (record?: BodyMetric): Record<string, number | ''> => {
  const result: Record<string, number | ''> = {};
  if (!record) return result;
  for (const key of Object.keys(record.measurements)) result[key] = record.measurements[key]!;
  return result;
};

/** 打开弹窗（或切换日期）时的表单初值：有记录就带出那天的数据，没有就清空 */
const bodyFormOf = (record: BodyMetric | undefined, date: string): BodyFormState => ({
  date,
  weight: record?.weight ?? '',
  bodyFat: record?.bodyFat ?? '',
  measurements: measurementsFrom(record),
  parts: measurementFields(record),
});

/** 表单里真正填了的围度项；空值不提交，也就不会在记录里留下 0 */
const filledMeasurements = (form: BodyFormState): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const part of form.parts) {
    const value = form.measurements[part.key];
    if (typeof value === 'number' && value > 0) result[part.key] = value;
  }
  return result;
};

/** 训练容量 = 组数 × 次数 × 重量，用来衡量整体训练量 */
const volumeOf = (exercises: Array<{ sets: number; reps: number; weight: number }>): number =>
  exercises.reduce((sum, ex) => sum + ex.sets * ex.reps * ex.weight, 0);

/** 记录列表的搜索字段：模块级常量，引用稳定 */
const recordSearchFields = (record: WorkoutRecord) => [
  record.planName,
  record.notes,
  ...record.exercises.map((exercise) => exercise.name),
];

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
    updatePlan,
    addPlanFromRecord,
    deletePlan,
    addRecord,
    deleteRecord,
    replacePlans,
    replaceRecords,
  } = useFitnessStore();
  const undoableRemove = useUndoableRemove();

  const [view, setView] = useState<View>('plans');

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [pendingRecordId, setPendingRecordId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState({ name: '', description: '' });
  /** 新建计划的弹窗里要一并编动作清单（F16）；这套草稿与训练表单各自独立 */
  const [planExercises, setPlanExercises] = useState<ExerciseDraft[]>([]);
  /** 非空表示这个弹窗是「把某次训练存成模板」，保存时从那条记录取动作 */
  const [planFromRecordId, setPlanFromRecordId] = useState<string | null>(null);
  /** 非空表示在编辑已有模板（而不是新建） */
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [workoutForm, setWorkoutForm] = useState(emptyWorkoutForm);

  // 动作库选择器（F9）：搜索 + 肌群/器械过滤 + 自建；选中后填进表单
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [exerciseKeyword, setExerciseKeyword] = useState('');
  const [exerciseMuscle, setExerciseMuscle] = useState<string>('all');
  const [exerciseEquipment, setExerciseEquipment] = useState<string>('all');
  const [customExerciseName, setCustomExerciseName] = useState('');
  const [customExerciseMuscle, setCustomExerciseMuscle] = useState<string>('胸');
  const [customExerciseEquipment, setCustomExerciseEquipment] = useState<string>('杠铃');
  const customExercises = useLibraryStore((state) => state.customExercises);
  const addCustomExercise = useLibraryStore((state) => state.addCustomExercise);
  const deleteCustomExercise = useLibraryStore((state) => state.deleteCustomExercise);
  const recentExerciseNames = useLibraryStore((state) => state.recentExerciseNames);
  const recordExerciseUsage = useLibraryStore((state) => state.recordExerciseUsage);
  const toastContext = React.useContext(ToastContext);
  const [recordDateFilter, setRecordDateFilter] = useState<string | null>(null);

  const {
    records: bodyRecords,
    saveRecord: saveBodyRecord,
    deleteRecord: deleteBodyRecord,
    replaceRecords: replaceBodyRecords,
  } = useBodyStore();
  const [showBodyModal, setShowBodyModal] = useState(false);
  const [bodyForm, setBodyForm] = useState<BodyFormState>(() => bodyFormOf(undefined, todayKey()));
  const [pendingBodyId, setPendingBodyId] = useState<string | null>(null);

  const totalVolume = records.reduce((sum, record) => sum + volumeOf(record.exercises), 0);
  const bests = useMemo(() => personalBests(records), [records]);

  /** 日历标记：每天的训练次数 */
  const calendarMarks = useMemo(() => {
    const map: Record<string, CalendarMark> = {};
    for (const record of records) {
      const entry = map[record.date] ?? { count: 0, label: '' };
      entry.count += 1;
      entry.label = `${entry.count} 次训练`;
      map[record.date] = entry;
    }
    return map;
  }, [records]);

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

  /** 身体指标：趋势点只取真实记录，缺测的日子不补 0（补 0 会把折线拽到底部） */
  const latestWeight = useMemo(() => latestPoint(bodyRecords, weightOf), [bodyRecords]);
  const weightChange = useMemo(() => changeFromPrevious(bodyRecords, weightOf), [bodyRecords]);
  const latestBodyFat = useMemo(() => latestPoint(bodyRecords, bodyFatOf), [bodyRecords]);
  const weightPoints = useMemo(() => bodyPoints(bodyRecords, weightOf), [bodyRecords]);
  const bodyFatPoints = useMemo(() => bodyPoints(bodyRecords, bodyFatOf), [bodyRecords]);
  const measurementKeys = useMemo(() => measurementKeysOf(bodyRecords), [bodyRecords]);
  const bodyList = useMemo(
    () =>
      sortedMetrics(bodyRecords)
        .reverse()
        .map((record) => ({ record, entries: bodyEntries(record) })),
    [bodyRecords],
  );

  /** 每条记录相对「上一次称重」的变化，列表里一眼就能看到走势 */
  const weightDeltas = useMemo(() => {
    const points = bodyPoints(bodyRecords, weightOf, 0);
    const deltas = new Map<string, number>();
    for (let index = 1; index < points.length; index += 1) {
      deltas.set(points[index]!.date, round1(points[index]!.value - points[index - 1]!.value));
    }
    return deltas;
  }, [bodyRecords]);

  // 记录列表（主列表）走列表页共用件；计划列表量小，仍按关键词手筛
  const {
    keyword,
    setKeyword,
    visible: visibleRecords,
    filteredOut,
    clearFilters,
  } = useEntityList<WorkoutRecord, string>({
    items: records,
    searchFields: recordSearchFields,
  });

  const visiblePlans = useMemo(
    () => filterByKeyword(plans, keyword, (plan) => [plan.name, plan.description]),
    [plans, keyword],
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

  const filteredGroupedRecords = useMemo(
    () =>
      recordDateFilter
        ? groupedRecords.filter((group) => group.date === recordDateFilter)
        : groupedRecords,
    [groupedRecords, recordDateFilter],
  );

  const pendingPlan = plans.find((plan) => plan.id === pendingPlanId) ?? null;
  const pendingRecord = records.find((record) => record.id === pendingRecordId) ?? null;
  const pendingBody = bodyRecords.find((record) => record.id === pendingBodyId) ?? null;
  /** 表单选中的那天是不是已经有记录（用来提示「保存会更新它」） */
  const bodyFormHasRecord = bodyRecords.some((record) => record.date === bodyForm.date);

  const openPlanModal = (template?: FitnessPlan): void => {
    setPlanForm(
      template
        ? { name: template.name, description: template.description }
        : { name: '', description: '' },
    );
    setPlanExercises(
      template && template.exercises.length > 0
        ? template.exercises.map(({ name, sets, reps, weight }) => ({ name, sets, reps, weight }))
        : [],
    );
    setPlanFromRecordId(null);
    setEditingPlanId(template?.id ?? null);
    setShowPlanModal(true);
  };

  const openWorkoutModal = (planName = '', exercises?: Exercise[]): void => {
    /*
     * 套用模板（F16）：把模板的动作清单铺进表单。
     *
     * 几条处理是刻意的：
     * - 剥掉 id —— 表单里的每一行都要是新的草稿，id 留着会让保存时把模板的动作
     *   和这条记录的动作用上同一个 id；
     * - 重量留 0，模板里存的本来就是 0（见 fitnessStore.planExercisesFrom 的注释）；
     * - 模板没有动作时退回一行空动作，否则用户打开表单看到一片空白会以为坏了。
     */
    const seeded: ExerciseDraft[] =
      exercises && exercises.length > 0
        ? exercises.map(({ name, sets, reps, weight }) => ({ name, sets, reps, weight }))
        : [emptyExercise()];

    setWorkoutForm({ ...emptyWorkoutForm(), planName, exercises: seeded });
    setShowWorkoutModal(true);
  };

  /** 把一次训练存成模板：直接拿记录里的动作，重量由 store 清掉 */
  const openSaveAsPlanModal = (record: WorkoutRecord): void => {
    setPlanForm({
      name: record.planName.trim() || `${formatShortDate(record.date)} 的训练`,
      description: '',
    });
    setPlanFromRecordId(record.id);
    setShowPlanModal(true);
  };

  /** 身体指标的弹窗：新建时默认今天，编辑时带出那天的数据 */
  const openBodyModal = (record?: BodyMetric): void => {
    setBodyForm(bodyFormOf(record, record?.date ?? todayKey()));
    setShowBodyModal(true);
  };

  /** 换日期就带出那天的数据：切到已有记录的日子，保存是更新而不是把它覆盖成空 */
  const changeBodyDate = (date: string): void => {
    setBodyForm(
      bodyFormOf(
        bodyRecords.find((record) => record.date === date),
        date,
      ),
    );
  };

  const setBodyMeasurement = (key: string, value: number | ''): void => {
    setBodyForm((form) => ({ ...form, measurements: { ...form.measurements, [key]: value } }));
  };

  const handleSaveBody = (): void => {
    saveBodyRecord({
      date: bodyForm.date,
      weight: typeof bodyForm.weight === 'number' ? bodyForm.weight : undefined,
      bodyFat: typeof bodyForm.bodyFat === 'number' ? bodyForm.bodyFat : undefined,
      measurements: filledMeasurements(bodyForm),
    });
    setShowBodyModal(false);
  };

  const canSaveBody =
    bodyForm.weight !== '' ||
    bodyForm.bodyFat !== '' ||
    Object.values(bodyForm.measurements).some((value) => typeof value === 'number' && value > 0);

  // 按 n 时跟着当前标签走：身体指标页记身体数据，其余标签记训练
  useNewEntryShortcut(() => (view === 'body' ? openBodyModal() : openWorkoutModal()));

  /** 动作库的搜索结果：肌群 + 器械过滤 + 关键词匹配 */
  const libraryExercises: LibraryExercise[] = useMemo(() => {
    const all = allExercises(customExercises);
    const kw = exerciseKeyword.trim().toLowerCase();
    return all.filter((exercise) => {
      if (exerciseMuscle !== 'all' && exercise.muscleGroup !== exerciseMuscle) return false;
      if (exerciseEquipment !== 'all' && exercise.equipment !== exerciseEquipment) return false;
      return kw === '' || exercise.name.toLowerCase().includes(kw);
    });
  }, [customExercises, exerciseKeyword, exerciseMuscle, exerciseEquipment]);

  const visibleExercises = libraryExercises.slice(0, 60);

  /** 最近使用：按记录顺序取还在库里的前 6 个（U4） */
  const recentExercises = useMemo(() => {
    const byName = new Map(libraryExercises.map((exercise) => [exercise.name, exercise]));
    return recentExerciseNames
      .map((name) => byName.get(name))
      .filter((exercise): exercise is LibraryExercise => exercise !== undefined)
      .slice(0, 6);
  }, [libraryExercises, recentExerciseNames]);

  const fillFromExerciseLibrary = (exercise: LibraryExercise): void => {
    recordExerciseUsage(exercise.name);
    setWorkoutForm((form) => {
      const filled = {
        name: exercise.name,
        sets: 3,
        reps: 10,
        weight: 0,
      };
      // 第一行还空着就原地填，否则追加一行，方便连续挑好几个动作
      const firstEmpty = form.exercises.length === 1 && form.exercises[0].name.trim() === '';
      return {
        ...form,
        exercises: firstEmpty ? [filled] : [...form.exercises, filled],
      };
    });
  };

  const handleAddCustomExercise = (): void => {
    const name = customExerciseName.trim();
    if (!name) return;
    addCustomExercise({
      name,
      muscleGroup: customExerciseMuscle,
      equipment: customExerciseEquipment,
    });
    setCustomExerciseName('');
  };

  /** 复制最近一次训练：带出计划名与全部动作，日期改为今天 */
  const copyLastWorkout = (): void => {
    const last = [...records].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!last) return;
    setWorkoutForm({
      planName: last.planName,
      date: todayKey(),
      exercises: last.exercises.map((exercise) => ({
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps,
        weight: exercise.weight,
      })),
      notes: '',
    });
    setShowWorkoutModal(true);
  };

  const handleAddPlan = (): void => {
    const name = planForm.name.trim();
    if (!name) return;
    const description = planForm.description.trim();

    // 「把这次训练存成模板」：动作从那条记录来，忽略弹窗里编的那套
    if (planFromRecordId !== null) {
      const record = records.find((item) => item.id === planFromRecordId);
      if (record) addPlanFromRecord(record, name);
    } else if (editingPlanId !== null) {
      // 编辑已有模板：连动作清单一起换掉
      updatePlan(editingPlanId, {
        name,
        description,
        exercises: cleanPlanExercises(planExercises),
      });
    } else {
      addPlan(name, description, cleanPlanExercises(planExercises));
    }

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
    const trimmed = validExercises.map((exercise) => ({ ...exercise, name: exercise.name.trim() }));

    // 破纪录检测：这次的动作 1RM 超过历史最佳才算（第一次录入不算破纪录）
    const previousBests = new Map(personalBests(records).map((pr) => [pr.exercise, pr.oneRm]));
    const brokenRecords = trimmed
      .map((exercise) => ({
        name: exercise.name,
        oneRm: epley1RM(exercise.weight, exercise.reps),
      }))
      .filter((entry) => {
        const previous = previousBests.get(entry.name);
        return previous !== undefined && entry.oneRm > previous;
      });

    addRecord(workoutForm.planName, workoutForm.date, trimmed, workoutForm.notes.trim());

    const topBroken = brokenRecords[0];
    if (topBroken) {
      toastContext?.toast({
        tone: 'success',
        title: `🎉 新纪录！「${topBroken.name}」`,
        description: `预计 1RM 达到 ${formatNumber(topBroken.oneRm)} kg，超过了之前的最佳成绩。`,
      });
    }

    setShowWorkoutModal(false);
  };

  const canSaveWorkout = workoutForm.exercises.some((exercise) => exercise.name.trim());

  return (
    <div className="space-y-section">
      <PageHeader
        title="健身"
        description={
          view === 'body'
            ? '体重、体脂与围度的按日记录与趋势'
            : '训练计划与每次训练的动作、组次记录'
        }
        icon={Dumbbell}
        actions={
          view === 'body' ? (
            <Button icon={<Plus size={16} aria-hidden />} onClick={() => openBodyModal()}>
              记录身体数据
            </Button>
          ) : (
            <>
              {records.length > 0 && (
                <Button
                  variant="secondary"
                  icon={<Copy size={16} aria-hidden />}
                  onClick={copyLastWorkout}
                >
                  复制上次训练
                </Button>
              )}
              <Button
                variant="secondary"
                icon={<Plus size={16} aria-hidden />}
                onClick={() => openWorkoutModal()}
              >
                记录训练
              </Button>
              <Button icon={<Plus size={16} aria-hidden />} onClick={() => openPlanModal()}>
                新建计划
              </Button>
            </>
          )
        }
      />

      {view === 'body' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="当前体重"
            value={latestWeight ? formatMetric(latestWeight.value) : '—'}
            unit={latestWeight ? 'kg' : undefined}
            icon={<Scale size={16} aria-hidden />}
            footer={latestWeight ? `${latestWeight.date} 记录` : '还没有称过'}
          />
          <StatCard
            label="较上次"
            value={weightChange ? formatDelta(weightChange.delta) : '—'}
            unit={weightChange ? 'kg' : undefined}
            icon={<TrendingUp size={16} aria-hidden />}
            footer={
              weightChange
                ? `上次 ${formatMetric(weightChange.previous.value)} kg（${weightChange.previous.date}）`
                : '至少两次记录才有对比'
            }
          />
          <StatCard
            label="当前体脂率"
            value={latestBodyFat ? formatMetric(latestBodyFat.value) : '—'}
            unit={latestBodyFat ? '%' : undefined}
            icon={<Percent size={16} aria-hidden />}
            footer={latestBodyFat ? `${latestBodyFat.date} 记录` : '还没有体脂记录'}
          />
          <StatCard
            label="记录天数"
            value={bodyRecords.length}
            unit="天"
            icon={<CalendarDays size={16} aria-hidden />}
            footer={
              measurementKeys.length > 0 ? `围度记了 ${measurementKeys.length} 项` : '围度还没记过'
            }
          />
        </div>
      ) : (
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
      )}

      {view !== 'body' && records.length > 0 && (
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

      {view === 'body' && bodyRecords.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="体重趋势"
              subtitle={
                weightPoints.length > 0
                  ? `最近 ${weightPoints.length} 次称重，缺测的日子不补 0`
                  : '还没有体重记录'
              }
            />
            <CardBody>
              <LineChart
                data={weightPoints}
                label="体重趋势"
                formatValue={(value) => `${formatMetric(value)} kg`}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="体脂趋势"
              subtitle={
                bodyFatPoints.length > 0
                  ? `最近 ${bodyFatPoints.length} 次测量`
                  : '还没有体脂记录，下次称体脂时一起填上'
              }
            />
            <CardBody>
              <LineChart
                data={bodyFatPoints}
                label="体脂趋势"
                tone="warning"
                formatValue={(value) => `${formatMetric(value)} %`}
              />
            </CardBody>
          </Card>
        </div>
      )}

      {view === 'body' && measurementKeys.length > 0 && (
        <Card>
          <CardHeader title="围度" subtitle="最近一次的数值与较上次的变化" />
          <CardBody>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {measurementKeys.map((key) => {
                const latest = latestPoint(bodyRecords, measurementOf(key));
                const change = changeFromPrevious(bodyRecords, measurementOf(key));
                return (
                  <li key={key} className="rounded border border-line-subtle px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-content-secondary">
                        {measurementLabel(key)}
                      </span>
                      <span className="text-sm font-medium text-content tabular">
                        {latest ? formatMetric(latest.value) : '—'}
                        <span className="ml-0.5 text-2xs text-content-tertiary">cm</span>
                      </span>
                    </div>
                    <p className="mt-0.5 text-2xs text-content-tertiary">
                      {change
                        ? `较上次 ${formatDelta(change.delta)} cm · ${change.previous.date}`
                        : latest
                          ? `${latest.date} 记录`
                          : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {view !== 'body' && records.length > 0 && bests.length > 0 && (
        <Card>
          <CardHeader title="个人最佳" subtitle="按 Epley 公式估算的 1RM，破纪录时会弹提示" />
          <CardBody>
            <ul className="divide-y divide-line-subtle rounded border border-line-subtle">
              {bests.slice(0, 5).map((pr) => (
                <li key={pr.exercise} className="flex items-center gap-3 px-3 py-2">
                  <Trophy size={14} className="shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm text-content">
                    {pr.exercise}
                  </span>
                  <span className="text-xs text-content-tertiary tabular">{pr.date}</span>
                  <Badge tone="warning">1RM {formatNumber(pr.oneRm)} kg</Badge>
                </li>
              ))}
            </ul>
            {bests.length > 5 && (
              <p className="mt-2 text-xs text-content-tertiary">
                只显示前 5 个动作，共 {bests.length} 个动作有记录。
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <Toolbar
        search={
          view === 'body'
            ? undefined
            : { value: keyword, onChange: setKeyword, placeholder: '搜索计划、动作或备注…' }
        }
        actions={
          <SegmentedControl
            label="切换健身视图"
            value={view}
            onChange={setView}
            options={[
              { value: 'plans', label: '训练计划', count: plans.length },
              { value: 'records', label: '训练记录', count: records.length },
              { value: 'body', label: '身体指标', count: bodyRecords.length },
            ]}
          />
        }
      />

      {view === 'records' && (
        <Card>
          <CardHeader
            title="训练日历"
            subtitle="点一天可以只看那天的训练"
            action={
              recordDateFilter ? (
                <Button size="sm" variant="secondary" onClick={() => setRecordDateFilter(null)}>
                  只看 {recordDateFilter} · 清除
                </Button>
              ) : null
            }
          />
          <CardBody>
            <MonthCalendar
              label="训练日历"
              selected={recordDateFilter ?? undefined}
              onSelect={setRecordDateFilter}
              marks={calendarMarks}
            />
          </CardBody>
        </Card>
      )}

      {view === 'body' ? (
        bodyList.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Scale size={22} aria-hidden />}
              title="还没有身体数据"
              description="体重、体脂与围度按天记下来，趋势和「较上次」会自动算好。一天一条，同一天再记就是修正。"
              action={
                <Button icon={<Plus size={16} aria-hidden />} onClick={() => openBodyModal()}>
                  记录身体数据
                </Button>
              }
            />
          </Card>
        ) : (
          <ul className="grid gap-3">
            {bodyList.map(({ record, entries }) => {
              const delta = weightDeltas.get(record.date);
              return (
                <li key={record.id}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-content">{record.date}</h3>
                          {delta !== undefined && (
                            <Badge tone="default">较上次 {formatDelta(delta)} kg</Badge>
                          )}
                          <Badge tone="info">{entries.length} 项</Badge>
                        </div>
                        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                          {entries.map((entry) => (
                            <li
                              key={entry.key}
                              className="flex items-center justify-between gap-3 rounded border border-line-subtle px-3 py-1.5"
                            >
                              <span className="min-w-0 truncate text-sm text-content-secondary">
                                {entry.label}
                              </span>
                              <span className="shrink-0 text-xs text-content-tertiary tabular">
                                {formatMetric(entry.value)} {entry.unit}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <IconButton
                          label={`编辑 ${record.date} 的身体数据`}
                          size="sm"
                          icon={<Pencil size={15} />}
                          onClick={() => openBodyModal(record)}
                        />
                        <IconButton
                          label={`删除 ${record.date} 的身体数据`}
                          size="sm"
                          icon={<Trash2 size={15} />}
                          onClick={() => setPendingBodyId(record.id)}
                          className="hover:text-danger"
                        />
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )
      ) : view === 'plans' ? (
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
                  <Button icon={<Plus size={16} aria-hidden />} onClick={() => openPlanModal()}>
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
                    <div className="flex shrink-0 items-center">
                      <IconButton
                        label={`编辑计划「${plan.name}」`}
                        size="sm"
                        icon={<Pencil size={15} />}
                        onClick={() => openPlanModal(plan)}
                      />
                      <IconButton
                        label={`删除计划「${plan.name}」`}
                        size="sm"
                        icon={<Trash2 size={15} />}
                        onClick={() => setPendingPlanId(plan.id)}
                        className="hover:text-danger"
                      />
                    </div>
                  </div>

                  {/*
                    动作清单只露前 3 个：卡片是网格里的一个格子，把整套动作摊开会把
                    其它模板挤下去。想看全的点「编辑」。
                  */}
                  <div className="mt-3">
                    {plan.exercises.length === 0 ? (
                      <p className="text-2xs text-content-tertiary">
                        还没有动作，点「编辑」补上就能一键开练
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-2xs text-content-tertiary">
                          {plan.exercises.length} 个动作
                        </span>
                        {plan.exercises.slice(0, 3).map((exercise, index) => (
                          <Badge key={index} tone="default">
                            {exercise.name}
                          </Badge>
                        ))}
                        {plan.exercises.length > 3 && (
                          <span className="text-2xs text-content-tertiary">
                            +{plan.exercises.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-2xs text-content-tertiary">
                      建于 {new Date(plan.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                    <Button
                      size="sm"
                      variant={plan.exercises.length > 0 ? 'primary' : 'ghost'}
                      onClick={() => openWorkoutModal(plan.name, plan.exercises)}
                    >
                      {plan.exercises.length > 0 ? '用模板开始训练' : '用它记录训练'}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : filteredGroupedRecords.length === 0 ? (
        <ListEmptyState
          icon={<Dumbbell size={22} aria-hidden />}
          filtered={filteredOut || recordDateFilter !== null}
          emptyTitle="还没有训练记录"
          emptyDescription="练完随手记一笔，动作、组次和重量都留着，方便下次对照。"
          emptyAction={
            <Button icon={<Plus size={16} aria-hidden />} onClick={() => openWorkoutModal()}>
              记录训练
            </Button>
          }
          filteredTitle="没有符合条件的记录"
          filteredDescription="换个关键词，或者清掉日期与搜索条件。"
          onClearFilters={() => {
            clearFilters();
            setRecordDateFilter(null);
          }}
        />
      ) : (
        <div className="space-y-section">
          {filteredGroupedRecords.map((group) => (
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
                                  {epley1RM(exercise.weight, exercise.reps) > 0
                                    ? ` · 1RM ${formatNumber(epley1RM(exercise.weight, exercise.reps))} kg`
                                    : ''}
                                </span>
                              </li>
                            ))}
                          </ul>

                          {record.notes && (
                            <p className="mt-2 text-sm text-content-tertiary">{record.notes}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center">
                          {/*
                            只在有动作时才给「存成模板」：空记录存出来的模板没有意义，
                            点了也是白点，不如干脆不显示。
                          */}
                          {record.exercises.length > 0 && (
                            <IconButton
                              label={`把 ${record.date} 的训练存成模板`}
                              size="sm"
                              icon={<Copy size={15} />}
                              onClick={() => openSaveAsPlanModal(record)}
                            />
                          )}
                          <IconButton
                            label={`删除 ${record.date} 的训练记录`}
                            size="sm"
                            icon={<Trash2 size={15} />}
                            onClick={() => setPendingRecordId(record.id)}
                            className="hover:text-danger"
                          />
                        </div>
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
        title={
          planFromRecordId !== null
            ? '存成训练日模板'
            : editingPlanId !== null
              ? '编辑训练计划'
              : '新建训练计划'
        }
        description={
          planFromRecordId !== null
            ? '把这天做的动作存成模板，下次一键铺开'
            : '把动作清单填进来，以后就能一键开始这一天的训练'
        }
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPlanModal(false)}>
              取消
            </Button>
            <Button onClick={handleAddPlan} disabled={!planForm.name.trim()}>
              {editingPlanId !== null ? '保存' : '创建'}
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

          {planFromRecordId !== null ? (
            // 从记录推导动作：不给编辑入口，免得用户以为自己改的是模板内容。
            // 真要改，建完模板再点「编辑」。
            <div className="rounded border border-line-subtle bg-inset p-3">
              <p className="text-xs text-content-tertiary">
                动作清单将从这条记录里取（
                {records.find((item) => item.id === planFromRecordId)?.exercises.length ?? 0} 个动作）。
                重量不会带过来，模板只记动作、组数与次数。
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-content">动作清单</span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Plus size={15} aria-hidden />}
                  onClick={() => setPlanExercises((list) => [...list, emptyExercise()])}
                >
                  加动作
                </Button>
              </div>
              {planExercises.length === 0 ? (
                <p className="text-xs text-content-tertiary">
                  还没有动作。可以先留空，之后再来补 —— 空模板仍然可以「用它记录训练」。
                </p>
              ) : (
                <ul className="space-y-2">
                  {planExercises.map((exercise, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <Input
                        aria-label={`动作 ${index + 1} 名称`}
                        value={exercise.name}
                        onChange={(event) =>
                          setPlanExercises((list) =>
                            list.map((item, i) =>
                              i === index ? { ...item, name: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder="动作名称"
                        className="min-w-0 flex-1"
                      />
                      <NumberInput
                        ariaLabel={`动作 ${index + 1} 组数`}
                        value={exercise.sets}
                        min={0}
                        onChange={(value) =>
                          setPlanExercises((list) =>
                            list.map((item, i) =>
                              i === index ? { ...item, sets: value === '' ? 0 : value } : item,
                            ),
                          )
                        }
                        className="w-20 shrink-0"
                      />
                      <NumberInput
                        ariaLabel={`动作 ${index + 1} 次数`}
                        value={exercise.reps}
                        min={0}
                        onChange={(value) =>
                          setPlanExercises((list) =>
                            list.map((item, i) =>
                              i === index ? { ...item, reps: value === '' ? 0 : value } : item,
                            ),
                          )
                        }
                        className="w-20 shrink-0"
                      />
                      <IconButton
                        label={`删除动作 ${index + 1}`}
                        size="sm"
                        icon={<X size={15} />}
                        onClick={() =>
                          setPlanExercises((list) => list.filter((_, i) => i !== index))
                        }
                        className="shrink-0 hover:text-danger"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
                // 复制上次训练时可能带出一个已被删除的计划名，保底让它仍可选
                ...(workoutForm.planName &&
                !plans.some((plan) => plan.name === workoutForm.planName)
                  ? [{ value: workoutForm.planName, label: workoutForm.planName }]
                  : []),
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

          <Button
            size="sm"
            variant="secondary"
            icon={<Dumbbell size={14} aria-hidden />}
            onClick={() => {
              setExerciseKeyword('');
              setExerciseMuscle('all');
              setExerciseEquipment('all');
              setShowExercisePicker(true);
            }}
          >
            从动作库选择
          </Button>

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

      <Modal
        isOpen={showBodyModal}
        onClose={() => setShowBodyModal(false)}
        title="记录身体数据"
        description="只填这次量到的项，留空的不记；一天一条，同一天再记就是修正"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowBodyModal(false)}>
              取消
            </Button>
            <Button onClick={handleSaveBody} disabled={!canSaveBody}>
              保存记录
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="日期"
            type="date"
            value={bodyForm.date}
            onChange={(event) => changeBodyDate(event.target.value)}
            hint={bodyFormHasRecord ? '这一天已有记录，保存会更新它' : undefined}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberInput
              label="体重(kg)"
              value={bodyForm.weight}
              onChange={(value) => setBodyForm((form) => ({ ...form, weight: value }))}
              min={WEIGHT_META.min}
              max={WEIGHT_META.max}
              step={WEIGHT_META.step}
              placeholder="如 70.5"
            />
            <NumberInput
              label="体脂率(%)"
              value={bodyForm.bodyFat}
              onChange={(value) => setBodyForm((form) => ({ ...form, bodyFat: value }))}
              min={BODY_FAT_META.min}
              max={BODY_FAT_META.max}
              step={BODY_FAT_META.step}
              placeholder="如 18.5"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-content">围度（cm）</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bodyForm.parts.map((part) => (
                <NumberInput
                  key={part.key}
                  label={part.label}
                  value={bodyForm.measurements[part.key] ?? ''}
                  onChange={(value) => setBodyMeasurement(part.key, value)}
                  min={part.min}
                  max={part.max}
                  step={part.step}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showExercisePicker}
        onClose={() => setShowExercisePicker(false)}
        title="从动作库选择"
        description="挑常见动作直接填入，组次重量再按当天的量改"
        size="lg"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1">
              <Input
                label="搜索"
                value={exerciseKeyword}
                onChange={(event) => setExerciseKeyword(event.target.value)}
                placeholder="如：卧推、深蹲、划船…"
              />
            </div>
            <div className="w-28">
              <Select
                label="肌群"
                value={exerciseMuscle}
                onChange={(value) => setExerciseMuscle(value)}
                options={[
                  { value: 'all', label: '全部肌群' },
                  ...MUSCLE_GROUPS.map((group) => ({ value: group, label: group })),
                ]}
              />
            </div>
            <div className="w-28">
              <Select
                label="器械"
                value={exerciseEquipment}
                onChange={(value) => setExerciseEquipment(value)}
                options={[
                  { value: 'all', label: '全部器械' },
                  ...EQUIPMENTS.map((equipment) => ({ value: equipment, label: equipment })),
                ]}
              />
            </div>
          </div>

          {exerciseKeyword.trim() === '' &&
            exerciseMuscle === 'all' &&
            exerciseEquipment === 'all' &&
            recentExercises.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-content-secondary">最近使用</p>
              <div className="flex flex-wrap gap-1.5">
                {recentExercises.map((exercise) => (
                  <button
                    key={exercise.name}
                    type="button"
                    onClick={() => fillFromExerciseLibrary(exercise)}
                    className="inline-flex items-center gap-1 rounded-full bg-inset px-3 py-1 text-xs text-content-secondary transition-colors duration-fast ease-standard hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                  >
                    {exercise.name}
                    <span className="text-2xs text-content-tertiary">{exercise.muscleGroup}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <ul className="max-h-64 divide-y divide-line-subtle overflow-y-auto rounded border border-line-subtle">
            {visibleExercises.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-content-tertiary">
                库里没有匹配的动作，可以在下面存一条自建的。
              </li>
            ) : (
              visibleExercises.map((exercise) => (
                <li
                  key={exercise.id ?? exercise.name}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="truncate text-sm text-content">{exercise.name}</span>
                      <Badge tone="default">{exercise.muscleGroup}</Badge>
                      <Badge tone="info">{exercise.equipment}</Badge>
                      {!EXERCISE_SEEDS.some((seed) => seed.name === exercise.name) && (
                        <Badge tone="accent">自建</Badge>
                      )}
                    </div>
                  </div>
                  {exercise.id && (
                    <IconButton
                      label={`删除自建动作「${exercise.name}」`}
                      size="sm"
                      icon={<X size={13} />}
                      onClick={() => deleteCustomExercise(exercise.id!)}
                      className="hover:text-danger"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`把「${exercise.name}」填入表单`}
                    onClick={() => fillFromExerciseLibrary(exercise)}
                  >
                    填入
                  </Button>
                </li>
              ))
            )}
          </ul>
          {libraryExercises.length > visibleExercises.length && (
            <p className="text-xs text-content-tertiary">
              只显示前 {visibleExercises.length} 条，共 {libraryExercises.length}{' '}
              条，继续输入关键词收窄。
            </p>
          )}

          <div className="rounded bg-inset p-3">
            <p className="mb-2 text-sm font-medium text-content-secondary">
              库里没有？存一条自建的
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-32 flex-1">
                <Input
                  label="名称"
                  value={customExerciseName}
                  onChange={(event) => setCustomExerciseName(event.target.value)}
                  placeholder={exerciseKeyword.trim() || '自定义动作名'}
                />
              </div>
              <div className="w-24">
                <Select
                  label="肌群"
                  value={customExerciseMuscle}
                  onChange={(value) => setCustomExerciseMuscle(value)}
                  options={MUSCLE_GROUPS.map((group) => ({ value: group, label: group }))}
                />
              </div>
              <div className="w-24">
                <Select
                  label="器械"
                  value={customExerciseEquipment}
                  onChange={(value) => setCustomExerciseEquipment(value)}
                  options={EQUIPMENTS.map((equipment) => ({ value: equipment, label: equipment }))}
                />
              </div>
              <Button
                variant="secondary"
                onClick={handleAddCustomExercise}
                disabled={!customExerciseName.trim()}
              >
                存入动作库
              </Button>
            </div>
          </div>
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

      <ConfirmDialog
        isOpen={pendingBody !== null}
        onClose={() => setPendingBodyId(null)}
        onConfirm={() => {
          const target = pendingBody;
          const snapshot = bodyRecords;
          if (pendingBodyId) deleteBodyRecord(pendingBodyId);
          setPendingBodyId(null);
          if (target) {
            undoableRemove({
              message: `已删除 ${target.date} 的身体数据`,
              description: '点「撤销」可以恢复。',
              snapshot,
              restore: replaceBodyRecords,
            });
          }
        }}
        title="删除身体数据"
        description={
          pendingBody
            ? `确定要删除 ${pendingBody.date} 的身体数据吗？这一天记的 ${bodyEntries(pendingBody).length} 项都会被删掉。`
            : ''
        }
        confirmText="删除"
        tone="danger"
      />
    </div>
  );
};

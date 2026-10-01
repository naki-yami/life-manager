import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Copy,
  Droplet,
  Flame,
  Moon,
  Plus,
  Sun,
  Sunrise,
  Trash2,
  TrendingUp,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
  ProgressBar,
  ProgressRing,
  SegmentedControl,
  Select,
  StatCard,
} from '../components/ui';
import { ListEmptyState, PageHeader, Toolbar } from '../components/layout';
import { BarChart, Sparkline } from '../components/charts';
import { MonthCalendar, type CalendarMark } from '../components/ui';
import { useDietStore } from '../store/dietStore';
import { allFoods, useLibraryStore, type LibraryFood } from '../store/libraryStore';
import { FOOD_CATEGORIES, type FoodCategory } from '../data/foodCategories';
import { FOOD_SEEDS } from '../data/foods';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { matchesKeyword } from '../utils/search';
import { useEntityList } from '../hooks/useEntityList';
import {
  addDays,
  formatDayLabel,
  formatMonthLabel,
  formatNumber,
  formatShortDate,
  todayKey,
} from '../utils/date';
import { seriesByDay, seriesByMonth, seriesByWeek } from '../utils/stats';
import { FoodItem, MealRecord, MealTemplate, MealType } from '../types';
import { useNewEntryShortcut } from '../hooks/useShortcuts';

type View = 'day' | 'all';
type TrendRange = 'day' | 'week' | 'month';

const TREND_RANGE: Array<{ value: TrendRange; label: string }> = [
  { value: 'day', label: '近 7 天' },
  { value: 'week', label: '近 4 周' },
  { value: 'month', label: '近 6 月' },
];

interface FoodDraft {
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const MEAL_LABEL: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

const MEAL_ICON: Record<MealType, LucideIcon> = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Moon,
  snack: Coffee,
};

const CATEGORY_OPTIONS = FOOD_CATEGORIES.map((category) => ({
  value: category,
  label: category,
}));

const MEAL_OPTIONS = MEAL_ORDER.map((type) => ({ value: type, label: MEAL_LABEL[type] }));

/** 全部记录列表的搜索字段：模块级常量，引用稳定 */
const recordSearchFields = (record: MealRecord) => [
  record.date,
  ...record.items.map((item) => item.name),
  ...record.items.map((item) => item.category),
];

const emptyItem = (): FoodDraft => ({
  name: '',
  category: '主食',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
});

export const DietPage: React.FC = () => {
  const {
    records,
    templates,
    addRecord,
    deleteRecord,
    replaceRecords,
    addTemplateFromRecord,
    deleteTemplate,
    goals,
    water,
    setGoals,
    setWater,
  } = useDietStore();
  const undoableRemove = useUndoableRemove();

  const [view, setView] = useState<View>('day');
  const [trendRange, setTrendRange] = useState<TrendRange>('day');
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  useNewEntryShortcut(() => setShowAddModal(true));

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<{ type: MealType; date: string; items: FoodDraft[] }>({
    type: 'breakfast',
    date: todayKey(),
    items: [emptyItem()],
  });

  // 食物库选择器（F9）：搜索 + 分类过滤 + 自建；选中后填进当前表单
  const [showFoodPicker, setShowFoodPicker] = useState(false);
  const [foodKeyword, setFoodKeyword] = useState('');
  const [foodCategory, setFoodCategory] = useState<'all' | FoodCategory>('all');
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<FoodCategory>('其他');
  const [customCalories, setCustomCalories] = useState<number | ''>('');
  const customFoods = useLibraryStore((state) => state.customFoods);
  const addCustomFood = useLibraryStore((state) => state.addCustomFood);
  const deleteCustomFood = useLibraryStore((state) => state.deleteCustomFood);
  const recentFoodNames = useLibraryStore((state) => state.recentFoodNames);
  const recordFoodUsage = useLibraryStore((state) => state.recordFoodUsage);

  const today = todayKey();

  // 「全部」视图的记录列表走列表页共用件；day 视图的当天过滤是页面特有的，仍归页面
  const {
    keyword,
    setKeyword,
    visible: visibleAllRecords,
    filteredOut,
    clearFilters,
  } = useEntityList<MealRecord, string>({
    items: records,
    searchFields: recordSearchFields,
  });

  const dayRecords = useMemo(() => {
    const forDay = records.filter((record) => record.date === selectedDate);
    if (keyword.trim() === '') return forDay;
    return forDay.filter((record) =>
      record.items.some((item) => matchesKeyword(keyword, item.name, item.category)),
    );
  }, [records, selectedDate, keyword]);

  const groupedAllRecords = useMemo(() => {
    const sorted = [...visibleAllRecords].sort((a, b) => b.date.localeCompare(a.date));
    return sorted.reduce<Array<{ date: string; items: typeof sorted }>>((groups, record) => {
      const last = groups[groups.length - 1];
      if (last && last.date === record.date) last.items.push(record);
      else groups.push({ date: record.date, items: [record] });
      return groups;
    }, []);
  }, [visibleAllRecords]);

  const dayCalories = dayRecords.reduce((sum, record) => sum + record.totalCalories, 0);
  // 营养素合计在归一化时已经补齐，这里直接加即可
  const dayProtein = dayRecords.reduce((sum, record) => sum + record.totalProtein, 0);
  const dayCarbs = dayRecords.reduce((sum, record) => sum + record.totalCarbs, 0);
  const dayFat = dayRecords.reduce((sum, record) => sum + record.totalFat, 0);

  const caloriesGoal = goals.calories > 0 ? goals.calories : 0;
  const caloriesLeft = caloriesGoal > 0 ? caloriesGoal - dayCalories : null;
  const proteinGoal = goals.protein > 0 ? goals.protein : 0;
  const waterGlasses = water[selectedDate] ?? 0;
  const WATER_GOAL = 8;

  /** 日历标记：每天记录的条数 */
  const calendarMarks = useMemo(() => {
    const map: Record<string, CalendarMark> = {};
    for (const record of records) {
      const entry = map[record.date] ?? { count: 0, label: '' };
      entry.count += 1;
      entry.label = `${entry.count} 条记录`;
      map[record.date] = entry;
    }
    return map;
  }, [records]);

  const yesterday = addDays(selectedDate, -1);
  const yesterdayRecords = records.filter((record) => record.date === yesterday);
  const canCopyYesterday = yesterdayRecords.length > 0;

  const handleCopyYesterday = (): void => {
    for (const record of yesterdayRecords) {
      addRecord(selectedDate, record.type, record.items);
    }
  };

  /** 当天有没有记录（不受搜索影响），用于空态提示 */
  const dayIsEmpty = !records.some((record) => record.date === selectedDate);
  const formCalories = form.items.reduce((sum, item) => sum + item.calories, 0);

  const weekStart = addDays(today, -6);
  const recentRecords = records.filter(
    (record) => record.date >= weekStart && record.date <= today,
  );
  const recentDays = new Set(recentRecords.map((record) => record.date)).size;
  const recentTotal = recentRecords.reduce((sum, record) => sum + record.totalCalories, 0);
  const recentAverage = recentDays === 0 ? 0 : Math.round(recentTotal / recentDays);

  const calorieByDay = useMemo(
    () =>
      seriesByDay(
        records,
        7,
        today,
        (record) => record.date,
        (record) => record.totalCalories,
      ),
    [records, today],
  );
  const calorieTrend = useMemo(() => {
    const caloriesOf = (record: MealRecord): number => record.totalCalories;
    if (trendRange === 'week') {
      return seriesByWeek(records, 4, today, (record) => record.date, caloriesOf);
    }
    if (trendRange === 'month') {
      return seriesByMonth(records, 6, today, (record) => record.date, caloriesOf);
    }
    return calorieByDay;
  }, [calorieByDay, records, today, trendRange]);
  const trendLabel = TREND_RANGE.find((range) => range.value === trendRange)?.label ?? '';

  const pendingRecord = records.find((record) => record.id === pendingDeleteId) ?? null;
  const pendingTemplate = templates.find((template) => template.id === pendingTemplateId) ?? null;

  const openAddModal = (type: MealType, date = selectedDate, template?: MealTemplate): void => {
    /*
     * 套用餐次模板（F16）：把模板的食物清单铺进表单。
     *
     * 剥掉条目 id —— 表单里的每一行都要是新的草稿，带着模板的 id 保存会让
     * 记录的条目和模板的条目共用 id，之后「按 id 定位条目」的地方就会改错地方。
     * 模板没有条目时退回一行空的，别让用户打开看到一个空白表单以为坏了。
     */
    const seeded: FoodDraft[] =
      template && template.items.length > 0
        ? template.items.map((item) => ({
            name: item.name,
            category: item.category,
            calories: item.calories,
            protein: item.protein ?? 0,
            carbs: item.carbs ?? 0,
            fat: item.fat ?? 0,
          }))
        : [emptyItem()];

    setForm({ type: template?.type ?? type, date, items: seeded });
    setShowAddModal(true);
  };

  /** 食物库的搜索结果：分类过滤 + 关键词匹配（名称） */
  const libraryFoods: LibraryFood[] = useMemo(() => {
    const all = allFoods(customFoods);
    const kw = foodKeyword.trim().toLowerCase();
    return all.filter((food) => {
      if (foodCategory !== 'all' && food.category !== foodCategory) return false;
      return kw === '' || food.name.toLowerCase().includes(kw);
    });
  }, [customFoods, foodKeyword, foodCategory]);

  /** 只展示前 60 条，避免一次渲染上千行；搜索本身就是收窄手段 */
  const visibleFoods = libraryFoods.slice(0, 60);

  /** 最近使用：按记录顺序取还在库里的前 6 个 */
  const recentFoods = useMemo(() => {
    const byName = new Map(libraryFoods.map((food) => [food.name, food]));
    return recentFoodNames
      .map((name) => byName.get(name))
      .filter((food): food is LibraryFood => food !== undefined)
      .slice(0, 6);
  }, [libraryFoods, recentFoodNames]);

  const fillFromLibrary = (food: LibraryFood): void => {
    recordFoodUsage(food.name);
    setForm((current) => {
      const filled: FoodDraft = {
        name: food.name,
        category: FOOD_CATEGORIES.includes(food.category as FoodCategory)
          ? (food.category as FoodCategory)
          : '其他',
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
      };
      // 第一行还空着就原地填，否则追加一行，方便连续加好几样
      const firstEmpty = current.items.length === 1 && current.items[0].name.trim() === '';
      return {
        ...current,
        items: firstEmpty ? [filled] : [...current.items, filled],
      };
    });
  };

  const handleAddCustomFood = (): void => {
    const name = customName.trim();
    if (!name) return;
    addCustomFood({
      name,
      category: customCategory,
      calories: typeof customCalories === 'number' ? customCalories : 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    setCustomName('');
    setCustomCalories('');
  };

  const updateItem = (index: number, patch: Partial<FoodDraft>): void => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const canSave = form.items.some((item) => item.name.trim());

  const handleAdd = (): void => {
    const validItems: FoodItem[] = form.items
      .filter((item) => item.name.trim())
      .map((item) => ({
        ...item,
        name: item.name.trim(),
        protein: item.protein > 0 ? item.protein : undefined,
        carbs: item.carbs > 0 ? item.carbs : undefined,
        fat: item.fat > 0 ? item.fat : undefined,
      }));
    if (validItems.length === 0) return;
    addRecord(form.date, form.type, validItems);
    setSelectedDate(form.date);
    setShowAddModal(false);
  };

  const itemNames = (items: FoodItem[]): string => items.map((item) => item.name).join('、');

  const renderRecordRow =
    (recordDate: string, mealType: MealType) =>
    (record: MealRecord): React.ReactElement => (
      <div
        key={record.id}
        className="flex items-start justify-between gap-3 rounded border border-line-subtle p-3"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {record.items.map((item) => (
              <span
                key={item.id ?? item.name}
                className="rounded-full bg-inset px-2 py-0.5 text-2xs text-content-secondary"
              >
                {item.name} · {item.calories} kcal
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-2xs text-content-tertiary">
            共 {formatNumber(record.totalCalories)} kcal
            {record.totalProtein > 0 && ` · 蛋白 ${Math.round(record.totalProtein)}g`}
            {record.totalCarbs > 0 && ` · 碳水 ${Math.round(record.totalCarbs)}g`}
            {record.totalFat > 0 && ` · 脂肪 ${Math.round(record.totalFat)}g`}
            {view === 'all' ? ` · ${MEAL_LABEL[mealType]} · ${recordDate}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          {/* 有食物条目才给「存成模板」：空记录存出来的模板没有意义 */}
          {record.items.length > 0 && (
            <IconButton
              label={`把「${itemNames(record.items)}」存成模板`}
              size="sm"
              icon={<Copy size={15} />}
              onClick={() => addTemplateFromRecord(record)}
            />
          )}
          <IconButton
            label={`删除「${itemNames(record.items)}」这条记录`}
            size="sm"
            icon={<Trash2 size={15} />}
            onClick={() => setPendingDeleteId(record.id)}
            className="hover:text-danger"
          />
        </div>
      </div>
    );

  return (
    <div className="space-y-section">
      <PageHeader
        title="饮食"
        description="按天记录三餐与加餐，顺带看看热量"
        icon={UtensilsCrossed}
        actions={
          <Button icon={<Plus size={16} aria-hidden />} onClick={() => openAddModal(form.type)}>
            记录饮食
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="当日摄入"
          value={formatNumber(dayCalories)}
          unit="kcal"
          tone="warning"
          icon={<Flame size={16} aria-hidden />}
          footer={selectedDate === today ? '今天' : formatDayLabel(selectedDate)}
        />
        <StatCard
          label="当日餐次"
          value={dayRecords.length}
          unit="条"
          icon={<UtensilsCrossed size={16} aria-hidden />}
        />
        <StatCard
          label="近 7 天日均"
          value={formatNumber(recentAverage)}
          unit="kcal"
          tone="accent"
          icon={<TrendingUp size={16} aria-hidden />}
          footer={
            recentDays === 0 ? (
              '最近 7 天还没有记录'
            ) : (
              <span className="block space-y-1.5">
                <span className="block">按 {recentDays} 天有记录的天数计算</span>
                <Sparkline
                  data={calorieByDay.map((point) => point.value)}
                  label="近 7 天每日摄入热量趋势"
                  tone="warning"
                  height={24}
                />
              </span>
            )
          }
        />
        <StatCard
          label="累计记录"
          value={records.length}
          unit="条"
          icon={<CalendarDays size={16} aria-hidden />}
        />
      </div>

      <Card>
        <CardHeader
          title="营养目标与饮水"
          subtitle={
            caloriesGoal > 0
              ? caloriesLeft !== null && caloriesLeft >= 0
                ? `还剩 ${formatNumber(caloriesLeft)} kcal 额度`
                : `已超出 ${formatNumber(Math.abs(caloriesLeft ?? 0))} kcal`
              : '设置每日目标后可以看剩余额度'
          }
          action={
            selectedDate === today && canCopyYesterday ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<Copy size={14} aria-hidden />}
                onClick={handleCopyYesterday}
              >
                复制昨天
              </Button>
            ) : null
          }
        />
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-center gap-6">
            <ProgressRing
              value={dayCalories}
              max={caloriesGoal > 0 ? caloriesGoal : 1}
              size={88}
              tone={caloriesLeft !== null && caloriesLeft < 0 ? 'danger' : 'accent'}
              label={`${formatDayLabel(selectedDate)}热量目标完成度`}
            >
              {caloriesGoal > 0
                ? `${Math.min(999, Math.round((dayCalories / caloriesGoal) * 100))}%`
                : '—'}
            </ProgressRing>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap gap-2 text-xs text-content-tertiary">
                <Badge tone="info">蛋白 {Math.round(dayProtein)}g</Badge>
                <Badge tone="warning">碳水 {Math.round(dayCarbs)}g</Badge>
                <Badge tone="danger">脂肪 {Math.round(dayFat)}g</Badge>
              </div>
              {proteinGoal > 0 && (
                <ProgressBar
                  value={dayProtein}
                  max={proteinGoal}
                  showValue
                  label={`蛋白质目标 ${Math.round(dayProtein)}/${proteinGoal}g`}
                  tone={dayProtein >= proteinGoal ? 'success' : 'accent'}
                />
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-36">
                  <NumberInput
                    label="热量目标"
                    value={goals.calories}
                    onChange={(value) => setGoals({ ...goals, calories: value === '' ? 0 : value })}
                    min={0}
                    step={100}
                    suffix="kcal"
                  />
                </div>
                <div className="w-36">
                  <NumberInput
                    label="蛋白质目标"
                    value={goals.protein}
                    onChange={(value) => setGoals({ ...goals, protein: value === '' ? 0 : value })}
                    min={0}
                    step={10}
                    suffix="g"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-content-secondary">
              饮水 {waterGlasses}/{WATER_GOAL} 杯
            </p>
            <div role="group" aria-label="饮水打卡" className="flex flex-wrap gap-1.5">
              {Array.from({ length: WATER_GOAL }, (_, index) => {
                const filled = index < waterGlasses;
                return (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={filled}
                    aria-label={`第 ${index + 1} 杯水`}
                    onClick={() => setWater(selectedDate, filled ? index : index + 1)}
                    className={`h-8 w-8 rounded-full border transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
                      filled
                        ? 'border-info bg-info-soft text-info'
                        : 'border-line-subtle bg-inset text-content-tertiary hover:text-content-secondary'
                    }`}
                  >
                    <Droplet size={14} aria-hidden className="mx-auto" />
                  </button>
                );
              })}
            </div>
          </div>
        </CardBody>
      </Card>

      {records.length > 0 && (
        <Card>
          <CardHeader
            title="热量趋势"
            subtitle={`${trendLabel}的摄入热量合计`}
            action={
              <SegmentedControl
                label="切换热量趋势区间"
                value={trendRange}
                onChange={setTrendRange}
                options={TREND_RANGE}
              />
            }
          />
          <CardBody>
            <BarChart
              data={calorieTrend}
              label={`热量趋势（${trendLabel}）`}
              tone="warning"
              formatValue={(value) => `${formatNumber(value)} kcal`}
              formatDate={trendRange === 'month' ? formatMonthLabel : formatShortDate}
            />
          </CardBody>
        </Card>
      )}

      <Toolbar
        search={{ value: keyword, onChange: setKeyword, placeholder: '搜索食物或分类…' }}
        actions={
          <SegmentedControl
            label="切换饮食视图"
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: '按日' },
              { value: 'all', label: '全部记录', count: records.length },
            ]}
          />
        }
      >
        {view === 'day' && (
          <div className="flex items-center gap-2">
            <IconButton
              label="前一天"
              size="sm"
              icon={<ChevronLeft size={16} />}
              onClick={() => setSelectedDate((date) => addDays(date, -1))}
            />
            <div className="w-40">
              <Input
                aria-label="选择日期"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </div>
            <IconButton
              label="后一天"
              size="sm"
              icon={<ChevronRight size={16} />}
              disabled={selectedDate >= today}
              onClick={() => setSelectedDate((date) => addDays(date, 1))}
            />
            {selectedDate !== today && (
              <Button size="sm" variant="ghost" onClick={() => setSelectedDate(today)}>
                回到今天
              </Button>
            )}
          </div>
        )}
      </Toolbar>

      {view === 'day' && (
        <Card>
          <CardHeader title="饮食日历" subtitle="点一天可以切换到那天查看与记录" />
          <CardBody>
            <MonthCalendar
              label="饮食日历"
              selected={selectedDate}
              onSelect={setSelectedDate}
              marks={calendarMarks}
            />
          </CardBody>
        </Card>
      )}

      {/*
        餐次模板（F16）：只在日视图出现，因为它的用途就是「给这一天快速铺一餐」。
        一条模板都没攒起来时整块不显示 —— 空着占地方，用户也不知道该拿它做什么。
      */}
      {view === 'day' && templates.length > 0 && (
        <Card>
          <CardHeader title="常吃组合" subtitle="点一下就按这一天的日期铺开，之后还能在表单里改" />
          <CardBody>
            <ul className="flex flex-wrap gap-2">
              {templates.map((template) => (
                <li key={template.id}>
                  <div className="flex items-center overflow-hidden rounded-full border border-line-subtle bg-inset">
                    <button
                      type="button"
                      aria-label={`用模板「${template.name}」记录到 ${selectedDate}`}
                      onClick={() => openAddModal(template.type, selectedDate, template)}
                      className="px-3 py-1 text-xs text-content-secondary transition-colors duration-fast hover:bg-inset-strong hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                    >
                      {template.name}
                      <span className="ml-1.5 text-2xs text-content-tertiary">
                        {formatNumber(template.items.reduce((sum, item) => sum + item.calories, 0))}{' '}
                        kcal
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`删除模板「${template.name}」`}
                      onClick={() => setPendingTemplateId(template.id)}
                      className="border-l border-line-subtle px-2 py-1 text-content-tertiary transition-colors duration-fast hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {view === 'day' ? (
        dayRecords.length === 0 && keyword.trim() !== '' ? (
          <Card>
            <EmptyState
              icon={<UtensilsCrossed size={22} aria-hidden />}
              title="没有匹配的食物"
              description="换个关键词，或者清除搜索，看这一天的全部记录。"
              action={
                <Button variant="secondary" onClick={() => setKeyword('')}>
                  清除搜索
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            {dayIsEmpty && (
              <Card className="flex flex-wrap items-center gap-2 p-4 text-sm text-content-tertiary">
                <UtensilsCrossed size={16} aria-hidden />
                {formatDayLabel(selectedDate)}这天还是空的，点下面餐次卡片里的「添加」记一条。
              </Card>
            )}
            <div className="grid gap-4">
              {MEAL_ORDER.map((mealType) => {
                const mealRecords = dayRecords.filter((record) => record.type === mealType);
                const mealCalories = mealRecords.reduce(
                  (sum, record) => sum + record.totalCalories,
                  0,
                );
                const MealIcon = MEAL_ICON[mealType];
                return (
                  <Card key={mealType}>
                    <CardHeader
                      title={`${MEAL_LABEL[mealType]} · ${formatNumber(mealCalories)} kcal`}
                      subtitle={`${mealRecords.length} 条记录`}
                      action={
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Plus size={14} aria-hidden />}
                          onClick={() => openAddModal(mealType)}
                        >
                          添加
                        </Button>
                      }
                    />
                    <CardBody className="space-y-2">
                      {mealRecords.length === 0 ? (
                        <p className="flex items-center gap-2 text-sm text-content-tertiary">
                          <MealIcon size={14} aria-hidden />
                          还没有记录
                        </p>
                      ) : (
                        mealRecords.map((record) => renderRecordRow(selectedDate, mealType)(record))
                      )}
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </>
        )
      ) : groupedAllRecords.length === 0 ? (
        <ListEmptyState
          icon={<CalendarDays size={22} aria-hidden />}
          filtered={filteredOut}
          emptyTitle="还没有任何饮食记录"
          emptyDescription="记录第一条饮食后，这里会按日期汇总。"
          emptyAction={
            <Button icon={<Plus size={16} aria-hidden />} onClick={() => openAddModal('breakfast')}>
              记录饮食
            </Button>
          }
          filteredTitle="没有符合条件的记录"
          filteredDescription="换个关键词试试，比如食物名或分类。"
          onClearFilters={clearFilters}
        />
      ) : (
        <div className="space-y-section">
          {groupedAllRecords.map((group) => {
            const groupCalories = group.items.reduce(
              (sum, record) => sum + record.totalCalories,
              0,
            );
            return (
              <section key={group.date} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Divider label={formatDayLabel(group.date)} className="flex-1" />
                  <Badge tone={group.date === today ? 'accent' : 'default'}>
                    {formatNumber(groupCalories)} kcal
                  </Badge>
                </div>
                <div className="grid gap-2">
                  {group.items.map((record) => renderRecordRow(group.date, record.type)(record))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="记录饮食"
        description="热量可以估算，先记下来再慢慢校准"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              取消
            </Button>
            <Button onClick={handleAdd} disabled={!canSave}>
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="日期"
              type="date"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
            />
            <Select
              label="餐次"
              value={form.type}
              onChange={(value) => setForm({ ...form, type: value as MealType })}
              options={MEAL_OPTIONS}
            />
          </div>

          <Button
            size="sm"
            variant="secondary"
            icon={<UtensilsCrossed size={14} aria-hidden />}
            onClick={() => {
              setFoodKeyword('');
              setFoodCategory('all');
              setShowFoodPicker(true);
            }}
          >
            从食物库选择
          </Button>

          <div className="space-y-3">
            {form.items.map((item, index) => (
              <div key={index} className="rounded border border-line-subtle p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      aria-label={`第 ${index + 1} 个食物名称`}
                      value={item.name}
                      onChange={(event) => updateItem(index, { name: event.target.value })}
                      placeholder="食物名，如：鸡胸肉"
                    />
                  </div>
                  <IconButton
                    label={`移除第 ${index + 1} 个食物`}
                    size="sm"
                    icon={<X size={14} />}
                    disabled={form.items.length === 1}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        items: current.items.filter((_, i) => i !== index),
                      }))
                    }
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Select
                    aria-label={`第 ${index + 1} 个食物的分类`}
                    value={item.category}
                    onChange={(value) => updateItem(index, { category: value })}
                    options={CATEGORY_OPTIONS}
                  />
                  <NumberInput
                    ariaLabel={`第 ${index + 1} 个食物的热量`}
                    value={item.calories}
                    onChange={(value) => updateItem(index, { calories: value === '' ? 0 : value })}
                    min={0}
                    step={10}
                    suffix="kcal"
                  />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <NumberInput
                    ariaLabel={`第 ${index + 1} 个食物的蛋白质`}
                    value={item.protein}
                    onChange={(value) => updateItem(index, { protein: value === '' ? 0 : value })}
                    min={0}
                    step={1}
                    suffix="g 蛋白"
                  />
                  <NumberInput
                    ariaLabel={`第 ${index + 1} 个食物的碳水`}
                    value={item.carbs}
                    onChange={(value) => updateItem(index, { carbs: value === '' ? 0 : value })}
                    min={0}
                    step={1}
                    suffix="g 碳水"
                  />
                  <NumberInput
                    ariaLabel={`第 ${index + 1} 个食物的脂肪`}
                    value={item.fat}
                    onChange={(value) => updateItem(index, { fat: value === '' ? 0 : value })}
                    min={0}
                    step={1}
                    suffix="g 脂肪"
                  />
                </div>
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus size={14} aria-hidden />}
              onClick={() =>
                setForm((current) => ({ ...current, items: [...current.items, emptyItem()] }))
              }
            >
              添加食物
            </Button>
          </div>

          <p className="rounded bg-inset px-3 py-2 text-sm text-content-secondary">
            合计{' '}
            <span className="font-semibold text-content tabular">{formatNumber(formCalories)}</span>{' '}
            kcal
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={showFoodPicker}
        onClose={() => setShowFoodPicker(false)}
        title="从食物库选择"
        description="数值按 100g 可食部分记，填进来之后按实际吃的量改"
        size="lg"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1">
              <Input
                label="搜索"
                value={foodKeyword}
                onChange={(event) => setFoodKeyword(event.target.value)}
                placeholder="如：鸡胸、米饭、拿铁…"
              />
            </div>
            <div className="w-36">
              <Select
                label="分类"
                value={foodCategory}
                onChange={(value) => setFoodCategory(value as 'all' | FoodCategory)}
                options={[
                  { value: 'all', label: '全部分类' },
                  ...FOOD_CATEGORIES.map((category) => ({
                    value: category,
                    label: category,
                  })),
                ]}
              />
            </div>
          </div>

          {foodKeyword.trim() === '' && foodCategory === 'all' && recentFoods.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-content-secondary">最近使用</p>
              <div className="flex flex-wrap gap-1.5">
                {recentFoods.map((food) => (
                  <button
                    key={food.name}
                    type="button"
                    onClick={() => fillFromLibrary(food)}
                    className="inline-flex items-center gap-1 rounded-full bg-inset px-3 py-1 text-xs text-content-secondary transition-colors duration-fast ease-standard hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                  >
                    {food.name}
                    <span className="text-2xs text-content-tertiary tabular">
                      {food.calories} kcal
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <ul className="max-h-64 divide-y divide-line-subtle overflow-y-auto rounded border border-line-subtle">
            {visibleFoods.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-content-tertiary">
                库里没有匹配的食物，可以在下面存一条自建的。
              </li>
            ) : (
              visibleFoods.map((food) => (
                <li key={food.id ?? food.name} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="truncate text-sm text-content">{food.name}</span>
                      <Badge tone="default">{food.category}</Badge>
                      {!FOOD_SEEDS.some((seed) => seed.name === food.name) && (
                        <Badge tone="accent">自建</Badge>
                      )}
                    </div>
                    <span className="text-2xs text-content-tertiary tabular">
                      {food.calories} kcal · 蛋白 {food.protein}g · 碳水 {food.carbs}g · 脂肪{' '}
                      {food.fat}g
                    </span>
                  </div>
                  {food.id && (
                    <IconButton
                      label={`删除自建食物「${food.name}」`}
                      size="sm"
                      icon={<X size={13} />}
                      onClick={() => deleteCustomFood(food.id!)}
                      className="hover:text-danger"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`把「${food.name}」填入表单`}
                    onClick={() => fillFromLibrary(food)}
                  >
                    填入
                  </Button>
                </li>
              ))
            )}
          </ul>
          {libraryFoods.length > visibleFoods.length && (
            <p className="text-xs text-content-tertiary">
              只显示前 {visibleFoods.length} 条，共 {libraryFoods.length} 条，继续输入关键词收窄。
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
                  value={customName}
                  onChange={(event) => setCustomName(event.target.value)}
                  placeholder={foodKeyword.trim() || '自定义食物名'}
                />
              </div>
              <div className="w-32">
                <Select
                  label="分类"
                  value={customCategory}
                  onChange={(value) => setCustomCategory(value as FoodCategory)}
                  options={FOOD_CATEGORIES.map((category) => ({
                    value: category,
                    label: category,
                  }))}
                />
              </div>
              <div className="w-32">
                <NumberInput
                  label="热量(100g)"
                  value={customCalories}
                  onChange={(value) => setCustomCalories(value)}
                  min={0}
                  step={10}
                  suffix="kcal"
                />
              </div>
              <Button
                variant="secondary"
                onClick={handleAddCustomFood}
                disabled={!customName.trim()}
              >
                存入食物库
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={pendingRecord !== null}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => {
          const target = pendingRecord;
          const snapshot = records;
          if (pendingDeleteId) deleteRecord(pendingDeleteId);
          setPendingDeleteId(null);
          if (target) {
            undoableRemove({
              message: '已删除这条饮食记录',
              description: '点「撤销」可以恢复。',
              snapshot,
              restore: replaceRecords,
            });
          }
        }}
        title="删除饮食记录"
        description={
          pendingRecord
            ? `确定要删除${pendingRecord.date}的「${itemNames(pendingRecord.items)}」吗？共 ${pendingRecord.totalCalories} kcal。`
            : ''
        }
        confirmText="删除"
        tone="danger"
      />

      {/*
        删模板的确认框也是「删除」，但语气不一样：模板删掉不影响任何已有记录，
        重建也只是再攒一次。所以描述里把这点说清楚，免得用户以为会连带丢数据。
      */}
      <ConfirmDialog
        isOpen={pendingTemplate !== null}
        onClose={() => setPendingTemplateId(null)}
        onConfirm={() => {
          if (pendingTemplateId) deleteTemplate(pendingTemplateId);
          setPendingTemplateId(null);
        }}
        title="删除餐次模板"
        description={
          pendingTemplate
            ? `确定要删除模板「${pendingTemplate.name}」吗？已经记录下来的饮食不受影响。`
            : ''
        }
        confirmText="删除"
        tone="danger"
      />
    </div>
  );
};

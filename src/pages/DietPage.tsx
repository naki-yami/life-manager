import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coffee,
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
  SegmentedControl,
  Select,
  StatCard,
} from '../components/ui';
import { PageHeader, Toolbar } from '../components/layout';
import { BarChart, Sparkline } from '../components/charts';
import { useDietStore } from '../store/dietStore';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { filterByKeyword, matchesKeyword } from '../utils/search';
import {
  addDays,
  formatDayLabel,
  formatMonthLabel,
  formatNumber,
  formatShortDate,
  todayKey,
} from '../utils/date';
import { seriesByDay, seriesByMonth, seriesByWeek } from '../utils/stats';
import { FoodItem, MealRecord, MealType } from '../types';

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

const FOOD_CATEGORIES = ['主食', '蛋白质', '蔬菜', '水果', '乳制品', '饮品', '零食', '其他'];

const CATEGORY_OPTIONS = FOOD_CATEGORIES.map((category) => ({
  value: category,
  label: category,
}));

const MEAL_OPTIONS = MEAL_ORDER.map((type) => ({ value: type, label: MEAL_LABEL[type] }));

const emptyItem = (): FoodDraft => ({ name: '', category: '主食', calories: 0 });

export const DietPage: React.FC = () => {
  const { records, addRecord, deleteRecord, replaceRecords } = useDietStore();
  const undoableRemove = useUndoableRemove();

  const [view, setView] = useState<View>('day');
  const [trendRange, setTrendRange] = useState<TrendRange>('day');
  const [keyword, setKeyword] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<{ type: MealType; date: string; items: FoodDraft[] }>({
    type: 'breakfast',
    date: todayKey(),
    items: [emptyItem()],
  });

  const today = todayKey();

  const dayRecords = useMemo(() => {
    const forDay = records.filter((record) => record.date === selectedDate);
    if (keyword.trim() === '') return forDay;
    return forDay.filter((record) =>
      record.items.some((item) => matchesKeyword(keyword, item.name, item.category)),
    );
  }, [records, selectedDate, keyword]);

  const visibleAllRecords = useMemo(
    () =>
      filterByKeyword(records, keyword, (record) => [
        record.date,
        ...record.items.map((item) => item.name),
        ...record.items.map((item) => item.category),
      ]),
    [records, keyword],
  );

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

  const openAddModal = (type: MealType, date = selectedDate): void => {
    setForm({ type, date, items: [emptyItem()] });
    setShowAddModal(true);
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
      .map((item) => ({ ...item, name: item.name.trim() }));
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
            {view === 'all' ? ` · ${MEAL_LABEL[mealType]} · ${recordDate}` : ''}
          </p>
        </div>
        <IconButton
          label={`删除「${itemNames(record.items)}」这条记录`}
          size="sm"
          icon={<Trash2 size={15} />}
          onClick={() => setPendingDeleteId(record.id)}
          className="hover:text-danger"
        />
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
        <Card>
          <EmptyState
            icon={<CalendarDays size={22} aria-hidden />}
            title={records.length === 0 ? '还没有任何饮食记录' : '没有符合条件的记录'}
            description={
              records.length === 0
                ? '记录第一条饮食后，这里会按日期汇总。'
                : '换个关键词试试，比如食物名或分类。'
            }
            action={
              records.length === 0 ? (
                <Button
                  icon={<Plus size={16} aria-hidden />}
                  onClick={() => openAddModal('breakfast')}
                >
                  记录饮食
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
    </div>
  );
};

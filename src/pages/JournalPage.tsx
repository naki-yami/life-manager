import React, { useMemo, useState } from 'react';
import { BookHeart, ChevronLeft, ChevronRight, Save, Smile, Trash2, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ExportableCard,
  IconButton,
  SegmentedControl,
  TagChips,
  TagInput,
  Textarea,
} from '../components/ui';
import { MasterDetail, PageHeader } from '../components/layout';
import { LineChart } from '../components/charts';
import { useJournalStore } from '../store/journalStore';
import { useUndoableRemove } from '../hooks/useUndoableRemove';
import { useOptionalToast } from '../components/ui/toastContext';
import {
  MOOD_BARS,
  MOOD_LABELS,
  MOOD_LEVELS,
  clampMood,
  formatMood,
  isEmptyDraft,
  journalChars,
  journalEntryOn,
  moodBuckets,
  moodDistribution,
  moodPoints,
  moodTone,
  summarizeJournal,
} from '../utils/journal';
import type { MoodTone } from '../utils/journal';
import {
  addDays,
  formatDayLabel,
  formatMonthLabel,
  formatShortDate,
  todayKey,
} from '../utils/date';
import type { JournalEntry } from '../types';

/**
 * 日记与心情。
 *
 * 四个取舍：
 * - **一天一条，左边挑日期、右边就地写**：列表里点一天，右侧直接编辑那天的内容；
 *   窄屏则滑出抽屉。切换日期不会打断写字的上下文。
 * - **趋势图只连记过心情的日子**：缺的日子不补 0（见 utils/journal 的口径说明），
 *   周 / 月聚合取均值而不是求和 —— 一周七天都是「一般」不该读成 21 分。
 * - **清空就是删除**：心情、标签、正文全部清干净再保存，这条记录就消失，
 *   而不是留一篇空白日记把列表撑长。删除走带「撤销」的提示，误删可回退。
 * - **心情是有方向的**：从糟到好两头发红、中间中性、好的一头走绿，
 *   所以没有用图表那套分类色（chart-1..8 读不出好坏）。
 */

/** 趋势窗口：近 30 天，和首页热力图同一个口径 */
const TREND_DAYS = 30;

/**
 * 心情档位选中时的实心配色，与分布条、徽章同一套语义色。
 * 心情有方向，所以两头发红、中间中性、好的一头走绿。
 */
const MOOD_ACTIVE: Record<MoodTone, string> = {
  default: 'bg-inset text-content',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
};

type TrendMode = 'week' | 'month';

const TREND_OPTIONS: Array<{ value: TrendMode; label: string }> = [
  { value: 'week', label: '按周' },
  { value: 'month', label: '按月' },
];

interface Draft {
  mood: number;
  tags: string[];
  text: string;
}

const draftOf = (entry: JournalEntry | undefined): Draft => ({
  mood: entry?.mood ?? 0,
  tags: entry ? [...entry.tags] : [],
  text: entry?.text ?? '',
});

export const JournalPage: React.FC = () => {
  const entries = useJournalStore((state) => state.entries);
  const saveEntry = useJournalStore((state) => state.saveEntry);
  const deleteEntry = useJournalStore((state) => state.deleteEntry);
  const replaceEntries = useJournalStore((state) => state.replaceEntries);

  const toast = useOptionalToast();
  const undoableRemove = useUndoableRemove();

  const today = todayKey();
  /** null = 还没挑日期：宽屏显示占位，窄屏不弹出抽屉 */
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [trendMode, setTrendMode] = useState<TrendMode>('week');

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  );
  const summary = useMemo(() => summarizeJournal(entries), [entries]);
  const distribution = useMemo(() => moodDistribution(entries), [entries]);
  const points = useMemo(() => moodPoints(entries, TREND_DAYS, today), [entries, today]);
  const buckets = useMemo(() => moodBuckets(points, trendMode), [points, trendMode]);
  const suggestions = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.tags))],
    [entries],
  );

  const stored = selectedDate ? journalEntryOn(entries, selectedDate) : undefined;

  /**
   * 还没保存的草稿按日期暂存在这里。
   *
   * 直接让表单跟着日期重建（ReviewPage 那种写法）在日记上是危险的：
   * 用户可能写了几百字，只是想翻回昨天看一眼，回来就发现字没了。
   * 所以切走时把草稿留在内存里，切回来还在；真正落库仍然要按保存。
   */
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const draft: Draft = (selectedDate !== null && drafts[selectedDate]) || draftOf(stored);

  const updateDraft = (patch: Partial<Draft>): void => {
    if (selectedDate === null) return;
    setDrafts((map) => ({ ...map, [selectedDate]: { ...draft, ...patch } }));
  };

  /** 保存或删除之后丢掉这一天的草稿，让它重新从库里读 */
  const dropDraft = (date: string): void =>
    setDrafts((map) => {
      const next = { ...map };
      delete next[date];
      return next;
    });

  const dirty =
    selectedDate !== null &&
    (clampMood(draft.mood) !== (stored?.mood ?? 0) ||
      draft.tags.join('\u0000') !== (stored?.tags ?? []).join('\u0000') ||
      draft.text.trim() !== (stored?.text ?? ''));

  const open = (date: string): void => setSelectedDate(date);

  const handleSave = (): void => {
    if (!selectedDate) return;
    const hadEntry = stored !== undefined;
    const date = selectedDate;
    saveEntry(date, draft);
    dropDraft(date);
    const cleared = isEmptyDraft({
      mood: clampMood(draft.mood),
      tags: draft.tags,
      text: draft.text.trim(),
    });
    toast?.toast({
      tone: 'success',
      title: cleared && hadEntry ? '这一天的记录已清空' : '已保存',
      description: formatDayLabel(date),
    });
  };

  const handleDelete = (): void => {
    if (!selectedDate || !stored) return;
    const date = selectedDate;
    undoableRemove({
      message: '已删除这一天的日记',
      description: formatDayLabel(date),
      snapshot: entries,
      restore: replaceEntries,
    });
    deleteEntry(stored.id);
    dropDraft(date);
    setSelectedDate(null);
  };

  const editor =
    selectedDate === null ? null : (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <IconButton
              label="前一天"
              size="sm"
              icon={<ChevronLeft size={15} aria-hidden />}
              onClick={() => open(addDays(selectedDate, -1))}
            />
            <span className="truncate text-sm font-medium text-content">
              {formatDayLabel(selectedDate)}
            </span>
            <IconButton
              label="后一天"
              size="sm"
              icon={<ChevronRight size={15} aria-hidden />}
              disabled={selectedDate >= today}
              onClick={() => open(addDays(selectedDate, 1))}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {selectedDate === today ? (
              <Badge tone="accent">今天</Badge>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => open(today)}>
                回到今天
              </Button>
            )}
            {stored && !dirty && <Badge tone="success">已保存</Badge>}
            {dirty && <Badge tone="warning">有未保存的修改</Badge>}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-content">今天心情怎么样</p>
          <div role="group" aria-label="选择这一天的心情" className="flex flex-wrap gap-2">
            {MOOD_LEVELS.map((level) => {
              const active = clampMood(draft.mood) === level;
              return (
                <button
                  key={level}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateDraft({ mood: draft.mood === level ? 0 : level })}
                  className={`rounded-full px-3 py-1 text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
                    active
                      ? `font-medium ${MOOD_ACTIVE[moodTone(level)]}`
                      : 'bg-inset text-content-secondary hover:text-content'
                  }`}
                >
                  {MOOD_LABELS[level]}
                </button>
              );
            })}
            {clampMood(draft.mood) !== 0 && (
              <button
                type="button"
                onClick={() => updateDraft({ mood: 0 })}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-content-tertiary transition-colors duration-fast hover:text-content"
              >
                <X size={12} aria-hidden />
                清除
              </button>
            )}
          </div>
        </div>

        <TagInput
          label="标签"
          value={draft.tags}
          onChange={(tags) => updateDraft({ tags })}
          suggestions={suggestions}
          placeholder="回车或逗号收下标签"
          hint="用来分类，比如「工作」「家人」「旅行」"
        />

        <Textarea
          label="今天发生了什么"
          value={draft.text}
          rows={10}
          placeholder="写具体的事比写「还行」有用得多"
          onChange={(event) => updateDraft({ text: event.target.value })}
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs tabular text-content-tertiary">
            {journalChars(draft.text)} 字
          </span>
          <div className="flex items-center gap-2">
            {stored && (
              <Button
                variant="ghost"
                icon={<Trash2 size={15} aria-hidden />}
                onClick={handleDelete}
              >
                删除
              </Button>
            )}
            <Button icon={<Save size={15} aria-hidden />} onClick={handleSave}>
              保存
            </Button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="space-y-section">
      <PageHeader
        title="日记与心情"
        icon={BookHeart}
        description={
          summary.total > 0
            ? `写过的 ${summary.total} 篇里，有 ${summary.withMood} 篇记了心情 · 平均 ${summary.average || '—'} 分`
            : '每天几句、一个心情档位，攒起来就是一条能回看的曲线'
        }
        actions={
          <Button icon={<Smile size={16} aria-hidden />} onClick={() => open(today)}>
            写今天
          </Button>
        }
      />

      <MasterDetail
        detailTitle="写这一天"
        detailOpen={selectedDate !== null}
        onCloseDetail={() => setSelectedDate(null)}
        detailWidth="w-[28rem]"
        drawerWidth="lg"
        emptyDetail={
          <EmptyState
            icon={<BookHeart size={20} aria-hidden />}
            title="还没挑日期"
            description="点左边任意一天，就能在这里写那天的日记；也可以直接点右上角「写今天」。"
            className="py-6"
          />
        }
        detail={editor}
      >
        <div className="space-y-4">
          <ExportableCard
            title="心情趋势"
            subtitle={`近 ${TREND_DAYS} 天，只统计记了心情的日子`}
            exportLabel="心情趋势"
          >
            <div className="mb-3">
              <SegmentedControl
                label="趋势聚合粒度"
                size="sm"
                value={trendMode}
                onChange={setTrendMode}
                options={TREND_OPTIONS}
              />
            </div>
            <LineChart
              data={buckets}
              label="心情趋势"
              formatValue={(value) => `${value} 分`}
              formatDate={trendMode === 'month' ? formatMonthLabel : formatShortDate}
            />
          </ExportableCard>

          <Card>
            <CardHeader
              title="心情分布"
              subtitle={
                summary.withMood > 0
                  ? `${summary.withMood} 篇记了心情 · 平均 ${summary.average} 分`
                  : '还没有记过心情'
              }
            />
            <CardBody>
              <div className="space-y-2">
                {distribution.map(({ level, count }) => {
                  const share =
                    summary.withMood === 0 ? 0 : Math.round((count / summary.withMood) * 100);
                  return (
                    <div key={level} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-xs text-content-secondary">
                        {MOOD_LABELS[level]}
                      </span>
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-inset">
                        <div
                          className={`h-full rounded-full transition-[width] duration-slow ease-standard ${MOOD_BARS[level]} `}
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs tabular text-content-tertiary">
                        {count} 篇
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="全部日记"
              subtitle={
                summary.total > 0
                  ? `${summary.total} 篇 · 累计 ${summary.chars} 字`
                  : '一天一条，写第二次是修正'
              }
            />
            <CardBody>
              {sorted.length === 0 ? (
                <EmptyState
                  icon={<BookHeart size={20} aria-hidden />}
                  title="还没有写过日记"
                  description="点右上角「写今天」，从今天开始记。"
                  className="py-6"
                />
              ) : (
                <ul className="space-y-2">
                  {sorted.map((entry) => {
                    const active = entry.date === selectedDate;
                    const chars = journalChars(entry.text);
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => open(entry.date)}
                          aria-current={active || undefined}
                          className={`w-full rounded border px-3 py-2 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
                            active
                              ? 'border-line-focus bg-accent-soft'
                              : 'border-line-subtle hover:border-line hover:bg-hover'
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs tabular text-content-secondary">
                              {formatDayLabel(entry.date)}
                            </span>
                            {entry.date === today && <Badge tone="accent">今天</Badge>}
                            {clampMood(entry.mood) === 0 ? (
                              <Badge tone="default">未记心情</Badge>
                            ) : (
                              <Badge tone={moodTone(entry.mood)}>
                                {formatMood(clampMood(entry.mood))}
                              </Badge>
                            )}
                          </div>
                          {entry.text && (
                            <p className="mt-1.5 line-clamp-1 text-sm text-content">{entry.text}</p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <TagChips tags={entry.tags} max={3} />
                            {chars > 0 && (
                              <span className="text-2xs tabular text-content-tertiary">
                                {chars} 字
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </MasterDetail>
    </div>
  );
};

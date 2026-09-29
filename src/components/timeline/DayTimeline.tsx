import React, { useMemo } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { ChevronDown, ChevronUp, Clock, GripVertical, Minus, Play, Plus, X } from 'lucide-react';
import { IconButton, Select } from '../ui';
import {
  MIN_TIMEBOX_MINUTES,
  SLOT_MINUTES,
  STEP_MINUTES,
  layoutTimeboxes,
  minutesToTime,
  timeToMinutes,
  timeboxRangeLabel,
  timelinePosition,
  timelineSlots,
} from '../../utils/focus';

/**
 * 今日时间轴。
 *
 * 设计上的四个取舍：
 * - **一格 30 分钟**：再细就是在填日历，而不是排一天；拖拽落点、按钮微调都按 30 分钟走；
 * - **拖拽只是加速器，不是唯一入口**：每个待排任务旁边有一个「排到…」下拉，
 *   键盘与读屏用户不必跟指针较劲，测试也不用去模拟拖拽事件；
 * - **重叠就并排画**：同一个人不可能同时做两件事，与其偷偷把其中一个挪走，
 *   不如摊开让人自己决定删哪个（分列算法在 utils/focus.layoutTimeboxes）；
 * - **刻度画到 24:00，但放在滚动区里**：18 小时全画出来才不会「看不见晚上」，
 *   高度交给滚动条，不压到别的卡片。
 */

/** 一格 30 分钟的高度：40px 够塞下标题 + 一排小按钮 */
const SLOT_HEIGHT = 40;
/** 再短的时间盒也要放得下标题与按钮 */
const BOX_MIN_HEIGHT = 52;

export interface TimelineEntry {
  /** 任务 id */
  id: string;
  title: string;
  /** 开始时间 HH:mm */
  start: string;
  minutes: number;
  done: boolean;
}

export interface TimelineCandidate {
  id: string;
  title: string;
}

export interface DayTimelineProps {
  /** 无障碍名称，例如「2026-09-29 的时间轴」 */
  label: string;
  /** 已经排进这一天的任务 */
  entries: readonly TimelineEntry[];
  /** 还没排的候选任务 */
  candidates: readonly TimelineCandidate[];
  /** 把任务排到某个开始时间（HH:mm）；拖拽与下拉都走这里 */
  onSchedule: (id: string, start: string) => void;
  /** 改时长（分钟，绝对值） */
  onResize: (id: string, minutes: number) => void;
  /** 撤下时间轴 */
  onRemove: (id: string) => void;
  /** 开始专注 */
  onFocus: (id: string) => void;
  /** 正在专注的任务 id，用来高亮那一个盒子 */
  activeId?: string | null;
}

const Slot: React.FC<{ time: string }> = ({ time }) => {
  const { setNodeRef, isOver } = useDroppable({ id: time });
  return (
    <li
      ref={setNodeRef}
      style={{ height: SLOT_HEIGHT }}
      className={`border-t border-line-subtle transition-colors duration-fast ${
        isOver ? 'bg-accent-soft' : ''
      }`}
    >
      <span className="sr-only">{`${time} 起的时段`}</span>
    </li>
  );
};

interface BoxProps {
  entry: TimelineEntry;
  top: number;
  height: number;
  lane: number;
  lanes: number;
  active: boolean;
  onSchedule: (id: string, start: string) => void;
  onResize: (id: string, minutes: number) => void;
  onRemove: (id: string) => void;
  onFocus: (id: string) => void;
}

const Box: React.FC<BoxProps> = ({
  entry,
  top,
  height,
  lane,
  lanes,
  active,
  onSchedule,
  onResize,
  onRemove,
  onFocus,
}) => {
  const start = timeToMinutes(entry.start) ?? 0;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        top: `${top}%`,
        minHeight: `${height}%`,
        left: `${(lane / lanes) * 100}%`,
        width: `${100 / lanes}%`,
      }}
      className="pointer-events-auto absolute p-0.5"
    >
      <div
        style={{
          minHeight: BOX_MIN_HEIGHT,
          transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        }}
        className={`flex h-full flex-col gap-0.5 rounded-md border bg-surface-raised p-1.5 shadow-xs transition-colors duration-fast ${
          active ? 'border-accent' : 'border-line-subtle'
        } ${isDragging ? 'opacity-70' : ''} ${entry.done ? 'opacity-60' : ''}`}
      >
        <div className="flex items-start gap-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`拖动「${entry.title}」调整时间`}
            className="mt-0.5 shrink-0 cursor-grab text-content-tertiary transition-colors duration-fast hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus active:cursor-grabbing"
          >
            <GripVertical size={12} aria-hidden />
          </button>
          <span
            className={`min-w-0 flex-1 truncate text-xs font-medium ${
              entry.done ? 'text-content-tertiary line-through' : 'text-content'
            }`}
          >
            {entry.title}
          </span>
          <span className="shrink-0 text-2xs tabular text-content-tertiary">
            {timeboxRangeLabel({ date: '', start: entry.start, minutes: entry.minutes })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-0.5">
          <IconButton
            size="sm"
            label={`开始专注：${entry.title}`}
            icon={<Play size={12} />}
            onClick={() => onFocus(entry.id)}
          />
          <IconButton
            size="sm"
            label={`把「${entry.title}」提前 30 分钟`}
            icon={<ChevronUp size={12} />}
            onClick={() => onSchedule(entry.id, minutesToTime(start - SLOT_MINUTES))}
          />
          <IconButton
            size="sm"
            label={`把「${entry.title}」推迟 30 分钟`}
            icon={<ChevronDown size={12} />}
            onClick={() => onSchedule(entry.id, minutesToTime(start + SLOT_MINUTES))}
          />
          <IconButton
            size="sm"
            label={`把「${entry.title}」缩短 15 分钟`}
            icon={<Minus size={12} />}
            disabled={entry.minutes <= MIN_TIMEBOX_MINUTES}
            onClick={() => onResize(entry.id, entry.minutes - STEP_MINUTES)}
          />
          <IconButton
            size="sm"
            label={`把「${entry.title}」加长 15 分钟`}
            icon={<Plus size={12} />}
            onClick={() => onResize(entry.id, entry.minutes + STEP_MINUTES)}
          />
          <IconButton
            size="sm"
            label={`把「${entry.title}」撤下时间轴`}
            icon={<X size={12} />}
            onClick={() => onRemove(entry.id)}
          />
        </div>
      </div>
    </li>
  );
};

export const DayTimeline: React.FC<DayTimelineProps> = ({
  label,
  entries,
  candidates,
  onSchedule,
  onResize,
  onRemove,
  onFocus,
  activeId,
}) => {
  const slots = useMemo(() => timelineSlots(), []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const laid = useMemo(() => {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    return layoutTimeboxes(
      entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        start: timeToMinutes(entry.start) ?? 0,
        minutes: entry.minutes,
      })),
    ).map((box) => ({ box, entry: byId.get(box.id)! }));
  }, [entries]);

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over) return;
    onSchedule(String(active.id), String(over.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="max-h-[26rem] overflow-y-auto" role="group" aria-label={label}>
          <div className="flex">
            <div className="w-11 shrink-0" aria-hidden>
              {slots.map((slot, index) => (
                <div
                  key={slot}
                  style={{ height: SLOT_HEIGHT }}
                  className="pr-1 text-right text-2xs tabular text-content-tertiary"
                >
                  {index % 2 === 0 ? slot : ''}
                </div>
              ))}
            </div>

            <div className="relative min-w-0 flex-1 border-b border-line-subtle">
              <ul aria-label={`${label}的时间格`}>
                {slots.map((slot) => (
                  <Slot key={slot} time={slot} />
                ))}
              </ul>

              <ul aria-label={`${label}上已排的任务`} className="absolute inset-0">
                {laid.map(({ box, entry }) => {
                  const { top, height } = timelinePosition(box.start, box.minutes);
                  return (
                    <Box
                      key={box.id}
                      entry={entry}
                      top={top}
                      height={height}
                      lane={box.lane}
                      lanes={box.lanes}
                      active={entry.id === activeId}
                      onSchedule={onSchedule}
                      onResize={onResize}
                      onRemove={onRemove}
                      onFocus={onFocus}
                    />
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-content-secondary">
            <Clock size={13} aria-hidden />
            待排（{candidates.length}）
          </h3>
          {candidates.length === 0 ? (
            <p className="text-xs text-content-tertiary">今天该排的都排上了。</p>
          ) : (
            <ul className="space-y-1.5">
              {candidates.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  slots={slots}
                  onSchedule={onSchedule}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </DndContext>
  );
};

const CandidateRow: React.FC<{
  candidate: TimelineCandidate;
  slots: readonly string[];
  onSchedule: (id: string, start: string) => void;
}> = ({ candidate, slots, onSchedule }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: candidate.id });

  return (
    <li
      ref={setNodeRef}
      className={`flex items-center gap-1.5 rounded border border-line-subtle bg-surface px-2 py-1.5 ${
        isDragging ? 'opacity-70' : ''
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`拖动「${candidate.title}」到时间轴`}
        className="shrink-0 cursor-grab text-content-tertiary transition-colors duration-fast hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus active:cursor-grabbing"
      >
        <GripVertical size={13} aria-hidden />
      </button>
      <span className="min-w-0 flex-1 truncate text-xs text-content">{candidate.title}</span>
      <Select
        aria-label={`把「${candidate.title}」排到`}
        className="w-24 px-2 py-1 text-xs"
        value=""
        placeholder="排到…"
        onChange={(value) => onSchedule(candidate.id, value)}
        options={slots.map((slot) => ({ value: slot, label: slot }))}
      />
    </li>
  );
};

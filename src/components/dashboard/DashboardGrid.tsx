import React from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EyeOff, GripVertical, RotateCcw } from 'lucide-react';
import { Button, Card, CardBody, EmptyState, IconButton, SegmentedControl } from '../ui';
import type { DashboardWidget, DashboardWidgetId, DashboardWidgetSize } from '../../store/uiStore';

/**
 * 首页仪表盘栅格。
 *
 * 设计上的四个取舍：
 * - **宽度档位就是「放哪儿」**：宽档通栏独占一行，中档进主列，小档进辅列。
 *   双列按样稿的 1.62fr : 1fr 分宽。
 *   主列与辅列各自独立上下堆叠，互不挤位。这正是要修掉的那个毛病 —— 老实现是行优先的
 *   12 栏栅格，行高由该行最高的卡决定，于是卡片一高一矮、或者某张卡因为没数据被跳过，
 *   那一行就留下一块填不满的空白（「今日心情」旁边空出 8 栏就是这么来的）。
 *   换成两列独立堆叠之后，旁边少了谁都不影响自己这一列。
 * - **对面那列空着时，这一列自己占满**：宁可让卡片变宽，也不留「宽度不齐的半边空白」。
 * - **顺序、尺寸、隐藏都存在 `lm:ui` 里**，且只存 id 与档位：卡片叫什么、渲染成什么样都属于代码，
 *   以后改文案不会让用户已经排好的布局失效。档位的语义从「占几栏」变成「进哪一列」，
 *   旧存档里的 sm / md / lg 照原样继续用，不需要迁移。
 * - **只有编辑态才渲染「没数据的卡片」**：平时「没有活动就不显示空热力图」，进编辑态则一律显示，
 *   否则用户没法把一张暂时没数据的卡片拖走或隐藏。
 */

export interface DashboardWidgetView {
  id: DashboardWidgetId;
  /** 编辑态里显示的名字（也是拖拽手柄与隐藏按钮的可访问名称来源） */
  title: string;
  /** 卡片正文，自带 Card 外壳；null 表示「当前没有数据」 */
  content: React.ReactNode;
}

export interface DashboardGridProps {
  /** 完整配置（含隐藏项），顺序即展示顺序 */
  widgets: readonly DashboardWidget[];
  views: readonly DashboardWidgetView[];
  editing: boolean;
  onMove: (activeId: DashboardWidgetId, overId: DashboardWidgetId) => void;
  onResize: (id: DashboardWidgetId, size: DashboardWidgetSize) => void;
  onHide: (id: DashboardWidgetId, hidden: boolean) => void;
  onReset: () => void;
}

/** 档位到位置的映射：「宽」通栏，「中」主列，「小」辅列 */
const PLACEMENT: Record<DashboardWidgetSize, 'full' | 'main' | 'side'> = {
  lg: 'full',
  md: 'main',
  sm: 'side',
};

const SIZE_OPTIONS: Array<{ value: DashboardWidgetSize; label: string }> = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '宽' },
];

type Segment =
  | { kind: 'full'; widget: DashboardWidget }
  | { kind: 'columns'; main: readonly DashboardWidget[]; side: readonly DashboardWidget[] };

/**
 * 把卡片按顺序切成「通栏」与「双列」两类段。
 *
 * 连续的非通栏卡片合成一段双列：段内中档进主列、小档进辅列，各自堆叠。
 * 通栏卡片自己独占一段，等于在页面上划一条横带，把上下的双列区隔开。
 */
function segmentsOf(widgets: readonly DashboardWidget[]): Segment[] {
  const segments: Segment[] = [];
  let main: DashboardWidget[] = [];
  let side: DashboardWidget[] = [];

  const flush = (): void => {
    if (main.length === 0 && side.length === 0) return;
    segments.push({ kind: 'columns', main, side });
    main = [];
    side = [];
  };

  for (const widget of widgets) {
    const placement = PLACEMENT[widget.size];
    if (placement === 'full') {
      flush();
      segments.push({ kind: 'full', widget });
      continue;
    }
    if (placement === 'main') main.push(widget);
    else side.push(widget);
  }
  flush();

  return segments;
}

/**
 * 双列段的外壳。
 *
 * 列宽比例直接照抄样稿的 `grid-template-columns: minmax(0, 1.62fr) minmax(0, 1fr)`，
 * **不用 12 栏的 8 / 4** —— 8:4 是 2.0 的比例，主列会比样稿宽一截、辅列窄一截，
 * 「近 30 天活动」「模块概览」跟着一起胖，右边那列又显得挤。
 */
const TWO_COLUMNS = 'grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]';

/** 对面那列空着时，这一列自己占满，不留「宽度不齐的半边空白」 */
const ONE_COLUMN = 'grid min-w-0 grid-cols-1 gap-4';

/** 一列本身只负责纵向堆叠，宽度由上面的模板决定 */
const COLUMN = 'flex min-w-0 flex-col gap-4';

interface SortableWidgetProps {
  widget: DashboardWidget;
  view: DashboardWidgetView;
  editing: boolean;
  onResize: (id: DashboardWidgetId, size: DashboardWidgetSize) => void;
  onHide: (id: DashboardWidgetId, hidden: boolean) => void;
}

const SortableWidget: React.FC<SortableWidgetProps> = ({
  widget,
  view,
  editing,
  onResize,
  onHide,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
    disabled: !editing,
  });

  return (
    <li
      ref={setNodeRef}
      data-testid="dashboard-widget"
      data-widget={widget.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`min-w-0 ${isDragging ? 'relative z-10 opacity-70' : ''}`}
    >
      {editing && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-dashed border-line bg-inset px-2 py-1.5">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`拖动「${view.title}」调整顺序`}
            className="flex h-6 w-6 cursor-grab items-center justify-center rounded-sm text-content-tertiary transition-colors duration-fast hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus active:cursor-grabbing"
          >
            <GripVertical size={14} aria-hidden />
          </button>
          <span className="min-w-0 flex-1 truncate text-xs text-content-secondary">
            {view.title}
          </span>
          <SegmentedControl
            size="sm"
            label={`「${view.title}」的宽度`}
            value={widget.size}
            onChange={(size) => onResize(widget.id, size)}
            options={SIZE_OPTIONS}
          />
          <IconButton
            size="sm"
            label={`隐藏「${view.title}」`}
            icon={<EyeOff size={14} />}
            onClick={() => onHide(widget.id, true)}
          />
        </div>
      )}

      {view.content ?? (
        <Card>
          <CardBody>
            <EmptyState
              title={`${view.title}暂无数据`}
              description="有数据时这张卡片会自动出现。"
              className="py-6"
            />
          </CardBody>
        </Card>
      )}
    </li>
  );
};

export const DashboardGrid: React.FC<DashboardGridProps> = ({
  widgets,
  views,
  editing,
  onMove,
  onResize,
  onHide,
  onReset,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const viewOf = (id: DashboardWidgetId): DashboardWidgetView | undefined =>
    views.find((view) => view.id === id);

  const known = widgets.filter((widget) => viewOf(widget.id));
  // 没数据的卡片平时不占位，编辑态一律显示，否则用户没法把它拖走或隐藏
  const visible = known.filter(
    (widget) => !widget.hidden && (editing || viewOf(widget.id)!.content),
  );
  const hidden = known.filter((widget) => widget.hidden);

  const segments = segmentsOf(visible);

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onMove(active.id as DashboardWidgetId, over.id as DashboardWidgetId);
  };

  const renderWidget = (widget: DashboardWidget): React.ReactNode => (
    <SortableWidget
      key={widget.id}
      widget={widget}
      view={viewOf(widget.id)!}
      editing={editing}
      onResize={onResize}
      onHide={onHide}
    />
  );

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <SortableContext items={visible.map((widget) => widget.id)} strategy={rectSortingStrategy}>
          <div className="flex flex-col gap-4">
            {segments.map((segment, index) => {
              if (segment.kind === 'full') {
                return (
                  <ul key={segment.widget.id} className="grid min-w-0 grid-cols-1 gap-4">
                    {renderWidget(segment.widget)}
                  </ul>
                );
              }

              const bothColumns = segment.main.length > 0 && segment.side.length > 0;
              return (
                <div
                  key={`columns-${segment.main[0]?.id ?? segment.side[0]?.id ?? index}`}
                  className={bothColumns ? TWO_COLUMNS : ONE_COLUMN}
                >
                  {segment.main.length > 0 && (
                    <ul className={COLUMN}>{segment.main.map(renderWidget)}</ul>
                  )}
                  {segment.side.length > 0 && (
                    <ul className={COLUMN}>{segment.side.map(renderWidget)}</ul>
                  )}
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {visible.length === 0 && !editing && (
        <p className="text-sm text-content-tertiary">
          所有卡片都被隐藏了，点右上角「编辑布局」可以恢复。
        </p>
      )}

      {editing && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-line px-3 py-2">
          {hidden.length > 0 ? (
            <>
              <span className="text-xs text-content-tertiary">已隐藏：</span>
              {hidden.map((widget) => (
                <Button
                  key={widget.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => onHide(widget.id, false)}
                >
                  {viewOf(widget.id)!.title}
                </Button>
              ))}
            </>
          ) : (
            <span className="text-xs text-content-tertiary">
              拖动左上角的手柄调整顺序。「宽」通栏，「中」进左列，「小」进右列；某一列空着时这一列会占满。
            </span>
          )}
          <span className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw size={13} aria-hidden />}
            onClick={onReset}
          >
            恢复默认布局
          </Button>
        </div>
      )}
    </>
  );
};

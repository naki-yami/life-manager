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
 * 设计上的三个取舍：
 * - **宽度分档而不是 1x1 / 2x2**：卡片高度由内容决定，硬要「两行高」就得给每张卡定死高度，
 *   内容一多就出滚动条。宽档（4 / 8 / 12 栏）能拿到同样的排版自由度，还不用和高度打架。
 * - **顺序、尺寸、隐藏都存在 `lm:ui` 里**，且只存 id 与档位：卡片叫什么、渲染成什么样都属于代码，
 *   以后改文案不会让用户已经排好的布局失效。
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

/** 12 栏栅格下的宽度档位：小 + 中正好凑满一行 */
const SPAN: Record<DashboardWidgetSize, string> = {
  sm: 'lg:col-span-4',
  md: 'lg:col-span-8',
  lg: 'lg:col-span-12',
};

const SIZE_OPTIONS: Array<{ value: DashboardWidgetSize; label: string }> = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '中' },
  { value: 'lg', label: '宽' },
];

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
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`min-w-0 ${SPAN[widget.size]} ${isDragging ? 'relative z-10 opacity-70' : ''}`}
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

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onMove(active.id as DashboardWidgetId, over.id as DashboardWidgetId);
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <SortableContext items={visible.map((widget) => widget.id)} strategy={rectSortingStrategy}>
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {visible.map((widget) => (
              <SortableWidget
                key={widget.id}
                widget={widget}
                view={viewOf(widget.id)!}
                editing={editing}
                onResize={onResize}
                onHide={onHide}
              />
            ))}
          </ul>
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
              拖动左上角的手柄调整顺序，或用「小 / 中 / 宽」改宽度。
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

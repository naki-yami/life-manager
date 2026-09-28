import React, { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Badge } from './Badge';

export interface KanbanItemData {
  id: string;
  /** 拖拽手柄的可访问名称（一般是条目标题） */
  label: string;
  /** 条目正文，由调用方渲染 */
  node: React.ReactNode;
}

export interface KanbanColumnData {
  id: string;
  title: string;
  items: KanbanItemData[];
}

export interface KanbanMoveResult {
  itemId: string;
  fromColumnId: string;
  toColumnId: string;
  /** 落点参照的那一项；null 表示放到目标列末尾 */
  overItemId: string | null;
}

export interface KanbanBoardProps {
  /** 无障碍名称，例如「写作助手的任务看板」 */
  label: string;
  columns: KanbanColumnData[];
  onMove: (move: KanbanMoveResult) => void;
}

/**
 * 三列看板（列数不限，按 columns 渲染）：
 * - 拖拽走 @dnd-kit，键盘可用（聚焦手柄后空格拾起、方向键移动、空格放下）
 * - 只允许从手柄发起拖拽，条目里的按钮/下拉不受影响
 * - 落点语义见 KanbanMoveResult，纯计算在 utils/kanbanMove 里，方便单测
 */
export function KanbanBoard({ label, columns, onMove }: KanbanBoardProps): React.ReactElement {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent): void => {
    setDraggingId(null);
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as { columnId?: string } | undefined;
    if (!activeData?.columnId) return;

    const overData = over.data.current as { columnId?: string } | undefined;
    const overIsItem = Boolean(overData?.columnId);
    const toColumnId = overIsItem ? overData!.columnId! : String(over.id);
    const overItemId = overIsItem && over.id !== active.id ? String(over.id) : null;

    if (toColumnId === activeData.columnId && overItemId === null) return;
    onMove({ itemId: String(active.id), fromColumnId: activeData.columnId, toColumnId, overItemId });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(event) => setDraggingId(String(event.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <div role="group" aria-label={label} className="grid gap-4 md:grid-cols-3">
        {columns.map((column) => (
          <KanbanColumnView key={column.id} column={column} draggingId={draggingId} />
        ))}
      </div>
    </DndContext>
  );
}

const KanbanColumnView: React.FC<{ column: KanbanColumnData; draggingId: string | null }> = ({
  column,
  draggingId,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`rounded border bg-inset p-3 ${
        isOver && draggingId ? 'border-line-focus' : 'border-line-subtle'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-content-secondary">{column.title}</h3>
        <Badge tone="default">{column.items.length}</Badge>
      </div>
      <SortableContext
        items={column.items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        {column.items.length === 0 ? (
          <p className="py-4 text-center text-xs text-content-tertiary">这一列还没有任务</p>
        ) : (
          <ul className="space-y-2">
            {column.items.map((item) => (
              <SortableCard key={item.id} item={item} columnId={column.id} />
            ))}
          </ul>
        )}
      </SortableContext>
    </div>
  );
};

const SortableCard: React.FC<{ item: KanbanItemData; columnId: string }> = ({
  item,
  columnId,
}) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, data: { columnId } });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-50' : undefined}
    >
      <div className="flex items-start gap-1 rounded bg-surface p-2.5 shadow-xs">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`拖动排序「${item.label}」`}
          aria-roledescription="可排序条目"
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-content-tertiary hover:text-content-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus active:cursor-grabbing"
        >
          <GripVertical size={14} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">{item.node}</div>
      </div>
    </li>
  );
};

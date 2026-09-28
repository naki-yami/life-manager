import type { DevTask, DevTaskStatus } from '../types';

/**
 * 看板拖拽后的纯计算：把一条任务挪到目标状态列，返回新的任务数组。
 *
 * 全局数组顺序只承载「每一列内部的相对顺序」，跨列的交错位置没有语义
 * （渲染时按状态过滤）。这样不用给 DevTask 加显式的 order 字段。
 *
 * - `overItemId` 有值：插到那一项前面（那一项一定在目标列里）
 * - `overItemId` 为 null：追加到目标列末尾；目标列为空时追加到数组末尾
 * - 找不到 itemId、或落点就是它自己时原样返回，不做任何改动
 */
export function moveTaskInArray(
  tasks: readonly DevTask[],
  itemId: string,
  toStatus: DevTaskStatus,
  overItemId: string | null,
): DevTask[] {
  const fromIndex = tasks.findIndex((task) => task.id === itemId);
  if (fromIndex === -1) return [...tasks];
  if (overItemId === itemId) return [...tasks];

  const rest = [...tasks];
  const [moved] = rest.splice(fromIndex, 1);
  if (!moved) return [...tasks];
  const updated: DevTask = { ...moved, status: toStatus };

  if (overItemId) {
    const overIndex = rest.findIndex((task) => task.id === overItemId);
    if (overIndex !== -1) {
      rest.splice(overIndex, 0, updated);
      return rest;
    }
  }

  // 目标列末尾：最后一项同状态任务的后面
  let insertAt = rest.length;
  for (let i = rest.length - 1; i >= 0; i -= 1) {
    if (rest[i]!.status === toStatus) {
      insertAt = i + 1;
      break;
    }
  }
  rest.splice(insertAt, 0, updated);
  return rest;
}

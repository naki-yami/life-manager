import { useSyncExternalStore } from 'react';
import { getSaveStamp, subscribeSaveStamp } from '../store/saveStamp';

/**
 * 订阅「最近一次写入本地存储」的时刻。
 *
 * 服务端快照固定给 null：这个值会让侧栏底部那行小字每秒重算一次相对时间，
 * 首屏渲染时拿不到它也只是显示成「尚未写入」，不影响任何数据。
 */
export function useSaveStamp(): number | null {
  return useSyncExternalStore(subscribeSaveStamp, getSaveStamp, () => null);
}

/**
 * 「最近一次写入本地存储」的时刻。
 *
 * 侧栏底部那行状态只回答一个问题：刚才那次改动，到底有没有落到盘上。
 * 所以这里记的是**存储层真正写完**的时间，不是「界面上最后一次点按」——
 * 写入失败时它原地不动，StorageAlert 会同时亮起来，两者不会互相打架。
 *
 * 写法与 storageFailure.ts 一致：纯模块 + 监听集合，不引 React，
 * 组件侧用 useSyncExternalStore 订阅。
 */

type SaveStampListener = () => void;

const listeners = new Set<SaveStampListener>();
let lastSavedAt: number | null = null;

/** 本次会话还没写过任何东西时返回 null */
export function getSaveStamp(): number | null {
  return lastSavedAt;
}

export function subscribeSaveStamp(listener: SaveStampListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 存储层写成功后调用；时刻没变就不重复通知订阅者 */
export function markSaved(at: number = Date.now()): void {
  if (lastSavedAt === at) return;
  lastSavedAt = at;
  for (const listener of listeners) listener();
}

/** 只给测试用：把状态清回「本次会话还没写过」 */
export function resetSaveStamp(): void {
  lastSavedAt = null;
}

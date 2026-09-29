import { useEffect, useRef } from 'react';

interface PendingFocus {
  path: string;
  entityId: string;
  at: number;
}

/** 登记后多久作废：懒加载页面正常在几百毫秒内挂载完，超时就当这次跳转没落上 */
const FOCUS_TTL_MS = 5000;

let pending: PendingFocus | null = null;
const listeners = new Set<() => void>();

/**
 * 命令面板选中「实体」结果时调用：先登记意图，再跳路由。
 *
 * 页面是按路由懒加载的，跳转时目标页可能还没挂载，所以这里不直接回调，
 * 而是让目标页挂载后自己来认领（见 `usePaletteFocus`）。
 * 已经挂载的页面会通过 listeners 立刻收到通知。
 */
export function requestPaletteFocus(path: string, entityId: string): void {
  pending = { path, entityId, at: Date.now() };
  listeners.forEach((listener) => listener());
}

/** 认领属于这个路径的聚焦请求；没有就返回 null */
export function consumePaletteFocus(path: string): string | null {
  if (!pending || pending.path !== path) return null;
  if (Date.now() - pending.at > FOCUS_TTL_MS) {
    pending = null;
    return null;
  }
  const { entityId } = pending;
  pending = null;
  return entityId;
}

/** 仅测试用：清掉没被认领的意图，避免用例之间互相干扰 */
export function resetPaletteFocus(): void {
  pending = null;
}

/**
 * 页面用它响应「从命令面板打开某条记录」：
 * 挂载时先看一眼有没有留给自己的请求，之后靠订阅接收。
 *
 * `open` 允许每次渲染都是新函数（内部用 ref 取最新的那个）。
 */
export function usePaletteFocus(path: string, open: (entityId: string) => void): void {
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const tryConsume = (): void => {
      const entityId = consumePaletteFocus(path);
      if (entityId) openRef.current(entityId);
    };

    tryConsume();
    listeners.add(tryConsume);
    return () => {
      listeners.delete(tryConsume);
    };
  }, [path]);
}

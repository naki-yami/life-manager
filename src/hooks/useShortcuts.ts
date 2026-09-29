import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { NAV_ITEMS } from '../components/layout/navItems';

/** 「n 新建当前模块条目」走 window 自定义事件解耦：外壳监听按键，页面注册动作 */
export const NEW_ENTRY_EVENT = 'lm:new-entry';

/** 登记后多久作废，避免跳到一个没有新建入口的页面后，被之后挂载的页面误认领 */
const NEW_ENTRY_TTL_MS = 3000;
let pendingNewEntryAt = 0;

/**
 * 广播「新建」意图。
 *
 * 页面是按路由懒加载的：跳转那一刻目标页可能还没挂载，所以除了发事件，
 * 还记一个时间戳；页面挂载后自己补认领（见 useNewEntryShortcut）。
 */
export function requestNewEntry(): void {
  pendingNewEntryAt = Date.now();
  window.dispatchEvent(new CustomEvent(NEW_ENTRY_EVENT));
}

/** 页面用它注册「新建」动作；按 n 时动作会被触发 */
export function useNewEntryShortcut(handler: () => void): void {
  // 用 ref 存最新的 handler，避免每次渲染都重新订阅窗口事件
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (): void => {
      pendingNewEntryAt = 0;
      handlerRef.current();
    };
    window.addEventListener(NEW_ENTRY_EVENT, listener);
    // 从命令面板「跳转 + 新建」进来时，事件比页面挂载更早，这里补一次
    if (Date.now() - pendingNewEntryAt < NEW_ENTRY_TTL_MS) {
      pendingNewEntryAt = 0;
      handlerRef.current();
    }
    return () => window.removeEventListener(NEW_ENTRY_EVENT, listener);
  }, []);
}

/** 正在往输入框里打字时，单键快捷键必须让路 */
export const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
};

/** g 后接数字跳页面时，两次按键的最大间隔 */
const G_SEQUENCE_MS = 1200;

/** 主导航的顺序即 g+数字 的编号（g 1 = 首页，g 2 = 今日计划…） */
export const mainNavShortcuts = NAV_ITEMS.filter((item) => item.group === 'main');

/**
 * 全局单键快捷键（Layout 挂载）：
 * - n：向页面广播「新建当前模块条目」
 * - /：打开命令面板
 * - g 后接 1-9：跳转对应主页面
 */
export function useGlobalShortcuts(onOpenPalette: () => void): void {
  const navigate = useNavigate();

  useEffect(() => {
    let lastGAt = 0;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === 'n') {
        event.preventDefault();
        requestNewEntry();
        return;
      }
      if (event.key === '/') {
        event.preventDefault();
        onOpenPalette();
        return;
      }
      if (event.key.toLowerCase() === 'g') {
        lastGAt = Date.now();
        return;
      }
      if (/^[1-9]$/.test(event.key) && Date.now() - lastGAt < G_SEQUENCE_MS) {
        lastGAt = 0;
        const item = mainNavShortcuts[Number(event.key) - 1];
        if (item) {
          event.preventDefault();
          navigate(item.path);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, onOpenPalette]);
}

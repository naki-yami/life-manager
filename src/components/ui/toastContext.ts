import { createContext, useContext } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** 毫秒；设为 0 表示不自动关闭 */
  duration?: number;
  /** 附加操作，例如「撤销」 */
  action?: ToastAction;
}

export interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

/** 由 ToastProvider 提供；单独成文件是为了让 Toast.tsx 只导出组件（React Fast Refresh 要求）。 */
export const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast 必须在 <ToastProvider> 内部使用');
  return context;
};

/**
 * 和 useToast 一样，但没有 Provider 时返回 null。
 * 外壳组件（命令面板、顶栏）在测试里可能被单独挂载，用这个不会直接抛错。
 */
export const useOptionalToast = (): ToastContextValue | null => useContext(ToastContext);

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import {
  ToastContext,
  type ToastContextValue,
  type ToastOptions,
  type ToastTone,
} from './toastContext';

interface ToastRecord extends ToastOptions {
  id: string;
  tone: ToastTone;
  duration: number;
}

const TONE_STYLES: Record<ToastTone, { icon: React.ReactNode; accent: string }> = {
  info: { icon: <Info size={16} />, accent: 'text-info' },
  success: { icon: <CheckCircle2 size={16} />, accent: 'text-success' },
  warning: { icon: <AlertTriangle size={16} />, accent: 'text-warning' },
  danger: { icon: <AlertCircle size={16} />, accent: 'text-danger' },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastRecord[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (options: ToastOptions): string => {
      counter.current += 1;
      const id = `toast-${counter.current}`;
      const record: ToastRecord = {
        id,
        title: options.title,
        description: options.description,
        action: options.action,
        tone: options.tone ?? 'info',
        duration: options.duration ?? 4000,
      };

      setItems((prev) => [...prev, record]);

      if (record.duration > 0) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), record.duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  const clear = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current.clear();
    setItems([]);
  }, []);

  // 卸载时清掉所有定时器，避免测试里的悬挂计时器
  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    },
    [],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toast, dismiss, clear }),
    [toast, dismiss, clear],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            aria-live="polite"
            aria-atomic="false"
            className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
          >
            {items.map((item) => {
              const tone = TONE_STYLES[item.tone];
              return (
                <div
                  key={item.id}
                  role={item.tone === 'danger' ? 'alert' : 'status'}
                  className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line-subtle bg-elevated p-3 shadow-lg animate-slide-in-right motion-reduce:animate-none"
                >
                  <span className={`mt-0.5 shrink-0 ${tone.accent}`}>{tone.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-content">{item.title}</p>
                    {item.description && (
                      <p className="mt-0.5 text-xs leading-relaxed text-content-tertiary">
                        {item.description}
                      </p>
                    )}
                    {item.action && (
                      <button
                        type="button"
                        onClick={() => {
                          item.action?.onClick();
                          dismiss(item.id);
                        }}
                        className="mt-1.5 text-xs font-medium text-accent hover:underline"
                      >
                        {item.action.label}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="关闭通知"
                    onClick={() => dismiss(item.id)}
                    className="shrink-0 rounded-sm p-0.5 text-content-tertiary transition-colors duration-fast hover:bg-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
};

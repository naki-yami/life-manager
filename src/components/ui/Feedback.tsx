import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Inbox, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export interface SpinnerProps {
  size?: number;
  className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 16, className = '' }) => (
  <span
    role="status"
    aria-label="加载中"
    style={{ width: size, height: size }}
    className={`inline-block shrink-0 animate-spin rounded-full border-2 border-line border-t-accent ${className}`}
  />
);

export interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  width,
  height,
  rounded = true,
}) => (
  <span
    aria-hidden
    style={{ width, height }}
    className={`relative block overflow-hidden bg-inset ${
      rounded ? 'rounded-sm' : ''
    } ${className}`}
  >
    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-line-subtle to-transparent animate-shimmer motion-reduce:animate-none" />
  </span>
);

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const ALERT_STYLES: Record<AlertTone, { wrapper: string; icon: React.ReactNode }> = {
  info: { wrapper: 'bg-info-soft text-info', icon: <Info size={16} /> },
  success: { wrapper: 'bg-success-soft text-success', icon: <CheckCircle2 size={16} /> },
  warning: { wrapper: 'bg-warning-soft text-warning', icon: <AlertTriangle size={16} /> },
  danger: { wrapper: 'bg-danger-soft text-danger', icon: <AlertCircle size={16} /> },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  tone = 'info',
  title,
  children,
  onDismiss,
  className = '',
}) => {
  const styles = ALERT_STYLES[tone];
  return (
    <div role="status" className={`flex gap-2.5 rounded-lg p-3 ${styles.wrapper} ${className}`}>
      <span className="mt-0.5 shrink-0">{styles.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-medium">{title}</p>}
        {children && <div className="text-xs leading-relaxed">{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="关闭提示"
          onClick={onDismiss}
          className="shrink-0 text-current opacity-60 hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  );
};

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => (
  <div
    className={`flex flex-col items-center justify-center gap-3 px-6 py-12 text-center ${className}`}
  >
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-inset text-content-tertiary">
      {icon ?? <Inbox size={20} />}
    </span>
    <div>
      <p className="text-sm font-medium text-content">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-content-tertiary">
          {description}
        </p>
      )}
    </div>
    {action}
  </div>
);

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryText?: string;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = '出了点问题',
  description = '这部分内容加载失败，可以重试一次。',
  onRetry,
  retryText = '重试',
  className = '',
}) => (
  <div className={`flex flex-col items-center gap-3 px-6 py-10 text-center ${className}`}>
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft text-danger">
      <AlertTriangle size={20} />
    </span>
    <div>
      <p className="text-sm font-medium text-content">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-content-tertiary">
        {description}
      </p>
    </div>
    {onRetry && (
      <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
        {retryText}
      </Button>
    )}
  </div>
);

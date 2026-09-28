import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  /** 可点击时为 true，补充 hover 反馈与键盘可达性 */
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick, interactive }) => {
  const clickable = interactive ?? Boolean(onClick);

  if (clickable && onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className={`rounded-lg border border-line-subtle bg-surface shadow-xs transition-colors duration-fast ease-standard hover:border-line hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas cursor-pointer ${className}`}
      >
        {children}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-line-subtle bg-surface shadow-xs ${className}`}>
      {children}
    </div>
  );
};

export interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  action,
  className = '',
}) => (
  <div
    className={`flex items-center justify-between gap-4 border-b border-line-subtle px-4 py-3 ${className}`}
  >
    <div className="min-w-0">
      <h2 className="text-base font-semibold text-content">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-content-tertiary">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const CardBody: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`p-4 ${className}`}>{children}</div>;

export const CardFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div
    className={`flex items-center justify-end gap-2 border-t border-line-subtle px-4 py-3 ${className}`}
  >
    {children}
  </div>
);

export type StatTone = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  icon?: React.ReactNode;
  /** 环比变化，正数向上、负数向下 */
  trend?: { value: number; label?: string };
  tone?: StatTone;
  footer?: React.ReactNode;
  className?: string;
}

const STAT_TONE: Record<StatTone, string> = {
  default: 'text-content',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  icon,
  trend,
  tone = 'default',
  footer,
  className = '',
}) => (
  <Card className={className}>
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-content-tertiary">{label}</p>
        {icon && <span className="text-content-tertiary">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={`text-2xl font-semibold tabular ${STAT_TONE[tone]}`}>{value}</span>
        {unit && <span className="text-xs text-content-tertiary">{unit}</span>}
      </div>
      {trend && (
        <p
          className={`mt-1.5 flex items-center gap-1 text-xs ${
            trend.value >= 0 ? 'text-success' : 'text-danger'
          }`}
        >
          {trend.value >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          <span className="tabular">
            {trend.value >= 0 ? '+' : ''}
            {trend.value}
          </span>
          {trend.label && <span className="text-content-tertiary">{trend.label}</span>}
        </p>
      )}
      {footer && <div className="mt-2 text-xs text-content-tertiary">{footer}</div>}
    </div>
  </Card>
);

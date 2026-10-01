import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  /** 可点击时为 true，补充 hover 反馈与键盘可达性 */
  interactive?: boolean;
}

/**
 * 卡片外壳。ref 转发到最外层节点：导出 PNG 时拍的就是这一层，
 * 只要卡片本身，不带外层列表的留白。
 *
 * 样稿里的卡片是**平**的：只有一根 1px 描边，没有投影，圆角 13px
 * （`rounded-lg` 已按样稿重排）。投影留给浮层 —— 卡片是页面的一部分，
 * 不是浮在页面上的东西，一层阴影会让整页显得发灰。
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = '', onClick, interactive }, ref) => {
    const clickable = interactive ?? Boolean(onClick);

    if (clickable && onClick) {
      return (
        <div
          ref={ref}
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick();
            }
          }}
          className={`rounded-lg border border-line-subtle bg-surface transition-colors duration-fast ease-standard hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas cursor-pointer ${className}`}
        >
          {children}
        </div>
      );
    }

    return (
      <div className={`rounded-lg border border-line-subtle bg-surface ${className}`} ref={ref}>
        {children}
      </div>
    );
  },
);
Card.displayName = 'Card';

export interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * 卡片头。样稿里标题与正文之间**不画分隔线**，靠留白分层次 ——
 * 卡片内部再横一根线，一屏里会多出十几条线，页面显脏。
 */
export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  action,
  className = '',
}) => (
  <div className={`flex items-center justify-between gap-4 px-[17px] pt-[15px] pb-1 ${className}`}>
    <div className="min-w-0">
      <h2 className="text-base font-[620] text-content">{title}</h2>
      {subtitle && <p className="mt-0.5 text-2sm text-content-tertiary">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const CardBody: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`px-[17px] pt-[13px] pb-4 ${className}`}>{children}</div>;

export const CardFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div
    className={`flex items-center justify-end gap-2 border-t border-line-subtle px-[17px] py-3 ${className}`}
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

import React from 'react';

export type ProgressTone = 'accent' | 'success' | 'warning' | 'danger';

const BAR_TONES: Record<ProgressTone, string> = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const RING_TONES: Record<ProgressTone, string> = {
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export interface ProgressBarProps {
  value: number;
  max?: number;
  tone?: ProgressTone;
  /** 是否在右侧显示百分比 */
  showValue?: boolean;
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  tone = 'accent',
  showValue = false,
  size = 'sm',
  label,
  className = '',
}) => {
  const safeMax = max <= 0 ? 100 : max;
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100));

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between">
          {label && <span className="text-xs text-content-secondary">{label}</span>}
          {showValue && (
            <span className="text-xs text-content-tertiary tabular">{Math.round(percent)}%</span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className={`w-full overflow-hidden rounded-full bg-inset ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-slow ease-standard ${BAR_TONES[tone]}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

export interface ProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  tone?: ProgressTone;
  /** 圆环中央内容，默认显示百分比 */
  children?: React.ReactNode;
  /** 无障碍标签，没有可见文字时必填 */
  label?: string;
  className?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  max = 100,
  size = 72,
  strokeWidth = 6,
  tone = 'accent',
  children,
  label,
  className = '',
}) => {
  const safeMax = max <= 0 ? 100 : max;
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent / 100);

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      style={{ width: size, height: size }}
      className={`relative inline-flex items-center justify-center ${className}`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-inset"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={`stroke-current transition-[stroke-dashoffset] duration-slow ease-standard ${RING_TONES[tone]}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-content tabular">
        {children ?? `${Math.round(percent)}%`}
      </span>
    </div>
  );
};

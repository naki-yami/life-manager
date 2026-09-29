import React from 'react';
import { BADGE_TONES } from './badgeTones';
import type { BadgeTone } from './badgeTones';

export type { BadgeTone } from './badgeTones';

export interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  /** 左侧小圆点 */
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  tone = 'default',
  size = 'sm',
  dot = false,
  className = '',
}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full font-medium ${BADGE_TONES[tone]} ${
      size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs'
    } ${className}`}
  >
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
    {children}
  </span>
);

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  label?: string;
  className?: string;
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  label,
  className = '',
}) => {
  if (label) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <span className="h-px flex-1 bg-line-subtle" />
        <span className="text-2xs text-content-tertiary">{label}</span>
        <span className="h-px flex-1 bg-line-subtle" />
      </div>
    );
  }

  return orientation === 'horizontal' ? (
    <div role="separator" className={`h-px w-full bg-line-subtle ${className}`} />
  ) : (
    <div role="separator" className={`h-full w-px bg-line-subtle ${className}`} />
  );
};

export interface KbdProps {
  children: React.ReactNode;
  className?: string;
}

export const Kbd: React.FC<KbdProps> = ({ children, className = '' }) => (
  <kbd
    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line bg-inset px-1.5 font-mono text-2xs text-content-secondary ${className}`}
  >
    {children}
  </kbd>
);

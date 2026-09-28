import React, { useId, useState } from 'react';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'bottom';
  className?: string;
}

/**
 * 轻量提示。仅用于补充说明，不承载唯一的关键信息
 * （键盘用户通过 aria-describedby 也能读到同样内容）。
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  side = 'top',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className={`relative inline-flex ${className}`}>
      {React.cloneElement(children, {
        'aria-describedby': open ? id : undefined,
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
        onFocus: () => setOpen(true),
        onBlur: () => setOpen(false),
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.key === 'Escape') setOpen(false);
        },
      })}
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`pointer-events-none absolute left-1/2 z-40 w-max max-w-xs -translate-x-1/2 rounded-sm border border-line-subtle bg-elevated px-2 py-1 text-2xs text-content shadow-md animate-fade-in motion-reduce:animate-none ${
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {content}
        </span>
      )}
    </span>
  );
};

import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { IconButton } from './Button';

export type DrawerSide = 'left' | 'right';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** 从哪一侧滑出，导航抽屉用 left */
  side?: DrawerSide;
  width?: 'sm' | 'md';
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const WIDTHS = { sm: 'w-64', md: 'w-80' } as const;

const DrawerInner: React.FC<Omit<DrawerProps, 'isOpen'>> = ({
  onClose,
  title,
  side = 'left',
  width = 'md',
  footer,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const handleKeyDown = useFocusTrap(panelRef, { onClose });

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in motion-reduce:animate-none"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`${WIDTHS[width]} max-w-[85vw] fixed inset-y-0 z-10 flex flex-col bg-elevated shadow-overlay outline-none motion-reduce:animate-none ${
          side === 'left'
            ? 'left-0 border-r border-line-subtle animate-slide-in-left'
            : 'right-0 border-l border-line-subtle animate-slide-in-right'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-content">
            {title}
          </h2>
          <IconButton label="关闭" size="sm" icon={<X size={16} />} onClick={onClose} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>

        {footer && <div className="border-t border-line-subtle px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
};

export const Drawer: React.FC<DrawerProps> = ({ isOpen, ...rest }) => {
  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;
  return createPortal(<DrawerInner {...rest} />, document.body);
};

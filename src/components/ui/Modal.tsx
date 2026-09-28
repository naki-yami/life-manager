import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { IconButton } from './Button';
import { Input } from './Input';

export type ModalSize = 'sm' | 'md' | 'lg';

const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: ModalSize;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

type ModalInnerProps = Omit<ModalProps, 'isOpen'>;

const ModalInner: React.FC<ModalInnerProps> = ({
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // 焦点移入／归还、背景滚动锁、Esc 关闭、Tab 循环，全部由 useFocusTrap 统一处理
  const handleKeyDown = useFocusTrap(dialogRef, { onClose });

  // 窄屏用固定的 16px 外边距，回到 sm 后再跟随密度令牌
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-page">
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in motion-reduce:animate-none"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`relative z-10 flex max-h-[90vh] w-full flex-col rounded-xl border border-line-subtle bg-elevated shadow-overlay outline-none animate-scale-in motion-reduce:animate-none ${SIZES[size]}`}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-content">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-xs text-content-tertiary">
                {description}
              </p>
            )}
          </div>
          <IconButton label="关闭" size="sm" icon={<X size={16} />} onClick={onClose} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-line-subtle px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export const Modal: React.FC<ModalProps> = ({ isOpen, ...rest }) => {
  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;
  return createPortal(<ModalInner {...rest} />, document.body);
};

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'primary';
  /** 设成 true 时要求用户输入确认词，用于不可逆操作 */
  requireText?: string;
}

/**
 * 统一的二次确认弹窗。所有破坏性操作都必须走这里，
 * 以保证「有确认」这件事不会因某个页面忘记写而漏掉。
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  tone = 'primary',
  requireText,
}) => {
  const [typed, setTyped] = React.useState('');

  React.useEffect(() => {
    if (!isOpen) setTyped('');
  }, [isOpen]);

  const blocked = Boolean(requireText) && typed !== requireText;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded px-3.5 text-sm font-medium text-content-secondary transition-colors duration-fast ease-standard hover:bg-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={blocked}
            className={`inline-flex h-9 items-center justify-center rounded px-3.5 text-sm font-medium shadow-xs transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 ${
              tone === 'danger'
                ? 'bg-danger text-danger-contrast hover:opacity-90 focus-visible:ring-danger'
                : 'bg-accent text-accent-contrast hover:bg-accent-strong focus-visible:ring-line-focus'
            }`}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <p className="text-sm text-content-secondary">{description}</p>
      {requireText && (
        <div className="mt-4">
          <Input
            label={`请输入「${requireText}」以确认`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={requireText}
          />
        </div>
      )}
    </Modal>
  );
};

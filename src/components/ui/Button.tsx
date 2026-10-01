import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 提交中：显示 loading 并阻止重复点击 */
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

const BASE =
  'inline-flex items-center justify-center gap-2 font-[550] whitespace-nowrap select-none ' +
  'transition-colors duration-fast ease-standard ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ' +
  'disabled:pointer-events-none disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-strong shadow-xs',
  secondary: 'bg-inset text-content border border-line-subtle hover:bg-active',
  outline: 'border border-line text-content hover:bg-hover',
  ghost: 'text-content-secondary hover:bg-hover hover:text-content',
  danger: 'bg-danger text-danger-contrast hover:opacity-90 shadow-xs',
};

/** 尺寸按样稿的控件尺度：主按钮 34px 高 / 圆角 9px，小按钮 28px（样稿聚焦框里的「完成」） */
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-[11px] text-xs rounded-sm',
  md: 'h-[34px] px-[15px] text-sm rounded',
  lg: 'h-10 px-5 text-base rounded-md',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  className = '',
  disabled,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    {...rest}
  >
    {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : icon}
    {children}
    {iconRight}
  </button>
);

export type IconButtonVariant = 'primary' | 'ghost' | 'secondary' | 'outline' | 'danger';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 必填：图标按钮没有可见文字，必须有可读标签 */
  label: string;
  icon: React.ReactNode;
  variant?: IconButtonVariant;
  size?: ButtonSize;
}

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 w-7 rounded-sm',
  md: 'h-[34px] w-[34px] rounded',
  lg: 'h-10 w-10 rounded-md',
};

export const IconButton: React.FC<IconButtonProps> = ({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={`${BASE} ${VARIANTS[variant]} ${ICON_SIZES[size]} shrink-0 ${className}`}
    {...rest}
  >
    {icon}
  </button>
);

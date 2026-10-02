import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'value'
> {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  hint?: string;
  error?: string;
  /** 值为空时显示的占位项（不可选） */
  placeholder?: string;
}

export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  label,
  hint,
  error,
  placeholder,
  className = '',
  disabled,
  required,
  id,
  ...rest
}) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const invalid = Boolean(error);
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;

  return (
    /*
     * className 加在**最外层**，不是内层 <select>。
     *
     * 内层 <select> 自带 `w-full`，而 Tailwind 里 `w-full` 排在 `w-32` 之后 ——
     * 所以「把 w-32 写在 Select 上」以前是**静默失效**的：控件照样撑满整行，
     * 在工具条里会把同一行的其它控件挤到下一行，看上去就是「没对齐」。
     * 全应用有 12 处这么写（`w-28` / `w-32` / `w-40` / `flex-1`），一直没生效。
     *
     * 默认仍是 `w-full`（表单里一格一控件，本来就该占满）；调用方一旦传了类名，
     * 就整个接管外层宽度 —— 传宽度类时不能再保留 `w-full`，否则还是它赢。
     */
    <div className={className || 'w-full'}>
      {label && (
        <label
          htmlFor={fieldId}
          className="mb-1.5 block text-sm font-medium text-content-secondary"
        >
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={fieldId}
          value={value}
          disabled={disabled}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          className={[
            'w-full appearance-none px-3 py-2 pr-9 text-sm rounded',
            'bg-surface text-content border transition-colors duration-fast ease-standard',
            invalid ? 'border-danger' : 'border-line hover:border-line-strong',
            'focus:outline-none focus:border-line-focus focus:ring-2 focus:ring-focus',
            'disabled:cursor-not-allowed disabled:bg-inset disabled:text-content-disabled',
          ].join(' ')}
          {...rest}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-content-tertiary"
        />
      </div>
      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-xs text-content-tertiary">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

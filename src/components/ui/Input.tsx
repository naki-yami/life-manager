import React, { useId } from 'react';

interface FieldShellProps {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

/** label / 帮助文本 / 错误文本的统一排版，输入类组件共用 */
const FieldShell: React.FC<FieldShellProps> = ({ id, label, hint, error, required, children }) => (
  <div className="w-full">
    {label && (
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-content-secondary">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
    )}
    {children}
    {error ? (
      <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-danger">
        {error}
      </p>
    ) : hint ? (
      <p id={`${id}-hint`} className="mt-1.5 text-xs text-content-tertiary">
        {hint}
      </p>
    ) : null}
  </div>
);

const controlClasses = (invalid: boolean, extra: string) =>
  [
    'w-full px-3 py-2 text-sm rounded bg-surface text-content',
    'border transition-colors duration-fast ease-standard',
    invalid ? 'border-danger' : 'border-line',
    'placeholder:text-content-disabled',
    'hover:border-line-strong',
    'focus:outline-none focus:border-line-focus focus:ring-2 focus:ring-focus',
    'disabled:cursor-not-allowed disabled:bg-inset disabled:text-content-disabled',
    extra,
  ].join(' ');

const describedBy = (id: string, hint?: string, error?: string): string | undefined => {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
};

export interface InputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value'
> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  label?: string;
  hint?: string;
  error?: string;
  /** 多行文本，等价于 Textarea */
  multiline?: boolean;
  rows?: number;
}

export const Input: React.FC<InputProps> = ({
  value,
  onChange,
  placeholder = '',
  type = 'text',
  className = '',
  label,
  hint,
  error,
  multiline = false,
  rows = 3,
  required,
  disabled,
  id,
  ...rest
}) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const invalid = Boolean(error);

  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      {multiline ? (
        <textarea
          id={fieldId}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={rows}
          required={required}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          className={controlClasses(invalid, `resize-y ${className}`)}
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <input
          id={fieldId}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          className={controlClasses(invalid, className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
};

export interface TextareaProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value'
> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  label?: string;
  hint?: string;
  error?: string;
  rows?: number;
}

export const Textarea: React.FC<TextareaProps> = ({
  value,
  onChange,
  placeholder = '',
  className = '',
  label,
  hint,
  error,
  rows = 4,
  required,
  disabled,
  id,
  ...rest
}) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const invalid = Boolean(error);

  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      <textarea
        id={fieldId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        required={required}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={controlClasses(invalid, `resize-y ${className}`)}
        {...rest}
      />
    </FieldShell>
  );
};

export interface NumberInputProps {
  value: number | '';
  onChange: (value: number | '') => void;
  label?: string;
  hint?: string;
  error?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  suffix?: string;
  disabled?: boolean;
  /** 无障碍名称；传了就不再渲染可见 label（列表内的行内输入用） */
  ariaLabel?: string;
  className?: string;
}

/** 数字输入：带上下步进按钮，空值用 '' 表示（便于表单编辑中状态） */
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  label,
  hint,
  error,
  min,
  max,
  step = 1,
  placeholder = '',
  suffix,
  ariaLabel,
  disabled = false,
  className = '',
}) => {
  const autoId = useId();
  const invalid = Boolean(error);

  const clamp = (next: number): number => {
    let result = next;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    return result;
  };

  const stepBy = (delta: number): void => {
    const base = typeof value === 'number' ? value : 0;
    const next = Math.round((base + delta) * 1000) / 1000;
    onChange(clamp(next));
  };

  return (
    <FieldShell id={autoId} label={ariaLabel ? undefined : label} hint={hint} error={error}>
      <div className="relative flex items-center">
        <input
          id={autoId}
          type="number"
          inputMode="decimal"
          aria-label={ariaLabel}
          value={value}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy(autoId, hint, error)}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? '' : clamp(Number(raw)));
          }}
          className={controlClasses(invalid, `pr-16 tabular ${suffix ? 'pr-20' : ''} ${className}`)}
        />
        <div className="absolute right-1 flex items-center gap-0.5">
          <button
            type="button"
            aria-label="减少"
            disabled={disabled}
            onClick={() => stepBy(-step)}
            className="h-6 w-6 rounded-sm text-content-tertiary hover:bg-hover hover:text-content disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            aria-label="增加"
            disabled={disabled}
            onClick={() => stepBy(step)}
            className="h-6 w-6 rounded-sm text-content-tertiary hover:bg-hover hover:text-content disabled:opacity-40"
          >
            +
          </button>
          {suffix && <span className="ml-0.5 pr-1 text-xs text-content-tertiary">{suffix}</span>}
        </div>
      </div>
    </FieldShell>
  );
};

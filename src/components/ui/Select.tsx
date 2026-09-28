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
    <div className="w-full">
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
            className,
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

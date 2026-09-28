import React, { useId } from 'react';
import { Check } from 'lucide-react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  className = '',
}) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const descId = `${fieldId}-desc`;

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      <button
        type="button"
        id={fieldId}
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? descId : undefined}
        aria-label={label ? undefined : '开关'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'bg-accent' : 'bg-line-strong'
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform duration-fast ease-standard ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      {(label || description) && (
        <div className="min-w-0">
          {label && (
            <label htmlFor={fieldId} className="block cursor-pointer text-sm text-content">
              {label}
            </label>
          )}
          {description && (
            <p id={descId} className="mt-0.5 text-xs text-content-tertiary">
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * 使用原生 checkbox + accent-color：暗色主题自动跟随，
 * 键盘与读屏行为不需要额外实现。
 */
export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  className = '',
}) => {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <input
        type="checkbox"
        id={fieldId}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--lm-accent)' }}
        className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50"
      />
      {(label || description) && (
        <div className="min-w-0">
          {label && (
            <label htmlFor={fieldId} className="block cursor-pointer text-sm text-content">
              {label}
            </label>
          )}
          {description && <p className="mt-0.5 text-xs text-content-tertiary">{description}</p>}
        </div>
      )}
    </div>
  );
};

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  value: string;
  onChange: (value: string) => void;
  options: RadioOption[];
  name?: string;
  label?: string;
  className?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  value,
  onChange,
  options,
  name,
  label,
  className = '',
}) => {
  const autoName = useId();
  const groupName = name ?? autoName;

  return (
    <fieldset className={className}>
      {label && (
        <legend className="mb-2 text-sm font-medium text-content-secondary">{label}</legend>
      )}
      <div className="space-y-2.5">
        {options.map((option) => (
          <div key={option.value} className="flex items-start gap-2.5">
            <input
              type="radio"
              id={`${groupName}-${option.value}`}
              name={groupName}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              style={{ accentColor: 'var(--lm-accent)' }}
              className="mt-0.5 h-4 w-4 shrink-0 border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="min-w-0">
              <label
                htmlFor={`${groupName}-${option.value}`}
                className="block cursor-pointer text-sm text-content"
              >
                {option.label}
              </label>
              {option.description && (
                <p className="mt-0.5 text-xs text-content-tertiary">{option.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
};

export interface CheckboxRowProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  className?: string;
}

/** 列表项里的勾选框：点击整行都能切换 */
export const CheckboxRow: React.FC<CheckboxRowProps> = ({
  checked,
  onChange,
  label,
  className = '',
}) => (
  <label
    className={`flex cursor-pointer items-center gap-2.5 rounded px-1.5 py-1 text-sm text-content transition-colors duration-fast hover:bg-hover ${className}`}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      style={{ accentColor: 'var(--lm-accent)' }}
      className="h-4 w-4 shrink-0 rounded-sm border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
    />
    <span className={checked ? 'text-content-tertiary line-through' : ''}>{label}</span>
  </label>
);

export { Check };

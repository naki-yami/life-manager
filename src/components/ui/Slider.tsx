import React, { useId } from 'react';
import { FormField } from './FormField';

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  hint?: string;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  hint,
  showValue = false,
  formatValue,
  disabled = false,
  id,
  className = '',
}) => {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const display = formatValue ? formatValue(value) : String(value);

  return (
    <FormField label={label} hint={hint} htmlFor={fieldId} className={className}>
      <div className="flex items-center gap-3">
        <input
          id={fieldId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            accentColor: 'var(--lm-accent)',
            background: `linear-gradient(to right, var(--lm-accent) ${percent}%, var(--lm-bg-inset) ${percent}%)`,
          }}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50"
        />
        {showValue && (
          <span className="w-14 shrink-0 text-right text-xs text-content-secondary tabular">
            {display}
          </span>
        )}
      </div>
    </FormField>
  );
};

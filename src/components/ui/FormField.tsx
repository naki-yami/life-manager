import React, { useId } from 'react';

export interface FormFieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** 自定义控件（非原生 input/select），需要自行绑定 aria-describedby */
  children: React.ReactNode;
  className?: string;
  /** 是否把 aria 描述挂在 children 外层容器上 */
  htmlFor?: string;
}

/**
 * 给「非原生控件」（Slider / Switch / SegmentedControl 等）用的字段外壳，
 * 负责 label、帮助文本、错误文本的统一排版与无障碍关联。
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  hint,
  error,
  required,
  children,
  className = '',
  htmlFor,
}) => {
  const autoId = useId();
  const fieldId = htmlFor ?? autoId;

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label
          htmlFor={fieldId}
          className="mb-1.5 block text-sm font-medium text-content-secondary"
        >
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-content-tertiary">{hint}</p>
      ) : null}
    </div>
  );
};

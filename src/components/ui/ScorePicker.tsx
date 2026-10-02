import React from 'react';
import { Button } from './Button';

export interface ScorePickerProps {
  /** 分档数，默认 10 */
  max?: number;
  /** 当前分值；0 = 未评分 */
  value: number;
  onChange: (value: number) => void;
  /** 这一组按钮的无障碍名称，例如「给《活着》评分」 */
  label: string;
  /** 标题文案；传 null 不渲染（调用方自己在别处写了标题时用） */
  caption?: string | null;
  /** 清除按钮的文案；传 null 表示不给清除入口 */
  clearLabel?: string | null;
}

/**
 * 1–10 的评分选择器。
 *
 * 读书页与游戏页原来各写了一份**逐字相同**的实现（连类名都一样），
 * 抽出来之后改一处两处都生效。
 *
 * 一条交互约定：没有「0 分」这个选项，**清除**才是归零的入口。
 * 分档按钮用 `aria-pressed` 标出「正好选中的那一档」，视觉上则把
 * ≤ 当前分值的都点亮（评分条那种读法）。
 */
export const ScorePicker: React.FC<ScorePickerProps> = ({
  max = 10,
  value,
  onChange,
  label,
  caption = '评分',
  clearLabel = '清除',
}) => (
  <div>
    {caption !== null && (
      <p className="mb-1.5 text-sm font-medium text-content-secondary">{caption}</p>
    )}
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {Array.from({ length: max }, (_, index) => index + 1).map((score) => (
        <button
          key={score}
          type="button"
          aria-pressed={value === score}
          onClick={() => onChange(score)}
          className={`h-8 w-8 rounded text-xs font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
            value >= score
              ? 'bg-warning-soft text-warning'
              : 'bg-inset text-content-tertiary hover:text-content-secondary'
          }`}
        >
          {score}
        </button>
      ))}
      {clearLabel !== null && (
        <Button size="sm" variant="ghost" onClick={() => onChange(0)}>
          {clearLabel}
        </Button>
      )}
    </div>
  </div>
);

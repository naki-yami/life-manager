import React, { useId, useState } from 'react';
import { Pencil, Tag as TagIcon, X } from 'lucide-react';
import { BADGE_TONES } from './badgeTones';
import { FormField } from './FormField';
import { MAX_TAG_COUNT, normalizeTag, tagTone } from '../../utils/tags';

/**
 * 标签的三个形态：
 * - `TagChips` —— 只读展示，列表卡片与详情里用
 * - `TagInput` —— 可控输入，表单里用（回车 / 逗号成标签，退格删最后一个）
 * - `TagEditor` —— 卡片上「点一下就地编辑」，收起时是 TagChips，展开时是 TagInput
 *
 * 配色统一走 `tagTone()`：同一个标签在任何页面都是同一个颜色，不需要额外存配色配置。
 */

export interface TagChipsProps {
  tags: readonly string[];
  /** 最多显示几个，其余折叠成 +N */
  max?: number;
  /** 传了就变成按钮，用于「点标签筛出同类记录」 */
  onTagClick?: (tag: string) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export const TagChips: React.FC<TagChipsProps> = ({
  tags,
  max = 4,
  onTagClick,
  size = 'sm',
  className = '',
}) => {
  if (tags.length === 0) return null;

  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  const chipClass = `inline-flex items-center gap-1 rounded-full font-medium ${
    size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs'
  }`;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {shown.map((tag) =>
        onTagClick ? (
          <button
            key={tag}
            type="button"
            onClick={() => onTagClick(tag)}
            title={`只看带「${tag}」标签的记录`}
            className={`${chipClass} ${BADGE_TONES[tagTone(tag)]} transition-opacity duration-fast hover:opacity-80`}
          >
            #{tag}
          </button>
        ) : (
          <span key={tag} className={`${chipClass} ${BADGE_TONES[tagTone(tag)]}`}>
            #{tag}
          </span>
        ),
      )}
      {rest > 0 && <span className="text-2xs text-content-tertiary">+{rest}</span>}
    </span>
  );
};

export interface TagInputProps {
  value: readonly string[];
  onChange: (tags: string[]) => void;
  /** 传了 label 就套一层 FormField（表单里用） */
  label?: string;
  hint?: string;
  id?: string;
  /** 没有 label 时的可访问名称 */
  ariaLabel?: string;
  placeholder?: string;
  /** 已经用过的标签，点一下就能加 */
  suggestions?: readonly string[];
  max?: number;
  disabled?: boolean;
  className?: string;
}

export const TagInput: React.FC<TagInputProps> = ({
  value,
  onChange,
  label,
  hint,
  id,
  ariaLabel = '标签',
  placeholder = '输入后回车，# 可省略',
  suggestions = [],
  max = MAX_TAG_COUNT,
  disabled = false,
  className = '',
}) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [draft, setDraft] = useState('');
  const full = value.length >= max;

  const commit = (raw: string): void => {
    const tag = normalizeTag(raw);
    setDraft('');
    if (tag === '' || full) return;
    if (value.some((item) => item.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };

  const removeAt = (tag: string): void => onChange(value.filter((item) => item !== tag));

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    // 回车与逗号都算「收下这个标签」，并阻止冒泡：标签还没打完不该提交整个表单
    if (event.key === 'Enter' || event.key === ',' || event.key === '，' || event.key === '、') {
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault();
      onChange(value.slice(0, -1));
      return;
    }
    if (event.key === 'Escape' && draft !== '') {
      event.preventDefault();
      setDraft('');
    }
  };

  const used = new Set(value.map((tag) => tag.toLowerCase()));
  const prefix = draft.trim().toLowerCase();
  const remaining = suggestions
    .filter((tag) => !used.has(tag.toLowerCase()))
    .filter((tag) => prefix === '' || tag.toLowerCase().includes(prefix))
    .slice(0, 6);

  const field = (
    <div
      className={`w-full rounded border border-line bg-surface px-2 py-1.5 transition-colors duration-fast focus-within:border-line-focus focus-within:ring-2 focus-within:ring-focus ${
        disabled ? 'cursor-not-allowed bg-inset' : ''
      } ${className}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ${BADGE_TONES[tagTone(tag)]}`}
          >
            #{tag}
            <button
              type="button"
              aria-label={`移除标签 ${tag}`}
              disabled={disabled}
              onClick={() => removeAt(tag)}
              className="rounded-full transition-opacity duration-fast hover:opacity-60 disabled:cursor-not-allowed"
            >
              <X size={10} aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          type="text"
          value={draft}
          disabled={disabled || full}
          aria-label={label ? undefined : ariaLabel}
          placeholder={value.length === 0 && !full ? placeholder : ''}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commit(draft)}
          className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-content outline-none placeholder:text-content-disabled disabled:cursor-not-allowed"
        />
      </div>

      {remaining.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="text-2xs text-content-tertiary">用过：</span>
          {remaining.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => commit(tag)}
              disabled={disabled}
              className="rounded-full bg-inset px-1.5 py-0.5 text-2xs text-content-tertiary transition-colors duration-fast hover:text-accent disabled:cursor-not-allowed"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (!label) return field;
  return (
    <FormField label={label} hint={hint} htmlFor={inputId}>
      {field}
    </FormField>
  );
};

export interface TagEditorProps {
  tags: readonly string[];
  onChange: (tags: string[]) => void;
  suggestions?: readonly string[];
  max?: number;
  className?: string;
}

/** 卡片上的就地编辑：收起时只看得到标签，点「标签」展开输入框 */
export const TagEditor: React.FC<TagEditorProps> = ({
  tags,
  onChange,
  suggestions = [],
  max = MAX_TAG_COUNT,
  className = '',
}) => {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <TagInput
          value={tags}
          onChange={onChange}
          suggestions={suggestions}
          max={max}
          ariaLabel="编辑标签"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-2xs text-content-tertiary transition-colors duration-fast hover:text-accent"
        >
          完成
        </button>
      </div>
    );
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <TagChips tags={tags} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={tags.length > 0 ? '编辑标签' : '添加标签'}
        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs text-content-tertiary transition-colors duration-fast hover:text-accent"
      >
        {tags.length > 0 ? <Pencil size={11} aria-hidden /> : <TagIcon size={11} aria-hidden />}
        {tags.length > 0 ? '标签' : '加标签'}
      </button>
    </span>
  );
};

import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  Bold,
  Code,
  Columns2,
  Eye,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pencil,
  Quote,
  SquareCode,
  Strikethrough,
} from 'lucide-react';
import { IconButton, SegmentedControl, Textarea } from '../ui';
import { MarkdownPreview } from './MarkdownPreview';
import { applyMarkdownAction, type MarkdownAction } from '../../utils/markdownActions';

export type MarkdownView = 'edit' | 'preview' | 'split';

interface ToolButton {
  action: MarkdownAction;
  label: string;
  icon: React.ReactNode;
}

/** 工具栏顺序按使用频率排：先标题 / 强调，再块级结构 */
const TOOLS: ToolButton[] = [
  { action: 'heading', label: '标题', icon: <Heading2 size={15} aria-hidden /> },
  { action: 'bold', label: '加粗', icon: <Bold size={15} aria-hidden /> },
  { action: 'italic', label: '斜体', icon: <Italic size={15} aria-hidden /> },
  { action: 'strike', label: '删除线', icon: <Strikethrough size={15} aria-hidden /> },
  { action: 'inlineCode', label: '行内代码', icon: <Code size={15} aria-hidden /> },
  { action: 'bulletList', label: '无序列表', icon: <List size={15} aria-hidden /> },
  { action: 'orderedList', label: '有序列表', icon: <ListOrdered size={15} aria-hidden /> },
  { action: 'quote', label: '引用', icon: <Quote size={15} aria-hidden /> },
  { action: 'link', label: '链接', icon: <LinkIcon size={15} aria-hidden /> },
  { action: 'codeBlock', label: '代码块', icon: <SquareCode size={15} aria-hidden /> },
];

const VIEW_OPTIONS: Array<{ value: MarkdownView; label: string; icon: React.ReactNode }> = [
  { value: 'edit', label: '编辑', icon: <Pencil size={13} aria-hidden /> },
  { value: 'preview', label: '预览', icon: <Eye size={13} aria-hidden /> },
  { value: 'split', label: '分栏', icon: <Columns2 size={13} aria-hidden /> },
];

export interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** 正文框的无障碍名称，例如「正文」 */
  label: string;
  rows?: number;
  placeholder?: string;
}

/**
 * 带快捷插入的 Markdown 正文编辑器。
 *
 * 工具按钮按下时先 preventDefault 挡住失焦 —— 一旦 textarea 失焦，
 * selectionStart / selectionEnd 就归零了，插入位置也就丢了。
 * 插入完把新选区写进 pendingSelection，等 onChange 引发的这次重渲染落地后再写回 DOM。
 */
export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  label,
  rows = 14,
  placeholder = '',
}) => {
  const [view, setView] = useState<MarkdownView>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    if (!selection) return;
    pendingSelection.current = null;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(selection.start, selection.end);
  }, [value]);

  const runAction = (action: MarkdownAction): void => {
    const textarea = textareaRef.current;
    const start = textarea ? textarea.selectionStart : value.length;
    const end = textarea ? textarea.selectionEnd : value.length;
    const result = applyMarkdownAction({ value, start, end }, action);
    if (result.value === value) return;
    pendingSelection.current = { start: result.start, end: result.end };
    onChange(result.value);
  };

  const editor = (
    <Textarea
      ref={textareaRef}
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      placeholder={placeholder}
      hint="支持 Markdown：## 标题、**粗体**、*斜体*、- 列表、> 引用、[]() 链接"
    />
  );

  const preview = (
    <div className="max-h-[28rem] min-h-[12rem] overflow-y-auto rounded border border-line-subtle bg-surface p-3">
      <MarkdownPreview source={value} />
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {view !== 'preview' && (
          <div
            role="toolbar"
            aria-label="Markdown 快捷插入"
            className="flex flex-wrap items-center gap-0.5"
          >
            {TOOLS.map((tool) => (
              <IconButton
                key={tool.action}
                size="sm"
                label={tool.label}
                icon={tool.icon}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => runAction(tool.action)}
              />
            ))}
          </div>
        )}
        <div className="ml-auto">
          <SegmentedControl
            size="sm"
            label="正文视图"
            value={view}
            onChange={setView}
            options={VIEW_OPTIONS}
          />
        </div>
      </div>

      {view === 'edit' && editor}
      {view === 'preview' && preview}
      {view === 'split' && (
        <div className="grid gap-3 md:grid-cols-2">
          {editor}
          {preview}
        </div>
      )}
    </div>
  );
};

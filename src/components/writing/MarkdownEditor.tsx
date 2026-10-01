import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  AlignVerticalJustifyCenter,
  Bold,
  Code,
  Columns2,
  Eye,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Pencil,
  Quote,
  SquareCode,
  Strikethrough,
} from 'lucide-react';
import { IconButton, SegmentedControl, Textarea } from '../ui';
import { MarkdownPreview } from './MarkdownPreview';
import { applyMarkdownAction, type MarkdownAction } from '../../utils/markdownActions';
import { typewriterScrollTop } from '../../utils/typewriter';

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
  /** 专注模式是否开着；这里只管按钮的按下态，弹窗尺寸由外层接管 */
  focus?: boolean;
  /** 传了才渲染「专注模式」按钮 */
  onToggleFocus?: () => void;
}

/**
 * 带快捷插入的 Markdown 正文编辑器。
 *
 * 工具按钮按下时先 preventDefault 挡住失焦 —— 一旦 textarea 失焦，
 * selectionStart / selectionEnd 就归零了，插入位置也就丢了。
 * 插入完把新选区写进 pendingSelection，等 onChange 引发的这次重渲染落地后再写回 DOM。
 *
 * 另外带两个写作开关：打字机滚动（把光标行钉在可视区中线上）与专注模式
 * （这里只负责按钮的按下态，铺满视口的活由外层弹窗接手）。
 */
export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChange,
  label,
  rows = 14,
  placeholder = '',
  focus = false,
  onToggleFocus,
}) => {
  const [view, setView] = useState<MarkdownView>('edit');
  const [typewriter, setTypewriter] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  /**
   * 量一个半角字符有多宽。
   *
   * textarea 自身量不出来「某个字符多宽」，所以借一个绝对定位的隐藏 span 实测。
   *
   * 标尺用**汉字**而不是数字：CJK 字形是标准的方块（宽度 = font-size），把它的宽度除以 2
   * 就是真正的半角宽。用 `0` 当标尺会偏 —— 实测 Microsoft YaHei 下 `0` 宽 7.55px、
   * 而真半角宽是 7.0px，高估 7.8%，一整篇长文折下来能多算出好几行，滚动就会跑偏。
   *
   * 挂到 body 上量完就摘；结果按字号 + 字体缓存，缩放或改字号会让缓存失效。
   */
  const charWidthRef = useRef<{ key: string; width: number }>({ key: '', width: 0 });

  const measureCharWidth = useCallback(
    (textarea: HTMLTextAreaElement, style: CSSStyleDeclaration) => {
      const key = `${style.fontSize}|${style.fontFamily}`;
      const cached = charWidthRef.current;
      if (cached.key === key && cached.width > 0) return cached.width;

      const probe = document.createElement('span');
      probe.textContent = '中'.repeat(20);
      // 必须 inline-block + 不换行，否则文本会被折行、量出来的宽度就废了
      probe.style.cssText =
        'position:absolute;left:-9999px;top:-9999px;white-space:pre;visibility:hidden;';
      probe.style.fontSize = style.fontSize;
      probe.style.fontFamily = style.fontFamily;
      probe.style.fontWeight = style.fontWeight;
      probe.style.letterSpacing = style.letterSpacing;
      document.body.appendChild(probe);
      const width = probe.getBoundingClientRect().width / 20 / 2;
      probe.remove();

      const resolved = width > 0 ? width : Number.parseFloat(style.fontSize) / 2;
      charWidthRef.current = { key, width: resolved };
      return resolved;
    },
    [],
  );

  /** 打字机滚动：把光标所在的那一**视觉行**钉在可视区中线上（长行折行也认） */
  const keepCaretCentered = useCallback((): void => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const style = window.getComputedStyle(textarea);
    // 可用宽度要减掉左右内边距与纵向滚动条，否则会多算出一行的余量
    const scrollbar = textarea.offsetWidth - textarea.clientWidth;
    const contentWidth =
      textarea.clientWidth -
      (Number.parseFloat(style.paddingLeft) || 0) -
      (Number.parseFloat(style.paddingRight) || 0) -
      scrollbar;

    textarea.scrollTop = typewriterScrollTop({
      caret: textarea.selectionStart,
      value: textarea.value,
      // 样式表里量不到行高就退回 24px，与正文默认行高一致
      lineHeight: Number.parseFloat(style.lineHeight) || 24,
      viewportHeight: textarea.clientHeight,
      paddingTop: Number.parseFloat(style.paddingTop) || 0,
      contentWidth: contentWidth > 0 ? contentWidth : undefined,
      charWidth: measureCharWidth(textarea, style),
    });
  }, [measureCharWidth]);

  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    if (selection) {
      pendingSelection.current = null;
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(selection.start, selection.end);
      }
    }
    // 插入 / 清空之后行号会变，打开开关时也要立刻对上中线
    if (typewriter) keepCaretCentered();
  }, [value, typewriter, keepCaretCentered]);

  const runAction = (action: MarkdownAction): void => {
    const textarea = textareaRef.current;
    const start = textarea ? textarea.selectionStart : value.length;
    const end = textarea ? textarea.selectionEnd : value.length;
    const result = applyMarkdownAction({ value, start, end }, action);
    if (result.value === value) return;
    pendingSelection.current = { start: result.start, end: result.end };
    onChange(result.value);
  };

  // 光标一动就重新对中线。三种事件都得接：键盘走 keyup、鼠标走 click，
  // 拖选文字时浏览器原生的 select 事件最可靠（只接 select 会漏掉方向键）。
  const caretHandlers = typewriter
    ? {
        onSelect: keepCaretCentered,
        onKeyUp: keepCaretCentered,
        onClick: keepCaretCentered,
      }
    : {};

  const editor = (
    <Textarea
      ref={textareaRef}
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      placeholder={placeholder}
      hint="支持 Markdown：## 标题、**粗体**、*斜体*、- 列表、> 引用、[]() 链接"
      {...caretHandlers}
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
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <IconButton
            size="sm"
            label="打字机滚动"
            aria-pressed={typewriter}
            icon={<AlignVerticalJustifyCenter size={15} aria-hidden />}
            onClick={() => setTypewriter((on) => !on)}
          />
          {onToggleFocus && (
            <IconButton
              size="sm"
              label="专注模式"
              aria-pressed={focus}
              icon={
                focus ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />
              }
              onClick={onToggleFocus}
            />
          )}
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

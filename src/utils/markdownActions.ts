/**
 * 正文编辑器的快捷插入逻辑。
 *
 * 纯函数：吃「原文本 + 选区」，吐「新文本 + 新选区」。跟 DOM 完全解耦，
 * 所以工具栏按钮只需要把 textarea 的 selectionStart / selectionEnd 递进来，
 * 再把返回的选区写回去即可。
 */

export type MarkdownAction =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inlineCode'
  | 'link'
  | 'bulletList'
  | 'orderedList'
  | 'quote'
  | 'codeBlock';

export interface TextRange {
  value: string;
  /** 选区起点（含） */
  start: number;
  /** 选区终点（不含） */
  end: number;
}

export interface TextEdit {
  value: string;
  /** 改动后希望光标 / 选区落在哪 */
  start: number;
  end: number;
}

type LineKind = 'heading' | 'quote' | 'bullet' | 'ordered';

const LINE_MARKERS: Record<LineKind, { insert: string; detect: RegExp }> = {
  heading: { insert: '## ', detect: /^\s*#{1,6}\s+/ },
  quote: { insert: '> ', detect: /^\s*>\s?/ },
  bullet: { insert: '- ', detect: /^\s*[-*+]\s+/ },
  ordered: { insert: '1. ', detect: /^\s*\d{1,9}[.)]\s+/ },
};

/** 没选中文字时插进去的占位内容，插完会被选中，直接打字就能覆盖 */
const PLACEHOLDER = {
  bold: '粗体文本',
  italic: '斜体文本',
  strike: '删除文本',
  inlineCode: '代码',
  linkLabel: '链接文字',
  linkHref: 'https://',
  code: '代码',
} as const;

/** 用一对标记把选区包起来；选区为空就把占位内容包起来并选中它 */
const wrapSelection = (
  input: TextRange,
  open: string,
  close: string,
  placeholder: string,
): TextEdit => {
  const selected = input.value.slice(input.start, input.end);
  const body = selected || placeholder;
  const next = `${input.value.slice(0, input.start)}${open}${body}${close}${input.value.slice(input.end)}`;
  const start = input.start + open.length;
  return { value: next, start, end: start + body.length };
};

/** 对选区覆盖到的整行做前缀增删；整块已经全带前缀时视为「再来一次 = 取消」 */
const toggleLinePrefix = (input: TextRange, kind: LineKind): TextEdit => {
  const { value } = input;
  const lineStart = value.lastIndexOf('\n', Math.max(0, input.start - 1)) + 1;
  const newlineAfter = value.indexOf('\n', input.end);
  const lineEnd = newlineAfter === -1 ? value.length : newlineAfter;

  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const marker = LINE_MARKERS[kind];
  const targets = lines.filter((line) => line.trim());
  if (targets.length === 0) {
    // 空行上按下列表 / 标题：先把前缀打出来，光标停在它后面
    const caret = input.start + marker.insert.length;
    return {
      value: value.slice(0, input.start) + marker.insert + value.slice(input.end),
      start: caret,
      end: caret,
    };
  }

  const allApplied = targets.every((line) => marker.detect.test(line));
  let counter = 0;
  const rebuilt = lines
    .map((line) => {
      if (!line.trim()) return line;
      if (allApplied) return line.replace(marker.detect, '');
      counter += 1;
      const inserted = kind === 'ordered' ? `${counter}. ` : marker.insert;
      return line.replace(/^(\s*)/, `$1${inserted}`);
    })
    .join('\n');

  return {
    value: value.slice(0, lineStart) + rebuilt + value.slice(lineEnd),
    start: lineStart,
    end: lineStart + rebuilt.length,
  };
};

/** 选中的是网址时，把它放进地址位、选中文字位，避免用户还得自己剪切粘贴 */
const insertLink = (input: TextRange): TextEdit => {
  const selected = input.value.slice(input.start, input.end).trim();
  const looksLikeUrl = !/\s/.test(selected) && /^(https?:\/\/|mailto:|\/|#)\S*$/i.test(selected);
  const label = looksLikeUrl ? PLACEHOLDER.linkLabel : selected || PLACEHOLDER.linkLabel;
  const href = looksLikeUrl && selected ? selected : PLACEHOLDER.linkHref;

  const inserted = `[${label}](${href})`;
  const next = `${input.value.slice(0, input.start)}${inserted}${input.value.slice(input.end)}`;
  const labelStart = input.start + 1;
  const hrefStart = labelStart + label.length + 2;
  return looksLikeUrl
    ? { value: next, start: labelStart, end: labelStart + label.length }
    : { value: next, start: hrefStart, end: hrefStart + href.length };
};

/** 围栏代码块：需要的话前后各补一个换行，保证 ``` 独占一行 */
const insertCodeBlock = (input: TextRange): TextEdit => {
  const { value } = input;
  const selected = value.slice(input.start, input.end);
  const body = selected || PLACEHOLDER.code;
  const before = input.start > 0 && value[input.start - 1] !== '\n' ? '\n' : '';
  const after = input.end < value.length && value[input.end] !== '\n' ? '\n' : '';
  const inserted = `${before}\`\`\`\n${body}\n\`\`\`${after}`;

  const next = `${value.slice(0, input.start)}${inserted}${value.slice(input.end)}`;
  const bodyStart = input.start + before.length + 4;
  return { value: next, start: bodyStart, end: bodyStart + body.length };
};

export function applyMarkdownAction(input: TextRange, action: MarkdownAction): TextEdit {
  switch (action) {
    case 'bold':
      return wrapSelection(input, '**', '**', PLACEHOLDER.bold);
    case 'italic':
      return wrapSelection(input, '*', '*', PLACEHOLDER.italic);
    case 'strike':
      return wrapSelection(input, '~~', '~~', PLACEHOLDER.strike);
    case 'inlineCode':
      return wrapSelection(input, '`', '`', PLACEHOLDER.inlineCode);
    case 'heading':
      return toggleLinePrefix(input, 'heading');
    case 'quote':
      return toggleLinePrefix(input, 'quote');
    case 'bulletList':
      return toggleLinePrefix(input, 'bullet');
    case 'orderedList':
      return toggleLinePrefix(input, 'ordered');
    case 'link':
      return insertLink(input);
    case 'codeBlock':
      return insertCodeBlock(input);
  }
}

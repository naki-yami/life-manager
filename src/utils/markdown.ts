/**
 * 极简 Markdown 子集解析器。
 *
 * 只覆盖写作正文真正用得上的语法：ATX 标题、粗体 / 斜体 / 删除线、行内代码、
 * 围栏代码块、引用、有序 / 无序列表、链接、水平线。刻意不引第三方依赖，
 * 也不做完整 CommonMark —— 遇到没覆盖的写法就原样当文本显示，不会丢字。
 *
 * 解析结果是纯数据（不含 React 节点），渲染交给 MarkdownPreview 逐节点造元素。
 * 正文是用户自己写的，可能带 `<script>`；因为它只作为文本节点进 React，
 * 永远不会被当成 HTML 执行。
 */

export type MarkdownInline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: MarkdownInline[] }
  | { type: 'em'; children: MarkdownInline[] }
  | { type: 'strike'; children: MarkdownInline[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: MarkdownInline[] };

export type MarkdownBlock =
  | { type: 'heading'; level: number; children: MarkdownInline[] }
  | { type: 'paragraph'; children: MarkdownInline[] }
  | { type: 'blockquote'; children: MarkdownInline[] }
  | { type: 'list'; ordered: boolean; items: MarkdownInline[][] }
  | { type: 'code'; language: string; value: string }
  | { type: 'hr' };

/** 允许的链接协议；`javascript:` / `data:` 这类会被挡下来，整段标记按文本显示 */
const SAFE_PROTOCOL = /^(https?:|mailto:)/i;
/** 带协议的写法：`scheme:` 开头。相对路径与锚点不算在内 */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return true;
  if (HAS_SCHEME.test(trimmed)) return SAFE_PROTOCOL.test(trimmed);
  return true;
}

/** 斜体 / 粗体 / 删除线的候选标记，长的排在前面，`**` 才不会被 `*` 抢先 */
const EMPHASIS: ReadonlyArray<{
  marker: string;
  type: 'strong' | 'em' | 'strike';
}> = [
  { marker: '**', type: 'strong' },
  { marker: '__', type: 'strong' },
  { marker: '~~', type: 'strike' },
  { marker: '*', type: 'em' },
  { marker: '_', type: 'em' },
];

interface EmphasisMatch {
  node: MarkdownInline;
  end: number;
}

/** 读一处强调标记；读不到（没有收尾、内容为空、跨行）就返回 null 让它落回普通文本 */
const readEmphasis = (text: string, index: number): EmphasisMatch | null => {
  for (const { marker, type } of EMPHASIS) {
    if (!text.startsWith(marker, index)) continue;
    const from = index + marker.length;
    const close = text.indexOf(marker, from);
    if (close === -1) continue;
    const inner = text.slice(from, close);
    // `* a *` 两端带空格的写法在正规 Markdown 里也不成立，不认它
    if (!inner || inner.includes('\n') || inner.trim() !== inner) continue;
    return { node: { type, children: parseInline(inner) }, end: close + marker.length };
  }
  return null;
};

interface LinkMatch {
  href: string;
  label: string;
  end: number;
}

/** 读一处行内链接 `[文字](地址)`；地址不安全的整段不认，按文本显示 */
const readLink = (text: string, index: number): LinkMatch | null => {
  const labelEnd = text.indexOf(']', index + 1);
  if (labelEnd === -1 || text[labelEnd + 1] !== '(') return null;
  const hrefEnd = text.indexOf(')', labelEnd + 2);
  if (hrefEnd === -1) return null;
  const label = text.slice(index + 1, labelEnd);
  const href = text.slice(labelEnd + 2, hrefEnd).trim();
  if (!label.trim() || !isSafeHref(href)) return null;
  return { label, href, end: hrefEnd + 1 };
};

/** 行内解析：代码 > 链接 > 强调 > 普通文本，逐字符扫描，不做正则回溯 */
export function parseInline(text: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let plain = '';
  let index = 0;

  const flush = (): void => {
    if (plain) {
      nodes.push({ type: 'text', value: plain });
      plain = '';
    }
  };

  while (index < text.length) {
    const char = text[index]!;

    if (char === '`') {
      let fenceEnd = index;
      while (text[fenceEnd] === '`') fenceEnd += 1;
      const fence = text.slice(index, fenceEnd);
      const close = text.indexOf(fence, fenceEnd);
      if (close !== -1) {
        flush();
        nodes.push({ type: 'code', value: text.slice(fenceEnd, close) });
        index = close + fence.length;
        continue;
      }
    }

    if (char === '[') {
      const link = readLink(text, index);
      if (link) {
        flush();
        nodes.push({ type: 'link', href: link.href, children: parseInline(link.label) });
        index = link.end;
        continue;
      }
    }

    if (char === '*' || char === '_' || char === '~') {
      const emphasis = readEmphasis(text, index);
      if (emphasis) {
        flush();
        nodes.push(emphasis.node);
        index = emphasis.end;
        continue;
      }
    }

    plain += char;
    index += 1;
  }

  flush();
  return nodes;
}

const HEADING = /^ {0,3}(#{1,6})\s+(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*(\S*)\s*$/;
const HR = /^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^ {0,3}>\s?/;
const LIST_ITEM = /^ {0,3}([-*+]|\d{1,9}[.)])\s+(.*)$/;

/** 这一行是否会另起一个块；段落遇到它就得让位 */
const startsBlock = (line: string): boolean =>
  FENCE.test(line) ||
  HR.test(line) ||
  HEADING.test(line) ||
  QUOTE.test(line) ||
  LIST_ITEM.test(line);

/** 围栏代码块的收尾行：同种符号且不少于开栏长度 */
const isFenceClose = (line: string, marker: string): boolean =>
  new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(line);

/**
 * 把整篇正文切成块。行内语法交给 parseInline，
 * 这里只负责「哪几行属于同一个块」。
 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1]!;
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !isFenceClose(lines[index]!, marker)) {
        body.push(lines[index]!);
        index += 1;
      }
      // 有收尾行就跳过它；没写收尾也算代码块，不把剩下的正文吃掉
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', language: fence[2] ?? '', value: body.join('\n') });
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]!.length,
        children: parseInline(heading[2]!.replace(/\s+#+\s*$/, '').trim()),
      });
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index]!)) {
        quoted.push(lines[index]!.replace(QUOTE, ''));
        index += 1;
      }
      blocks.push({ type: 'blockquote', children: parseInline(quoted.join('\n').trim()) });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /^\d/.test(item[1]!);
      const items: MarkdownInline[][] = [];
      while (index < lines.length) {
        const current = LIST_ITEM.exec(lines[index]!);
        if (!current || /^\d/.test(current[1]!) !== ordered) break;
        const parts = [current[2]!.trim()];
        index += 1;
        // 紧跟着的普通行算这一条的续行
        while (index < lines.length && lines[index]!.trim() && !startsBlock(lines[index]!)) {
          parts.push(lines[index]!.trim());
          index += 1;
        }
        items.push(parseInline(parts.join('\n')));
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const body: string[] = [];
    while (index < lines.length && lines[index]!.trim() && !startsBlock(lines[index]!)) {
      body.push(lines[index]!.trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', children: parseInline(body.join('\n')) });
  }

  return blocks;
}

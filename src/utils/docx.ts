/**
 * 把写作正文导出成 .docx。
 *
 * 不引第三方库：.docx 本来就是一个 ZIP，里面装着几份 XML。这里手写一个
 * 「只存不压」的 ZIP（CRC32 + 本地头 + 中央目录，压缩方式 0），Word 读得动，
 * 也不需要 zlib / CompressionStream —— 纯同步、纯字符串，测试里能直接断言字节。
 *
 * 正文先走一遍既有的 Markdown 解析器（utils/markdown.ts），再按块映射成 Word 段落：
 * 标题 → Heading1..6（Word 的导航窗格认这个）、引用 → Quote、列表 → ListParagraph、
 * 代码块 → Code（等宽）。
 */

import { parseMarkdown, type MarkdownBlock, type MarkdownInline } from './markdown';

export interface DocxPart {
  name: string;
  content: string;
}

export interface DocxLinkRef {
  id: string;
  href: string;
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const REL_TYPES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const CONTENT_TYPES = `${XML_HEAD}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const ROOT_RELS = `${XML_HEAD}
<Relationships xmlns="${REL_NS}">
<Relationship Id="rId1" Type="${REL_TYPES}/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/** 只定义用得上的几个样式；中文字体走 eastAsia，免得 Word 里回退成宋体 */
const STYLES = `${XML_HEAD}
<w:styles xmlns:w="${W_NS}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="等线"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="312" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
${[1, 2, 3, 4, 5, 6]
  .map(
    (level) =>
      `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${level - 1}"/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${[36, 32, 28, 26, 24, 22][level - 1]}"/></w:rPr></w:style>`,
  )
  .join('\n')}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="BFBFBF"/></w:pBdr></w:pPr><w:rPr><w:i/><w:color w:val="595959"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="420"/><w:spacing w:after="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="240"/><w:spacing w:after="0"/><w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>`;

const SECT_PR =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>';

/** XML 的五个特殊字符；正文里出现 `<script>` 也只是变成转义后的文本 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: boolean;
}

const runXml = (text: string, style: RunStyle = {}): string => {
  const props: string[] = [];
  if (style.code) {
    props.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/>');
    props.push('<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>');
  }
  if (style.bold) props.push('<w:b/>');
  if (style.italic) props.push('<w:i/>');
  if (style.strike) props.push('<w:strike/>');
  if (style.link) props.push('<w:color w:val="0563C1"/><w:u w:val="single"/>');
  const rPr = props.length > 0 ? `<w:rPr>${props.join('')}</w:rPr>` : '';
  // 段内软换行要变成 <w:br/>，否则会被 Word 当成一个空格吃掉
  const body = escapeXml(text)
    .split('\n')
    .map((line) => `<w:t xml:space="preserve">${line}</w:t>`)
    .join('<w:br/>');
  return `<w:r>${rPr}${body}</w:r>`;
};

const inlineXml = (
  nodes: MarkdownInline[],
  links: DocxLinkRef[],
  inherited: RunStyle = {},
): string =>
  nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
          return runXml(node.value, inherited);
        case 'strong':
          return inlineXml(node.children, links, { ...inherited, bold: true });
        case 'em':
          return inlineXml(node.children, links, { ...inherited, italic: true });
        case 'strike':
          return inlineXml(node.children, links, { ...inherited, strike: true });
        case 'code':
          return runXml(node.value, { ...inherited, code: true });
        case 'link': {
          const id = `rIdLink${links.length + 1}`;
          links.push({ id, href: node.href });
          return `<w:hyperlink r:id="${id}" w:history="1">${inlineXml(node.children, links, {
            ...inherited,
            link: true,
          })}</w:hyperlink>`;
        }
      }
    })
    .join('');

const paragraph = (styleId: string | null, runs: string): string =>
  `<w:p>${styleId ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : ''}${runs}</w:p>`;

const blockXml = (block: MarkdownBlock, links: DocxLinkRef[]): string => {
  switch (block.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, block.level));
      return paragraph(`Heading${level}`, inlineXml(block.children, links));
    }
    case 'paragraph':
      return paragraph(null, inlineXml(block.children, links));
    case 'blockquote':
      return paragraph('Quote', inlineXml(block.children, links));
    case 'list':
      // 用文字符号 + 缩进，不引 numbering.xml：编号部件写错会让 Word 弹「内容有问题」，
      // 而这里只要读起来是列表就够了
      return block.items
        .map((item, index) => {
          const bullet = runXml(block.ordered ? `${index + 1}.  ` : '•  ');
          return paragraph('ListParagraph', bullet + inlineXml(item, links));
        })
        .join('');
    case 'code':
      return block.value
        .split('\n')
        .map((line) => paragraph('Code', runXml(line === '' ? ' ' : line)))
        .join('');
    case 'hr':
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BFBFBF"/></w:pBdr></w:pPr></w:p>';
  }
};

export function buildDocumentXml(markdown: string): { xml: string; links: DocxLinkRef[] } {
  const links: DocxLinkRef[] = [];
  const body = parseMarkdown(markdown)
    .map((block) => blockXml(block, links))
    .join('');
  const xml = `${XML_HEAD}
<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}">
<w:body>${body}${SECT_PR}</w:body>
</w:document>`;
  return { xml, links };
}

export function buildDocxParts(markdown: string): DocxPart[] {
  const { xml, links } = buildDocumentXml(markdown);
  const rels = `${XML_HEAD}
<Relationships xmlns="${REL_NS}">
<Relationship Id="rId1" Type="${REL_TYPES}/styles" Target="styles.xml"/>
${links
  .map(
    (link) =>
      `<Relationship Id="${link.id}" Type="${REL_TYPES}/hyperlink" Target="${escapeXml(link.href)}" TargetMode="External"/>`,
  )
  .join('\n')}
</Relationships>`;

  return [
    { name: '[Content_Types].xml', content: CONTENT_TYPES },
    { name: '_rels/.rels', content: ROOT_RELS },
    { name: 'word/document.xml', content: xml },
    { name: 'word/styles.xml', content: STYLES },
    { name: 'word/_rels/document.xml.rels', content: rels },
  ];
}

// ---------------------------------------------------------------- ZIP（只存不压）

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP 里的时间戳是 DOS 格式：秒只有 5 位精度，年份从 1980 起算 */
const dosDateTime = (date: Date): { time: number; date: number } => ({
  time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
});

const concat = (chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
};

export function createStoredZip(files: DocxPart[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);

    const header = new Uint8Array(30 + nameBytes.length);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 0x04034b50, true); // 本地文件头签名
    hv.setUint16(4, 20, true); // 解压所需版本
    hv.setUint16(6, 0x0800, true); // 文件名按 UTF-8 解释
    hv.setUint16(8, 0, true); // 压缩方式 0 = 只存不压
    hv.setUint16(10, time, true);
    hv.setUint16(12, date, true);
    hv.setUint32(14, crc, true);
    hv.setUint32(18, data.length, true);
    hv.setUint32(22, data.length, true);
    hv.setUint16(26, nameBytes.length, true);
    hv.setUint16(28, 0, true); // 扩展字段长度
    header.set(nameBytes, 30);
    local.push(header, data);

    const entry = new Uint8Array(46 + nameBytes.length);
    const ev = new DataView(entry.buffer);
    ev.setUint32(0, 0x02014b50, true); // 中央目录头签名
    ev.setUint16(4, 20, true); // 生成程序版本
    ev.setUint16(6, 20, true);
    ev.setUint16(8, 0x0800, true);
    ev.setUint16(10, 0, true);
    ev.setUint16(12, time, true);
    ev.setUint16(14, date, true);
    ev.setUint32(16, crc, true);
    ev.setUint32(20, data.length, true);
    ev.setUint32(24, data.length, true);
    ev.setUint16(28, nameBytes.length, true);
    ev.setUint16(30, 0, true); // 扩展字段
    ev.setUint16(32, 0, true); // 注释
    ev.setUint16(34, 0, true); // 起始磁盘号
    ev.setUint16(36, 0, true); // 内部属性
    ev.setUint32(38, 0, true); // 外部属性
    ev.setUint32(42, offset, true);
    entry.set(nameBytes, 46);
    central.push(entry);

    offset += header.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // 中央目录结束记录
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return concat([...local, ...central, end]);
}

/** 生成可以直接下载的 .docx */
export function buildDocxBlob(markdown: string, now: Date = new Date()): Blob {
  const bytes = createStoredZip(buildDocxParts(markdown), now);
  // 复制进一个明确的 ArrayBuffer：Blob 的入参类型不收 SharedArrayBuffer
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: DOCX_MIME });
}

/** 拼导出用的正文（标题 + 元信息 + 正文 + 创作笔记）：Markdown 与 Word 两种导出共用，
 *  免得同一篇稿子导两次内容对不上 */
export interface ExportSourceInput {
  title: string;
  meta: string;
  content: string;
  notes: string;
}

export function composeExportMarkdown({ title, meta, content, notes }: ExportSourceInput): string {
  const lines: string[] = [`# ${title}`, '', `> ${meta}`, '', content.trim() || '（正文为空）'];
  if (notes.trim()) lines.push('', '## 创作笔记', '', notes.trim());
  return lines.join('\n');
}

import { describe, expect, it } from 'vitest';
import {
  DOCX_MIME,
  buildDocxBlob,
  buildDocxParts,
  composeExportMarkdown,
  crc32,
  createStoredZip,
  escapeXml,
} from './docx';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 测试用的迷你解压器：按 ZIP 规范把「只存不压」的条目读回来 */
const readZip = (bytes: Uint8Array): Array<{ name: string; content: string; crc: number }> => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);

  const count = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  // 中央目录必须正好接在结束记录之前，偏移错一个字节 Word 就打不开
  expect(centralOffset + centralSize).toBe(eocd);

  const entries: Array<{ name: string; content: string; crc: number }> = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50);
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));

    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const content = decoder.decode(bytes.slice(dataStart, dataStart + size));

    entries.push({ name, content, crc });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

const NOW = new Date('2026-09-30T10:00:00');

const partOf = (markdown: string, name: string): string =>
  buildDocxParts(markdown).find((part) => part.name === name)!.content;

describe('escapeXml', () => {
  it('转义 XML 的五个特殊字符', () => {
    expect(escapeXml(`<script a="1" b='2'>&</script>`)).toBe(
      '&lt;script a=&quot;1&quot; b=&apos;2&apos;&gt;&amp;&lt;/script&gt;',
    );
  });
});

describe('crc32', () => {
  it('对得上标准测试向量', () => {
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(encoder.encode(''))).toBe(0);
  });
});

describe('buildDocxParts', () => {
  it('产出 docx 必需的五个部件', () => {
    expect(buildDocxParts('# 标题').map((part) => part.name)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/styles.xml',
      'word/_rels/document.xml.rels',
    ]);
  });

  it('标题映射成 Word 的 Heading 样式，导航窗格才认', () => {
    expect(partOf('## 第二级', 'word/document.xml')).toContain('<w:pStyle w:val="Heading2"/>');
    expect(partOf('# 一级', 'word/document.xml')).toContain('<w:pStyle w:val="Heading1"/>');
  });

  it('粗体 / 斜体 / 行内代码 / 引用 / 列表 / 代码块各自落到对应样式', () => {
    const document = partOf(
      '**粗** *斜* `码`\n\n> 引用\n\n- 甲\n\n1. 乙\n\n```js\nconst a = 1;\n```',
      'word/document.xml',
    );

    expect(document).toContain('<w:b/>');
    expect(document).toContain('<w:i/>');
    expect(document).toContain('w:ascii="Consolas"');
    expect(document).toContain('<w:pStyle w:val="Quote"/>');
    expect(document).toContain('<w:pStyle w:val="ListParagraph"/>');
    expect(document).toContain('<w:t xml:space="preserve">•  </w:t>');
    expect(document).toContain('<w:t xml:space="preserve">1.  </w:t>');
    expect(document).toContain('<w:pStyle w:val="Code"/>');
    expect(document).toContain('const a = 1;');
  });

  it('链接写成超链接关系，地址进 rels', () => {
    const parts = buildDocxParts('[文档](https://example.com/a?b=1&c=2)');
    const document = parts.find((part) => part.name === 'word/document.xml')!.content;
    const rels = parts.find((part) => part.name === 'word/_rels/document.xml.rels')!.content;

    expect(document).toContain('<w:hyperlink r:id="rIdLink1" w:history="1">');
    expect(rels).toContain('Id="rIdLink1"');
    expect(rels).toContain('Target="https://example.com/a?b=1&amp;c=2"');
    expect(rels).toContain('TargetMode="External"');
  });

  it('正文里的 HTML 只会是转义后的文本', () => {
    const document = partOf('<script>alert(1)</script>', 'word/document.xml');
    expect(document).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(document).not.toContain('<script>');
  });
});

describe('createStoredZip', () => {
  const files = [
    { name: 'a.xml', content: '<a>中文</a>' },
    { name: 'dir/b.xml', content: 'x'.repeat(500) },
  ];

  it('写出来的容器能按规范读回来，内容与 CRC 都对得上', () => {
    const bytes = createStoredZip(files, NOW);

    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);

    const entries = readZip(bytes);
    expect(entries.map((entry) => entry.name)).toEqual(['a.xml', 'dir/b.xml']);
    expect(entries[0]!.content).toBe('<a>中文</a>');
    expect(entries[1]!.content).toBe('x'.repeat(500));
    expect(entries[0]!.crc).toBe(crc32(encoder.encode('<a>中文</a>')));
  });

  it('时间戳按 DOS 格式写，年份从 1980 起算', () => {
    const bytes = createStoredZip(files, NOW);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const year = (view.getUint16(12, true) >> 9) + 1980;
    const month = (view.getUint16(12, true) >> 5) & 0x0f;
    const day = view.getUint16(12, true) & 0x1f;
    expect([year, month, day]).toEqual([2026, 9, 30]);
    expect(view.getUint16(10, true) >> 11).toBe(10);
  });
});

describe('buildDocxBlob', () => {
  it('给出 docx 的 MIME，内容是一个可读的包', async () => {
    const blob = buildDocxBlob('# 标题\n\n正文 **加粗**', NOW);
    expect(blob.type).toBe(DOCX_MIME);
    expect(blob.size).toBeGreaterThan(0);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const entries = readZip(bytes);
    expect(entries).toHaveLength(5);
    expect(entries.find((entry) => entry.name === 'word/document.xml')!.content).toContain('正文');
  });
});

describe('composeExportMarkdown', () => {
  it('把标题、元信息、正文与创作笔记拼成一份 Markdown', () => {
    expect(
      composeExportMarkdown({
        title: '长文',
        meta: '类型：文章 · 状态：草稿 · 字数：12',
        content: '正文内容',
        notes: '待补第二章',
      }),
    ).toBe(
      '# 长文\n\n> 类型：文章 · 状态：草稿 · 字数：12\n\n正文内容\n\n## 创作笔记\n\n待补第二章',
    );
  });

  it('正文为空时留一句占位，笔记为空就不加那一节', () => {
    const source = composeExportMarkdown({
      title: '空稿',
      meta: '字数：0',
      content: '  ',
      notes: '',
    });
    expect(source).toContain('（正文为空）');
    expect(source).not.toContain('创作笔记');
  });
});

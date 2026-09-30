import { describe, expect, it } from 'vitest';
import { isSafeHref, parseInline, parseMarkdown } from './markdown';

describe('parseInline', () => {
  it('识别粗体 / 斜体 / 删除线 / 行内代码', () => {
    expect(parseInline('前**粗**后')).toEqual([
      { type: 'text', value: '前' },
      { type: 'strong', children: [{ type: 'text', value: '粗' }] },
      { type: 'text', value: '后' },
    ]);
    expect(parseInline('*斜*')).toEqual([
      { type: 'em', children: [{ type: 'text', value: '斜' }] },
    ]);
    expect(parseInline('__也粗__')).toEqual([
      { type: 'strong', children: [{ type: 'text', value: '也粗' }] },
    ]);
    expect(parseInline('_也斜_')).toEqual([
      { type: 'em', children: [{ type: 'text', value: '也斜' }] },
    ]);
    expect(parseInline('~~删掉~~')).toEqual([
      { type: 'strike', children: [{ type: 'text', value: '删掉' }] },
    ]);
    expect(parseInline('`code`')).toEqual([{ type: 'code', value: 'code' }]);
  });

  it('强调可以嵌套，标记按最长优先匹配', () => {
    expect(parseInline('**粗 *斜* 粗**')).toEqual([
      {
        type: 'strong',
        children: [
          { type: 'text', value: '粗 ' },
          { type: 'em', children: [{ type: 'text', value: '斜' }] },
          { type: 'text', value: ' 粗' },
        ],
      },
    ]);
  });

  it('缺收尾、两端带空白、写在词中间的标记都不算强调', () => {
    expect(parseInline('没有收尾的 **粗体')).toEqual([
      { type: 'text', value: '没有收尾的 **粗体' },
    ]);
    expect(parseInline('2 * 3 * 4')).toEqual([{ type: 'text', value: '2 * 3 * 4' }]);
    expect(parseInline('file_name')).toEqual([{ type: 'text', value: 'file_name' }]);
  });

  it('行内代码里的标记不再二次解析', () => {
    expect(parseInline('`**不是粗体**`')).toEqual([{ type: 'code', value: '**不是粗体**' }]);
  });

  it('链接解析出地址与文字，地址写错就整段按文本显示', () => {
    expect(parseInline('[文档](https://example.com/a)')).toEqual([
      {
        type: 'link',
        href: 'https://example.com/a',
        children: [{ type: 'text', value: '文档' }],
      },
    ]);
    expect(parseInline('[点我](javascript:alert(1))')).toEqual([
      { type: 'text', value: '[点我](javascript:alert(1))' },
    ]);
    expect(parseInline('[]()')).toEqual([{ type: 'text', value: '[]()' }]);
  });

  it('尖括号之类的内容只当普通文本，不产出任何 HTML', () => {
    const nodes = parseInline('<script>alert(1)</script>');
    expect(nodes).toEqual([{ type: 'text', value: '<script>alert(1)</script>' }]);
  });
});

describe('isSafeHref', () => {
  it('放行 http / https / mailto、锚点、站内路径与相对路径', () => {
    for (const href of [
      'https://example.com',
      'http://example.com',
      'mailto:a@b.com',
      '#anchor',
      '/writing',
      'notes/a.md',
    ]) {
      expect(isSafeHref(href)).toBe(true);
    }
  });

  it('挡下 javascript: / data: 与空地址', () => {
    for (const href of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', '']) {
      expect(isSafeHref(href)).toBe(false);
    }
  });
});

describe('parseMarkdown', () => {
  it('按级别解析 ATX 标题，并去掉收尾的井号', () => {
    expect(parseMarkdown('# 一级')).toEqual([
      { type: 'heading', level: 1, children: [{ type: 'text', value: '一级' }] },
    ]);
    expect(parseMarkdown('### 三级 ###')).toEqual([
      { type: 'heading', level: 3, children: [{ type: 'text', value: '三级' }] },
    ]);
    // 井号后没有空格不算标题
    expect(parseMarkdown('#没有空格')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: '#没有空格' }] },
    ]);
  });

  it('连续的行合成一个段落，行内标记照常解析', () => {
    expect(parseMarkdown('第一行\n第二行')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: '第一行\n第二行' }] },
    ]);
    expect(parseMarkdown('前言\n\n正文 **加粗**')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: '前言' }] },
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: '正文 ' },
          { type: 'strong', children: [{ type: 'text', value: '加粗' }] },
        ],
      },
    ]);
  });

  it('围栏代码块原样保留内容，不吃掉后面的正文', () => {
    expect(parseMarkdown('```ts\nconst a = 1;\n**不解析**\n```\n\n收尾段落')).toEqual([
      { type: 'code', language: 'ts', value: 'const a = 1;\n**不解析**' },
      { type: 'paragraph', children: [{ type: 'text', value: '收尾段落' }] },
    ]);
  });

  it('没写收尾的围栏也算代码块', () => {
    expect(parseMarkdown('```\nabc')).toEqual([{ type: 'code', language: '', value: 'abc' }]);
  });

  it('解析引用块', () => {
    expect(parseMarkdown('> 第一句\n> 第二句')).toEqual([
      { type: 'blockquote', children: [{ type: 'text', value: '第一句\n第二句' }] },
    ]);
  });

  it('解析无序 / 有序列表，含续行', () => {
    expect(parseMarkdown('- 甲\n- 乙')).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [[{ type: 'text', value: '甲' }], [{ type: 'text', value: '乙' }]],
      },
    ]);
    expect(parseMarkdown('1. 甲\n2. 乙')).toEqual([
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'text', value: '甲' }], [{ type: 'text', value: '乙' }]],
      },
    ]);
    expect(parseMarkdown('- 第一条\n  接着写')).toEqual([
      { type: 'list', ordered: false, items: [[{ type: 'text', value: '第一条\n接着写' }]] },
    ]);
  });

  it('有序与无序混排时拆成两个列表', () => {
    expect(parseMarkdown('- 甲\n1. 乙')).toEqual([
      { type: 'list', ordered: false, items: [[{ type: 'text', value: '甲' }]] },
      { type: 'list', ordered: true, items: [[{ type: 'text', value: '乙' }]] },
    ]);
  });

  it('识别水平线，段落遇块级语法就让位', () => {
    expect(parseMarkdown('---')).toEqual([{ type: 'hr' }]);
    expect(parseMarkdown('***')).toEqual([{ type: 'hr' }]);
    expect(parseMarkdown('前言\n- 甲')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: '前言' }] },
      { type: 'list', ordered: false, items: [[{ type: 'text', value: '甲' }]] },
    ]);
  });

  it('空文档与纯空白产出空块列表', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n   \n')).toEqual([]);
  });
});

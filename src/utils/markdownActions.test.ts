import { describe, expect, it } from 'vitest';
import { applyMarkdownAction } from './markdownActions';

describe('applyMarkdownAction 行内标记', () => {
  it('有选区时把选中文字包起来，并选中里面的内容', () => {
    expect(applyMarkdownAction({ value: '这是一段测试文字', start: 2, end: 4 }, 'bold')).toEqual({
      value: '这是**一段**测试文字',
      start: 4,
      end: 6,
    });
    expect(applyMarkdownAction({ value: 'abc', start: 0, end: 3 }, 'italic')).toEqual({
      value: '*abc*',
      start: 1,
      end: 4,
    });
    expect(applyMarkdownAction({ value: 'abc', start: 0, end: 3 }, 'strike')).toEqual({
      value: '~~abc~~',
      start: 2,
      end: 5,
    });
    expect(applyMarkdownAction({ value: 'abc', start: 0, end: 3 }, 'inlineCode')).toEqual({
      value: '`abc`',
      start: 1,
      end: 4,
    });
  });

  it('没有选区时插入占位内容并选中它，直接打字就能覆盖', () => {
    expect(applyMarkdownAction({ value: 'ab', start: 1, end: 1 }, 'bold')).toEqual({
      value: 'a**粗体文本**b',
      start: 3,
      end: 7,
    });
  });
});

describe('applyMarkdownAction 行前缀', () => {
  it('标题给当前行加二级标题前缀，再来一次就取消', () => {
    const added = applyMarkdownAction({ value: '标题', start: 0, end: 2 }, 'heading');
    expect(added).toEqual({ value: '## 标题', start: 0, end: 5 });
    expect(applyMarkdownAction(added, 'heading')).toEqual({
      value: '标题',
      start: 0,
      end: 2,
    });
  });

  it('列表按选区覆盖到的行逐行加前缀，取消时也是整块去掉', () => {
    const bullet = applyMarkdownAction({ value: '甲\n乙', start: 0, end: 3 }, 'bulletList');
    expect(bullet).toEqual({ value: '- 甲\n- 乙', start: 0, end: 7 });
    expect(applyMarkdownAction(bullet, 'bulletList').value).toBe('甲\n乙');
  });

  it('有序列表逐行编号，不会每行都写 1.', () => {
    expect(applyMarkdownAction({ value: '甲\n乙\n丙', start: 0, end: 5 }, 'orderedList')).toEqual({
      value: '1. 甲\n2. 乙\n3. 丙',
      start: 0,
      end: 14,
    });
  });

  it('引用给每行加 > 前缀', () => {
    expect(applyMarkdownAction({ value: '两句\n话', start: 0, end: 4 }, 'quote').value).toBe(
      '> 两句\n> 话',
    );
  });

  it('空行上按下列表按钮会先起一个项目符号', () => {
    expect(applyMarkdownAction({ value: '', start: 0, end: 0 }, 'bulletList')).toEqual({
      value: '- ',
      start: 2,
      end: 2,
    });
    expect(applyMarkdownAction({ value: '', start: 0, end: 0 }, 'heading')).toEqual({
      value: '## ',
      start: 3,
      end: 3,
    });
  });
});

describe('applyMarkdownAction 链接与代码块', () => {
  it('选中普通文字时把文字放文字位，光标停在地址位', () => {
    expect(applyMarkdownAction({ value: '文档', start: 0, end: 2 }, 'link')).toEqual({
      value: '[文档](https://)',
      start: 5,
      end: 13,
    });
  });

  it('选中的是网址时反过来：网址进地址位，选中文字位等用户输入', () => {
    expect(applyMarkdownAction({ value: 'https://a.com', start: 0, end: 13 }, 'link')).toEqual({
      value: '[链接文字](https://a.com)',
      start: 1,
      end: 5,
    });
  });

  it('代码块用围栏包住选区，围栏自己独占一行', () => {
    expect(applyMarkdownAction({ value: '前面的文字', start: 0, end: 5 }, 'codeBlock')).toEqual({
      value: '```\n前面的文字\n```',
      start: 4,
      end: 9,
    });
    // 光标在行中间时，前面补一个换行，免得 ``` 挤在这一行里
    expect(applyMarkdownAction({ value: 'abc', start: 3, end: 3 }, 'codeBlock')).toEqual({
      value: 'abc\n```\n代码\n```',
      start: 8,
      end: 10,
    });
  });
});

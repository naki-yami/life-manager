import { describe, expect, it } from 'vitest';
import { typewriterScrollTop } from './typewriter';

const lineOf = (text: string, index: number): number =>
  text.split('\n').slice(0, index).join('\n').length + (index === 0 ? 0 : 1);

/** 40 行、每行 5 个字，行高 24，可视区 240 —— 数字好算 */
const DOC = Array.from({ length: 40 }, (_, i) => `第${i}行`).join('\n');

describe('typewriterScrollTop', () => {
  it('把光标行钉在可视区中线', () => {
    expect(
      typewriterScrollTop({
        caret: lineOf(DOC, 30),
        value: DOC,
        lineHeight: 24,
        viewportHeight: 240,
        paddingTop: 8,
      }),
    ).toBe(620);
  });

  it('开头几行不滚出上边界', () => {
    expect(
      typewriterScrollTop({
        caret: lineOf(DOC, 1),
        value: DOC,
        lineHeight: 24,
        viewportHeight: 240,
        paddingTop: 8,
      }),
    ).toBe(0);
  });

  it('结尾几行不滚过下边界', () => {
    expect(
      typewriterScrollTop({
        caret: lineOf(DOC, 39),
        value: DOC,
        lineHeight: 24,
        viewportHeight: 240,
        paddingTop: 8,
      }),
    ).toBe(736);
  });

  it('尺寸没量出来时返回 0，不动用户的滚动位置', () => {
    const base = { caret: 100, value: DOC, lineHeight: 24, viewportHeight: 240, paddingTop: 8 };
    expect(typewriterScrollTop({ ...base, viewportHeight: 0 })).toBe(0);
    expect(typewriterScrollTop({ ...base, lineHeight: 0 })).toBe(0);
  });

  it('光标越界的脏值按收边处理', () => {
    const base = { value: DOC, lineHeight: 24, viewportHeight: 240, paddingTop: 8 };
    expect(typewriterScrollTop({ ...base, caret: -50 })).toBe(0);
    expect(typewriterScrollTop({ ...base, caret: 99999 })).toBe(736);
  });

  it('单行短文永远不需要滚动', () => {
    expect(
      typewriterScrollTop({
        caret: 3,
        value: '很短的一行',
        lineHeight: 24,
        viewportHeight: 240,
        paddingTop: 8,
      }),
    ).toBe(0);
  });
});

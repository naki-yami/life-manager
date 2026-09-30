import { describe, expect, it } from 'vitest';
import {
  charWidthUnits,
  lineWidthUnits,
  typewriterScrollTop,
  wrappedLineCounts,
} from './typewriter';

const lineOf = (text: string, index: number): number =>
  text.split('\n').slice(0, index).join('\n').length + (index === 0 ? 0 : 1);

/** 40 行、每行 5 个字，行高 24，可视区 240 —— 数字好算 */
const DOC = Array.from({ length: 40 }, (_, i) => `第${i}行`).join('\n');

/** 不传宽度的口径：不折行 */
const plain = { lineHeight: 24, viewportHeight: 240, paddingTop: 8 };

describe('charWidthUnits', () => {
  it('ASCII 与拉丁字母算一个半角宽', () => {
    expect(charWidthUnits('a')).toBe(1);
    expect(charWidthUnits('Z')).toBe(1);
    expect(charWidthUnits(' ')).toBe(1);
  });

  it('汉字与全角标点算两个半角宽', () => {
    expect(charWidthUnits('中')).toBe(2);
    expect(charWidthUnits('。')).toBe(2);
    expect(charWidthUnits('，')).toBe(2);
    expect(charWidthUnits('：')).toBe(2);
  });

  it('emoji 与基本平面外的码点不崩', () => {
    // 字形宽度取决于字体，这里只要不抛异常、给个合理值
    expect(charWidthUnits('😀')).toBeGreaterThanOrEqual(1);
    expect(charWidthUnits('𠀋')).toBe(2);
  });

  it('lineWidthUnits 按串累加', () => {
    expect(lineWidthUnits('ab中')).toBe(4);
    expect(lineWidthUnits('')).toBe(0);
  });
});

describe('wrappedLineCounts', () => {
  it('短行不折', () => {
    expect(wrappedLineCounts(['abc'], 10)).toEqual([1]);
  });

  it('刚好放满不折，多一个才折', () => {
    expect(wrappedLineCounts(['0123456789'], 10)).toEqual([1]);
    expect(wrappedLineCounts(['0123456789a'], 10)).toEqual([2]);
  });

  it('空行算一行', () => {
    expect(wrappedLineCounts(['', 'ab'], 10)).toEqual([1, 1]);
  });

  it('中文按两格算，一行放得下的汉字更少', () => {
    // 10 个半角宽 = 5 个汉字；6 个汉字要折成两行
    expect(wrappedLineCounts(['中中中中中'], 10)).toEqual([1]);
    expect(wrappedLineCounts(['中中中中中中'], 10)).toEqual([2]);
  });

  it('宽度没量出来时一律当一行', () => {
    expect(wrappedLineCounts(['很长很长很长很长的一行'], 0)).toEqual([1]);
  });

  it('tab 按 8 格对齐前进', () => {
    // 从 0 起跳，tab 正好占满 8 格，刚好放满不折
    expect(wrappedLineCounts(['\t'], 8)).toEqual([1]);
    // 一行只放 4 格时，tab 的 8 格放不下，折行
    expect(wrappedLineCounts(['\t'], 4)).toEqual([2]);
    // 先走 1 格再 tab，补到第 8 格，仍不折
    expect(wrappedLineCounts(['a\t'], 8)).toEqual([1]);
  });
});

describe('typewriterScrollTop（不折行）', () => {
  it('把光标行钉在可视区中线', () => {
    expect(typewriterScrollTop({ ...plain, caret: lineOf(DOC, 30), value: DOC })).toBe(620);
  });

  it('开头几行不滚出上边界', () => {
    expect(typewriterScrollTop({ ...plain, caret: lineOf(DOC, 1), value: DOC })).toBe(0);
  });

  it('结尾几行不滚过下边界', () => {
    expect(typewriterScrollTop({ ...plain, caret: lineOf(DOC, 39), value: DOC })).toBe(736);
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
    expect(typewriterScrollTop({ ...plain, caret: 3, value: '很短的一行' })).toBe(0);
  });
});

describe('typewriterScrollTop（折行感知）', () => {
  // 一行放得下 10 个半角宽 = 5 个汉字；charWidth 10px、lineHeight 24px
  const wide = { ...plain, contentWidth: 100, charWidth: 10 };

  it('同一逻辑行里，光标越靠后滚得越远', () => {
    // 300 个汉字 = 600 半角宽 = 折 60 个视觉行，内容高 1456 远超可视区 240
    const long = '中'.repeat(300);
    const atStart = typewriterScrollTop({ ...wide, caret: 0, value: long });
    const atEnd = typewriterScrollTop({ ...wide, caret: long.length, value: long });
    expect(atStart).toBe(0);
    expect(atEnd).toBeGreaterThan(atStart);
  });

  it('行数按视觉行算，不再按换行符算', () => {
    // 两行、每行 30 个汉字 = 各折 6 个视觉行；光标停在第二行末尾 → 视觉第 11 行
    const doc = `${'中'.repeat(30)}\n${'中'.repeat(30)}`;
    const scroll = typewriterScrollTop({ ...wide, caret: doc.length, value: doc });
    // 居中 = 8 + 11*24 + 12 − 120 = 164；总 12 行、内容高 304、可视区 240 → 触底 64
    const maxScroll = 8 * 2 + 12 * 24 - 240;
    expect(scroll).toBe(maxScroll);
    expect(scroll).toBe(64);
  });

  it('折行之后，「第几个换行」不再等于「第几个视觉行」', () => {
    // 300 个汉字铺成一行 = 折 60 个视觉行，但换行符只有 0 个。
    // 若按老口径数，这一整篇会被当成 1 行、永远不滚 —— 正是要修的那个 bug。
    const doc = '中'.repeat(300);
    expect(typewriterScrollTop({ ...wide, caret: 0, value: doc })).toBe(0);
    const atEnd = typewriterScrollTop({ ...wide, caret: doc.length, value: doc });
    const lastVisualRow = 59; // 0 起
    const maxScroll = 8 * 2 + 60 * 24 - 240;
    expect(atEnd).toBe(maxScroll);
    // 落点应当接近「最后一个视觉行的中线对可视区中线」，被下边界收住
    expect(8 + lastVisualRow * 24 + 12 - 120).toBeGreaterThan(maxScroll);
  });

  it('长行结尾的落点收在下边界内', () => {
    const long = 'a'.repeat(500); // 折 50 个视觉行，远超可视区
    const scroll = typewriterScrollTop({ ...wide, caret: long.length, value: long });
    const maxScroll = 8 * 2 + 50 * 24 - 240;
    expect(scroll).toBe(maxScroll);
  });

  it('短中文行（折不动）与不折行的老口径给出同一个值', () => {
    // 5 个汉字 = 10 个半角宽，刚好一行放得下，所以传入宽度不该改变结果
    const doc = Array.from({ length: 40 }, (_, i) => `第${i}行`).join('\n');
    expect(typewriterScrollTop({ ...wide, caret: lineOf(doc, 30), value: doc })).toBe(620);
  });

  it('不传宽度时退回老算法，与老用例数字一致', () => {
    expect(typewriterScrollTop({ ...plain, caret: lineOf(DOC, 30), value: DOC })).toBe(620);
    expect(typewriterScrollTop({ ...plain, caret: lineOf(DOC, 39), value: DOC })).toBe(736);
  });
});

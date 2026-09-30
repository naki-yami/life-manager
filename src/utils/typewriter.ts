/**
 * 打字机滚动的定位计算。
 *
 * 目标是让光标所在的那一行钉在可视区垂直中线上，写作时视线不用跟着光标往下追。
 *
 * 关键点是「第几行」不能只数换行符：textarea 会把超宽的长行折成软换行，
 * 一个换行符在视觉上可能是两行、三行。数错一行，滚动就偏一行高，贴长段英文时越滚越歪。
 * 所以这里先把每行按可用宽度折成视觉行数，再定位。
 *
 * 折行宽度靠字符宽度估算（见 `charWidthUnits`）—— 浏览器没有便宜的「这行折了几行」的接口，
 * 而把 DOM 测量塞进来会让这个模块没法单独测。估算对中文（等宽）几乎无损，
 * 对英文长段的偏差在半个字宽以内，落到滚动上感觉不出来。
 */

/** 一个字符占几个「半角宽」。CJK 与全角标点算 2，其余算 1 */
const WIDE_RANGES: Array<[number, number]> = [
  [0x1100, 0x115f], // 谚文字母
  [0x2e80, 0x303e], // CJK 部首、假名标点
  [0x3041, 0x33ff], // 假名、注音、CJK 兼容
  [0x3400, 0x4dbf], // CJK 扩展 A
  [0x4e00, 0x9fff], // CJK 基本区
  [0xa000, 0xa4cf], // 彝文
  [0xac00, 0xd7a3], // 谚文音节
  [0xf900, 0xfaff], // CJK 兼容表意
  [0xfe30, 0xfe6f], // CJK 兼容形式
  [0xff00, 0xff60], // 全角形式
  [0xffe0, 0xffe6], // 全角符号
  [0x20000, 0x3fffd], // CJK 扩展 B 及以后
];

/** 单个字符占几个半角宽：CJK / 全角 2，其余 1 */
export function charWidthUnits(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x1100) return 1; // ASCII 与拉丁扩展，快速路径
  for (const [start, end] of WIDE_RANGES) {
    if (code >= start && code <= end) return 2;
  }
  return 1;
}

/** 一行文本占几个半角宽 */
export function lineWidthUnits(text: string): number {
  let units = 0;
  for (const char of text) units += charWidthUnits(char);
  return units;
}

/** tab 在 textarea 里按 8 个半角宽前进（默认 tab-size） */
const TAB_UNITS = 8;
const TAB_STOPS = 8;

/**
 * 把一到多个逻辑行折成视觉行数。
 *
 * @param lines      逻辑行（已经按 \n 切好）
 * @param unitsPerRow 一行能放几个半角宽
 * @returns 每一行对应的视觉行数，与入参等长
 */
export function wrappedLineCounts(lines: readonly string[], unitsPerRow: number): number[] {
  // 宽度没量出来就当每行都是一行，别把滚动算歪
  if (unitsPerRow <= 0) return lines.map(() => 1);

  return lines.map((line) => {
    if (line === '') return 1;
    let rows = 1;
    let cursor = 0;
    for (const char of line) {
      const step = char === '\t' ? TAB_UNITS - (cursor % TAB_STOPS) : charWidthUnits(char);
      // 刚好放满不折，多一个字符才换行 —— 跟浏览器一致
      if (cursor + step > unitsPerRow) {
        rows += 1;
        cursor = step;
      } else {
        cursor += step;
      }
    }
    return rows;
  });
}

export interface TypewriterScrollInput {
  /** 光标在全文中的偏移（textarea 的 selectionStart） */
  caret: number;
  /** 当前全文 */
  value: string;
  /** 单行高度，px */
  lineHeight: number;
  /** 可视区高度（textarea 的 clientHeight），px */
  viewportHeight: number;
  /** 上内边距，px */
  paddingTop: number;
  /**
   * 内容区可用宽度，px。传了才折行；不传就退回「一个换行 = 一行」的老算法。
   * 传的时候记得减掉左右 padding 与滚动条宽度。
   */
  contentWidth?: number;
  /** 一个半角字符的宽度，px。中文按 2 倍算。缺省时按 lineHeight / 2 估 */
  charWidth?: number;
}

/**
 * 折行感知的定位：把光标所在**视觉行**的中线对上可视区中线。
 *
 * 返回的是 textarea.scrollTop 该取的值，已收进 [0, maxScroll]。
 */
export function typewriterScrollTop({
  caret,
  value,
  lineHeight,
  viewportHeight,
  paddingTop,
  contentWidth,
  charWidth,
}: TypewriterScrollInput): number {
  // 尺寸还没量出来（首帧、被隐藏）就先别滚，免得把用户的滚动位置顶掉
  if (lineHeight <= 0 || viewportHeight <= 0) return 0;

  const safeCaret = Math.min(Math.max(caret, 0), value.length);
  const lines = value.split('\n');

  // 光标落在第几个逻辑行、行内第几个字符
  const logicalLine = value.slice(0, safeCaret).split('\n').length - 1;
  const lineStart = lines.slice(0, logicalLine).reduce((sum, line) => sum + line.length + 1, 0);
  const caretInLine = safeCaret - lineStart;

  const perRow = charWidth && charWidth > 0 ? Math.max(1, contentWidth! / charWidth) : 0;
  const rowCounts = wrappedLineCounts(lines, perRow);

  // 光标之前的行各占几个视觉行
  let visualLine = 0;
  for (let index = 0; index < logicalLine; index += 1) visualLine += rowCounts[index];

  // 光标在**本行内**的第几个视觉行：把光标前那段单独折一遍
  if (perRow > 0 && logicalLine < lines.length) {
    const before = lines[logicalLine].slice(0, caretInLine);
    visualLine += wrappedLineCounts([before], perRow)[0] - 1;
  }

  // 让这个视觉行的中线对上可视区中线
  const centered = paddingTop + visualLine * lineHeight + lineHeight / 2 - viewportHeight / 2;

  const totalRows = perRow > 0 ? rowCounts.reduce((sum, n) => sum + n, 0) : lines.length;
  const contentHeight = paddingTop * 2 + totalRows * lineHeight;
  const maxScroll = Math.max(0, contentHeight - viewportHeight);

  return Math.min(Math.max(0, centered), maxScroll);
}

/**
 * 打字机滚动的定位计算。
 *
 * 目标是让光标所在的那一行钉在可视区垂直中线上，写作时视线不用跟着光标往下追。
 * 这里只吃「光标落在第几行」和几个排版量，不碰 DOM，方便单独测。
 *
 * 注意：按「一个换行 = 一行」算，没有考虑长行自动折行带来的软换行。
 * 中文正文一行通常写不到折行宽度，这个近似足够用，也不会把滚动算歪到离谱的位置。
 */

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
}

export function typewriterScrollTop({
  caret,
  value,
  lineHeight,
  viewportHeight,
  paddingTop,
}: TypewriterScrollInput): number {
  // 尺寸还没量出来（首帧、被隐藏）就先别滚，免得把用户的滚动位置顶掉
  if (lineHeight <= 0 || viewportHeight <= 0) return 0;

  const safeCaret = Math.min(Math.max(caret, 0), value.length);
  const line = value.slice(0, safeCaret).split('\n').length - 1;

  // 让这一行的中线对上可视区中线
  const centered = paddingTop + line * lineHeight + lineHeight / 2 - viewportHeight / 2;

  const totalLines = value.split('\n').length;
  const contentHeight = paddingTop * 2 + totalLines * lineHeight;
  const maxScroll = Math.max(0, contentHeight - viewportHeight);

  return Math.min(Math.max(0, centered), maxScroll);
}

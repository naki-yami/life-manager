/**
 * 极简模糊匹配：给命令面板用。
 *
 * 只做「子序列匹配 + 位置加权」，不引入 fuse.js 之类的依赖：
 * - 连续命中加分（`bks` 命中「读书 books」时 'b''o''o' 不连续，但 'b''k''s' 亦然）
 * - 词首命中加分（空格、`-`、`_`、`/` 之后，或首字母）
 * - 越早命中加分，越短的目标加分
 * 目标是「可预测」而不是「智能」，宁可漏配也不要给出莫名其妙的结果。
 */

export interface FuzzyResult {
  score: number;
  /** 命中的下标（升序），供调用方做高亮 */
  matched: number[];
}

const WORD_BOUNDARY = /[\s\-_/.]/;

export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  const q = query.trim().toLowerCase();
  if (q === '') return { score: 0, matched: [] };

  const t = target.toLowerCase();
  if (t.length === 0) return null;

  const matched: number[] = [];
  let score = 0;
  let ti = 0;
  let prevMatch = -2;

  for (let qi = 0; qi < q.length; qi += 1) {
    const ch = q[qi];
    if (ch === ' ') continue; // 空格只用来分隔，不参与匹配

    const found = t.indexOf(ch, ti);
    if (found === -1) return null;

    const isConsecutive = found === prevMatch + 1;
    const isBoundary = found === 0 || WORD_BOUNDARY.test(t[found - 1]);

    score += 10;
    if (isConsecutive) score += 12;
    if (isBoundary) score += 8;
    score -= Math.min(found - ti, 8); // 跳过的字符越多扣分越多（封顶，避免长目标被判死）

    matched.push(found);
    prevMatch = found;
    ti = found + 1;
  }

  // 目标越短越可能是用户想找的
  score -= Math.floor(t.length / 4);

  return { score, matched };
}

export interface FuzzyFilterOptions<T> {
  limit?: number;
  getText: (item: T) => string;
  /** 额外参与匹配的别名，例如英文名或拼音缩写 */
  getKeywords?: (item: T) => string[];
}

/** 按分数降序返回命中的条目，附带命中下标用于高亮 */
export function fuzzyFilter<T>(
  query: string,
  items: readonly T[],
  options: FuzzyFilterOptions<T>,
): Array<{ item: T; score: number; matched: number[] }> {
  const { limit = Infinity, getText, getKeywords } = options;
  const results: Array<{ item: T; score: number; matched: number[] }> = [];

  for (const item of items) {
    const candidates = [getText(item), ...(getKeywords?.(item) ?? [])];
    let best: FuzzyResult | null = null;
    for (const candidate of candidates) {
      const result = fuzzyMatch(query, candidate);
      if (result && (!best || result.score > best.score)) best = result;
    }
    if (best) results.push({ item, score: best.score, matched: best.matched });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * 统一标签：一套标签贯穿所有模块。
 *
 * 设计取舍（见 docs/Life-Manager-V2-优化建议.md §9）：
 * - 标签只存在各条记录自己的 `tags` 字段里，不额外建一张「标签表」。
 *   好处是导入 / 导出 / 备份不用维护两张表之间的一致性，删掉最后一条带某标签的
 *   记录，这个标签自然就消失了。
 * - 颜色不存元数据，由标签名哈希决定。同一个标签在任何页面、任何时候都是同一个颜色，
 *   但没有「改配色」这层 UI —— 目前不值得为它多开一个 store 和一套设置面板。
 */

/** 单个标签的长度上限（超出直接截断，不报错） */
export const MAX_TAG_LENGTH = 16;
/** 一条记录最多带几个标签；批量打标签是 V2.2 的事，这里先给个上限 */
export const MAX_TAG_COUNT = 8;

/** 标签配色档位；取值与 `Badge` 的 tone 一致，可以直接传给 Badge */
export type TagTone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TAG_TONES: readonly TagTone[] = ['accent', 'success', 'info', 'warning', 'danger', 'default'];

/**
 * 归一化单个标签：去掉 `#` 前缀与首尾空白、把内部空白压成一个空格、超长截断。
 * 空串表示「这不是一个有效标签」，调用方应当丢弃。
 */
export function normalizeTag(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/^[#＃]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return trimmed.length > MAX_TAG_LENGTH ? trimmed.slice(0, MAX_TAG_LENGTH) : trimmed;
}

/**
 * 归一化一组标签：丢弃空值与非字符串、忽略大小写去重、按 MAX_TAG_COUNT 截断。
 * 幂等，可以安全地反复调用（持久化层与备份导入都会用它）。
 */
export function normalizeTags(list: readonly unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const tag = normalizeTag(entry);
    if (tag === '') continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= MAX_TAG_COUNT) break;
  }

  return result;
}

/** 这条记录是否带某个标签（忽略大小写；标签名可以带 `#`） */
export function hasTag(tags: readonly string[] | undefined, tag: string): boolean {
  if (!tags || tags.length === 0) return false;
  const key = normalizeTag(tag).toLowerCase();
  if (key === '') return false;
  return tags.some((item) => item.toLowerCase() === key);
}

/** 由标签名哈希出配色，保证同一标签到处同色 */
export function tagTone(tag: string): TagTone {
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = (hash * 31 + tag.charCodeAt(index)) % 100000;
  }
  return TAG_TONES[hash % TAG_TONES.length];
}

/**
 * `#标签` 的匹配规则。
 *
 * `#` 前面不允许是英文字母或数字，所以 `C#`、`A4#2` 不会被误认成标签；
 * 中文没有空格，`写周报#工作` 这种写法必须能认出来，所以前面是汉字时仍然算。
 * 标签体排除空白与各类标点，因此 `#工作，明天交` 里的标签是「工作」。
 */
const TAG_TOKEN = /(?<![A-Za-z0-9])[#＃]([^\s#,，。；;！!？?、.：:…（）()【】[\]"'“”]+)/gu;

/** 标签被摘掉后可能留下的孤立标点，例如「交周报 ，明天」 */
const ORPHAN_PUNCTUATION = /\s*([,，。；;！!？?、])\s*/g;

/**
 * 从一段文字里摘出所有 `#标签`，返回「去掉了标签的文字」与「标签列表」。
 * 用于快速捕获：`交周报 #工作 #紧急 明天` → 文字「交周报 明天」+ 两个标签。
 */
export function extractTags(text: string): { text: string; tags: string[] } {
  const found: string[] = [];
  const stripped = text.replace(TAG_TOKEN, (_match, body: string) => {
    found.push(body);
    return '';
  });

  if (found.length === 0) return { text, tags: [] };

  return {
    text: stripped.replace(/\s+/g, ' ').replace(ORPHAN_PUNCTUATION, '$1').trim(),
    tags: normalizeTags(found),
  };
}

export interface TagStat {
  tag: string;
  /** 带这个标签的记录条数 */
  count: number;
  /** 出现在哪些模块（传进来的 kindLabel），用来提示「这个标签跨了几个模块」 */
  kinds: string[];
}

/**
 * 汇总一批记录上的标签，按「用得多的在前、同样多按名字」排序。
 * 给标签筛选条与命令面板的标签提示用。
 */
export function collectTagStats(
  items: ReadonlyArray<{ tags?: readonly string[]; kind: string }>,
): TagStat[] {
  const map = new Map<string, { tag: string; count: number; kinds: Set<string> }>();

  for (const item of items) {
    for (const tag of item.tags ?? []) {
      const key = tag.toLowerCase();
      const entry = map.get(key) ?? { tag, count: 0, kinds: new Set<string>() };
      entry.count += 1;
      entry.kinds.add(item.kind);
      map.set(key, entry);
    }
  }

  return (
    [...map.values()]
      .map<TagStat>((entry) => ({
        tag: entry.tag,
        count: entry.count,
        kinds: [...entry.kinds].sort(),
      }))
      // 次数相同时按码点排序：不依赖运行环境的语言环境，结果在任何机器上都一样
      .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
  );
}

import { describe, expect, it } from 'vitest';
// 以原文方式引入样式源文件：测试要核对的就是「令牌本身」，不经过构建产物
import css from './tokens.css?raw';

export interface CssBlock {
  selector: string;
  declarations: Record<string, string>;
}

/**
 * 极简 CSS 解析：只保留「选择器 → 声明」这一层，够用来核对设计令牌。
 * 嵌套块（@media 里的 :root）会拼成「外层 内层」这样的选择器。
 */
export function parseBlocks(source: string): CssBlock[] {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: CssBlock[] = [];
  const stack: string[] = [];
  let pending = '';

  for (const token of clean.split(/([{};])/)) {
    if (token === '{') {
      stack.push(pending.trim());
      pending = '';
      continue;
    }
    if (token === '}') {
      stack.pop();
      pending = '';
      continue;
    }
    if (token === ';') {
      const [name, ...value] = pending.split(':');
      const selector = stack.join(' ');
      if (selector && name && value.length > 0) {
        blocks.push({
          selector,
          declarations: { [name.trim()]: value.join(':').trim() },
        });
      }
      pending = '';
      continue;
    }
    pending += token;
  }

  return blocks;
}

const blocks = parseBlocks(css);

/** 读某个选择器块里的令牌；同名块取最后一次定义（与 CSS 层叠一致） */
function tokenOf(selector: string, name: string): string {
  const matched = blocks.filter(
    (block) => block.selector === selector && name in block.declarations,
  );
  const value = matched[matched.length - 1]?.declarations[name];
  if (!value) throw new Error(`tokens.css 里找不到 ${selector} { ${name} }`);
  return value;
}

const px = (value: string): number => Number.parseFloat(value);

describe('设计令牌 · 窄屏留白', () => {
  const mobileSelector = '@media (max-width: 640px) :root';
  const compactSelector = "[data-density='compact']";

  it('窄屏下页面留白比桌面端更小', () => {
    expect(px(tokenOf(mobileSelector, '--lm-page-pad'))).toBeLessThan(
      px(tokenOf(':root', '--lm-page-pad')),
    );
    expect(px(tokenOf(mobileSelector, '--lm-section-gap'))).toBeLessThan(
      px(tokenOf(':root', '--lm-section-gap')),
    );
  });

  it('紧凑密度的覆盖写在窄屏覆盖之后，小屏上依然更紧凑', () => {
    expect(css.indexOf(compactSelector)).toBeGreaterThan(css.indexOf('@media (max-width: 640px)'));
    expect(px(tokenOf(compactSelector, '--lm-page-pad'))).toBeLessThan(
      px(tokenOf(mobileSelector, '--lm-page-pad')),
    );
  });
});

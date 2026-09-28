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

type Rgba = [number, number, number, number];

/** 支持 #rrggbb / #rgb / rgba(r, g, b, a) */
function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const digits = hex[1];
    const full =
      digits.length === 3
        ? digits
            .split('')
            .map((char) => char + char)
            .join('')
        : digits;
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
      1,
    ];
  }

  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (rgba) {
    const parts = rgba[1].split(',').map((part) => Number.parseFloat(part.trim()));
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }

  throw new Error(`无法解析颜色：${value}`);
}

/** 半透明色叠在底色上，得到实际渲染出来的颜色 */
function composite(top: Rgba, base: Rgba): Rgba {
  const alpha = top[3];
  return [0, 1, 2].reduce<Rgba>(
    (acc, index) => {
      acc[index] = Math.round(top[index] * alpha + base[index] * (1 - alpha));
      return acc;
    },
    [0, 0, 0, 1],
  );
}

/** WCAG 2.1 相对亮度 */
function luminance([red, green, blue]: Rgba): number {
  const channel = (value: number): number => {
    const ratio = value / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrastRatio(foreground: Rgba, background: Rgba): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

interface Pair {
  name: string;
  /** 文字色令牌 */
  fg: string;
  /** 背景色令牌 */
  bg: string;
  /** 背景是半透明时，叠在哪层底色上 */
  over?: string;
}

/** 真正会出现在界面上的文字/底色组合 */
const TEXT_PAIRS: Pair[] = [
  { name: '正文 / 卡片', fg: '--lm-content', bg: '--lm-bg-surface' },
  { name: '正文 / 页面底', fg: '--lm-content', bg: '--lm-bg-canvas' },
  { name: '正文 / 内嵌底', fg: '--lm-content', bg: '--lm-bg-inset' },
  { name: '次要文字 / 卡片', fg: '--lm-content-secondary', bg: '--lm-bg-surface' },
  { name: '次要文字 / 内嵌底', fg: '--lm-content-secondary', bg: '--lm-bg-inset' },
  { name: '辅助文字 / 卡片', fg: '--lm-content-tertiary', bg: '--lm-bg-surface' },
  { name: '辅助文字 / 页面底', fg: '--lm-content-tertiary', bg: '--lm-bg-canvas' },
  { name: '辅助文字 / 内嵌底', fg: '--lm-content-tertiary', bg: '--lm-bg-inset' },
  { name: '辅助文字 / 浮层', fg: '--lm-content-tertiary', bg: '--lm-bg-elevated' },
  { name: '主色文字 / 卡片', fg: '--lm-accent', bg: '--lm-bg-surface' },
  {
    name: '主色文字 / 选中底',
    fg: '--lm-accent',
    bg: '--lm-bg-selected',
    over: '--lm-bg-surface',
  },
  {
    name: '主色文字 / 主色浅底',
    fg: '--lm-accent',
    bg: '--lm-accent-soft',
    over: '--lm-bg-surface',
  },
  { name: '主色按钮文字 / 主色', fg: '--lm-accent-contrast', bg: '--lm-accent' },
  { name: '主色按钮文字 / 主色 hover', fg: '--lm-accent-contrast', bg: '--lm-accent-strong' },
  {
    name: '成功文字 / 成功浅底',
    fg: '--lm-success',
    bg: '--lm-success-soft',
    over: '--lm-bg-surface',
  },
  {
    name: '警告文字 / 警告浅底',
    fg: '--lm-warning',
    bg: '--lm-warning-soft',
    over: '--lm-bg-surface',
  },
  {
    name: '危险文字 / 危险浅底',
    fg: '--lm-danger',
    bg: '--lm-danger-soft',
    over: '--lm-bg-surface',
  },
  {
    name: '信息文字 / 信息浅底',
    fg: '--lm-info',
    bg: '--lm-info-soft',
    over: '--lm-bg-surface',
  },
  { name: '危险按钮文字 / 危险', fg: '--lm-danger-contrast', bg: '--lm-danger' },
];

describe('设计令牌 · 文字对比度', () => {
  it.each([':root', '.dark'])('%s 主题下所有文字组合达到 WCAG AA（4.5:1）', (selector) => {
    const failures = TEXT_PAIRS.flatMap((pair) => {
      const foreground = parseColor(tokenOf(selector, pair.fg));
      const raw = parseColor(tokenOf(selector, pair.bg));
      // 半透明底色要先叠在它实际所在的层上，才是眼睛看到的颜色；
      // 没写 over 时按页面底算，避免默认值把深色主题当成白底。
      const background =
        raw[3] < 1
          ? composite(raw, parseColor(tokenOf(selector, pair.over ?? '--lm-bg-canvas')))
          : raw;
      const ratio = contrastRatio(foreground, background);
      return ratio >= 4.5 ? [] : [`${pair.name}：${ratio.toFixed(2)}:1`];
    });

    expect(failures).toEqual([]);
  });
});

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

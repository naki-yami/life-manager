/**
 * 把页面上的图表卡导出成 PNG。
 *
 * 做法是「拍照」而不是「重画」：把目标元素的 DOM 深拷贝一份，把每个节点的计算样式内联进
 * `style` 属性，整体塞进 `<foreignObject>` 交给 SVG，最后由 canvas 转成位图。
 *
 * 为什么不按数据重画到 canvas：统计页的柱状图 / 堆叠柱是 HTML 元素拼的（不是 SVG），
 * 要为每种图各写一套 canvas 绘制代码，等于把配色、间距、刻度再实现一遍 —— 以后改一次样式就得改两处，
 * 迟早画出来的和屏幕上看到的不一样。拍照不会漂移，也顺带把标题、单位、图例一起带上。
 *
 * 内联样式是必需的：Tailwind 的类名定义在外部样式表里，单独把 DOM 丢进 SVG 是不带样式的，
 * 导出来会是一堆没有颜色和间距的黑字。自定义属性（`--lm-*`）不用抄 —— 计算值已经把 `var()` 解开了。
 */
import { todayKey } from './date';
import { downloadBlob } from './download';

/** 导出时要从副本里剔除的节点：导出按钮自己不该出现在图里 */
const SKIP_SELECTOR = '[data-export-skip]';

/** 文件名里不宜出现的字符（Windows / POSIX 取并集，再顺手收掉空白与间隔号） */
const UNSAFE_FILENAME = /[\\/:*?"<>|\s·—]+/g;

/** 「任务完成趋势」+ 今天 → `life-manager-任务完成趋势-2026-09-30.png` */
export function pngFileNameOf(label: string, dateKey: string = todayKey()): string {
  const safe = label.replace(UNSAFE_FILENAME, '-').replace(/^-+|-+$/g, '');
  return `life-manager-${safe || 'chart'}-${dateKey}.png`;
}

export interface ElementPngOptions {
  /** 导出倍数；2 是二倍图，Retina 屏与印刷都够用 */
  scale?: number;
}

/**
 * 把元素连样式一起序列化成一张 SVG 字符串（`<foreignObject>` 里装着 DOM 副本）。
 *
 * 单独拆出来是为了能脱离 canvas 单测：这一步只用到 DOM 与 `getComputedStyle`，
 * 「能不能变成位图」才是浏览器的事。
 */
export function snapshotToSvgMarkup(element: HTMLElement): string {
  const { width, height } = sizeOf(element);
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(SKIP_SELECTOR).forEach((node) => node.remove());
  inlineComputedStyles(element, clone);
  // 副本脱离文档流后自身没有尺寸，得把实拍到的宽高补回去，否则 foreignObject 里是 0 高
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
    new XMLSerializer().serializeToString(clone) +
    '</foreignObject></svg>'
  );
}

/** 把元素连样式一起拍成 PNG；失败时抛出带原因的 Error，由调用方决定怎么提示 */
export async function elementToPngBlob(
  element: HTMLElement,
  options: ElementPngOptions = {},
): Promise<Blob> {
  const scale = Math.max(1, options.scale ?? 2);
  const { width, height } = sizeOf(element);

  const canvas = document.createElement('canvas');
  // 先问 canvas 要上下文：拿不到就别白费功夫去抄样式、加载图片了
  const context = canvas.getContext('2d');
  if (!context) throw new Error('这个浏览器没有提供 canvas，导不出图片');

  const image = await loadImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(snapshotToSvgMarkup(element))}`,
  );

  // 改尺寸会重置画布状态，所以放在取上下文之后、缩放之前
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  context.scale(scale, scale);
  // 先铺一层卡片自己的底色：暗色主题下卡片是深色的，不铺的话透明区在别处会变成白底黑字
  context.fillStyle = backgroundColorOf(element);
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('生成 PNG 失败');
  return blob;
}

/** 导出并直接触发下载；返回生成的文件名，供提示语复用 */
export async function exportElementAsPng(element: HTMLElement, label: string): Promise<string> {
  const fileName = pngFileNameOf(label);
  const blob = await elementToPngBlob(element);
  downloadBlob(fileName, blob);
  return fileName;
}

/** 实拍元素的边框盒尺寸；取整后至少 1px，免得 0 尺寸的元素在 SVG 里报错 */
function sizeOf(element: HTMLElement): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function inlineComputedStyles(source: Element, target: Element): void {
  const computed = window.getComputedStyle(source);
  let css = '';
  // 按索引遍历而不是 for...of：jsdom 里 CSSStyleDeclaration 不保证可迭代
  for (let index = 0; index < computed.length; index += 1) {
    const property = computed.item(index);
    if (!property || property.startsWith('--')) continue;
    css += `${property}:${computed.getPropertyValue(property)};`;
  }
  target.setAttribute('style', css);

  const sourceChildren = source.children;
  const targetChildren = target.children;
  const count = Math.min(sourceChildren.length, targetChildren.length);
  for (let index = 0; index < count; index += 1) {
    inlineComputedStyles(sourceChildren[index]!, targetChildren[index]!);
  }
}

function backgroundColorOf(element: HTMLElement): string {
  const color = window.getComputedStyle(element).backgroundColor;
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return '#ffffff';
  return color;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图表渲染失败，导不出图片'));
    image.src = src;
  });
}

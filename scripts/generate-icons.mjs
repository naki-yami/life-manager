/**
 * 生成 PWA 图标（192 / 512 / maskable 512）与 favicon.svg。
 *
 * 为什么不用 sharp / canvas：就为了三个纯色几何图形，拉进一棵要本地编译的原生依赖树不划算
 * （这个项目的依赖准则就是够用就好）。这里用 Node 自带的 zlib 手写 PNG（RGBA + filter 0），
 * 4 倍超采样再降采样做抗锯齿。产物是确定的，跑一次把结果提交进 public/ 即可。
 *
 * 用法：node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 与 tokens.css 的 --lm-accent（亮色）同色，图标不另开一套品牌色 */
const ACCENT = [0x3b, 0x5b, 0xdb];
const GLYPH = [0xff, 0xff, 0xff];
/** 超采样倍数：先按要求 4 倍分辨率画，再平均成 1 个像素，边缘才不会有锯齿 */
const SUPERSAMPLE = 4;

/** 字形「L」的两根矩形（竖 + 横），坐标是 0..1 的相对值 */
const GLYPH_RECTS = [
  [0.35, 0.26, 0.46, 0.74],
  [0.35, 0.63, 0.7, 0.74],
];

/** 圆角矩形命中判定；半径为 0 时退化成普通矩形 */
function insideRoundRect(x, y, x0, y0, x1, y1, radius) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

const insideRect = (x, y, [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** 一个像素点是否落在「L」上 */
const insideGlyph = (x, y) => GLYPH_RECTS.some((rect) => insideRect(x, y, rect));

/**
 * 渲染一张 size×size 的 RGBA 位图。
 * maskable 变体铺满整块画布（系统会自己裁形状），所以不留圆角、并把字形缩到安全区内。
 */
function render(size, { maskable = false } = {}) {
  const radius = maskable ? 0 : 0.22;
  const glyphScale = maskable ? 0.74 : 1;
  const pixels = Buffer.alloc(size * size * 4);
  const total = SUPERSAMPLE * SUPERSAMPLE;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let backgroundHits = 0;
      let glyphHits = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) / size;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) / size;
          if (!insideRoundRect(x, y, 0, 0, 1, 1, radius)) continue;
          backgroundHits += 1;
          const gx = 0.5 + (x - 0.5) / glyphScale;
          const gy = 0.5 + (y - 0.5) / glyphScale;
          if (insideGlyph(gx, gy)) glyphHits += 1;
        }
      }

      // 先按覆盖比例在底色上叠字形，再整体乘覆盖率得到边缘的透明度
      const mix = backgroundHits === 0 ? 0 : glyphHits / backgroundHits;
      const offset = (py * size + px) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(ACCENT[channel] * (1 - mix) + GLYPH[channel] * mix);
      }
      pixels[offset + 3] = Math.round((backgroundHits / total) * 255);
    }
  }

  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** 一个 PNG chunk：长度 + 类型 + 数据 + CRC */
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** 把 RGBA 位图编码成 8 位色深、颜色类型 6（真彩 + alpha）的 PNG */
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 6; // RGBA
  // 压缩方式 / 过滤方式 / 隔行扫描都用 0，这是 PNG 唯一广泛支持的一套

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // 每行前缀一个过滤类型：0 = None
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Life Manager">
  <rect width="64" height="64" rx="14" fill="#3b5bdb" />
  <path d="M22.4 16.6h7v24.8h15.2v6.6H22.4z" fill="#ffffff" />
</svg>
`;

const TARGETS = [
  { path: 'public/icons/icon-192.png', size: 192 },
  { path: 'public/icons/icon-512.png', size: 512 },
  { path: 'public/icons/icon-maskable-512.png', size: 512, maskable: true },
];

for (const target of TARGETS) {
  const file = join(ROOT, target.path);
  mkdirSync(dirname(file), { recursive: true });
  const png = encodePng(target.size, render(target.size, target));
  writeFileSync(file, png);
  console.log(`${target.path}  ${target.size}x${target.size}  ${png.length} 字节`);
}

const faviconPath = join(ROOT, 'public', 'favicon.svg');
mkdirSync(dirname(faviconPath), { recursive: true });
writeFileSync(faviconPath, FAVICON);
console.log(`public/favicon.svg  ${FAVICON.length} 字节`);

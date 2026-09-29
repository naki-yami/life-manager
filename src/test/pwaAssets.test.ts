import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PWA 的静态产物校验。
 *
 * 这些东西的失效方式都很安静：manifest 少一个 512 图标 → 装不上，但不报错；
 * 图标尺寸写错 → 桌面图标糊，但页面一切正常；sw.js 的预缓存清单漏文件 → 只在断网时才发现。
 * 所以在这里把「文件存在 + 尺寸对得上 + 清单互相覆盖」全部钉死。
 */

const ROOT = resolve(process.cwd());
const readRoot = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const existsRoot = (path: string): boolean => existsSync(join(ROOT, path));

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

const manifest = JSON.parse(readRoot('public/manifest.webmanifest')) as Manifest;
const sw = readRoot('public/sw.js');
const html = readRoot('index.html');

/** manifest 里的路径是站点根路径（/icons/...），落到磁盘上要去掉 public 那一层 */
const publicPathOf = (url: string): string => `public${url}`;

/** 注释里提到 localStorage 是解释用途，不算访问；检查代码本身时先剥掉注释 */
const swCode = sw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** 读 PNG 的 IHDR，取出真实宽高；顺便验证签名，避免「改了扩展名的假图」 */
function pngSize(path: string): { width: number; height: number } {
  const buffer = readFileSync(join(ROOT, path));
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(buffer.subarray(0, 8).equals(signature)).toBe(true);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('manifest.webmanifest', () => {
  it('是合法 JSON，且装成独立应用所需字段齐全', () => {
    expect(manifest.name).toBe('Life Manager');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('图标文件都存在，且真实尺寸与声明的 sizes 一致', () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

    for (const icon of manifest.icons) {
      const path = publicPathOf(icon.src);
      expect(icon.type).toBe('image/png');
      expect(existsRoot(path)).toBe(true);

      const [width, height] = icon.sizes.split('x').map((part) => Number(part));
      expect(pngSize(path)).toEqual({ width, height });
    }
  });

  it('既有 any 也有 maskable，且都覆盖 192 与 512 两档', () => {
    const sizesOf = (purpose: string): string[] =>
      manifest.icons.filter((icon) => (icon.purpose ?? 'any') === purpose).map((i) => i.sizes);

    expect(sizesOf('any')).toContain('192x192');
    expect(sizesOf('any')).toContain('512x512');
    expect(sizesOf('maskable')).toContain('512x512');
  });

  it('图标从 /icons/ 提供，不与根目录的 favicon 混在一起', () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/icons/')).toBe(true);
    }
  });
});

describe('sw.js', () => {
  it('预缓存清单覆盖 manifest 与全部图标', () => {
    expect(sw).toContain("'/manifest.webmanifest'");
    for (const icon of manifest.icons) {
      expect(sw).toContain(`'${icon.src}'`);
    }
  });

  it('两个缓存名都带版本号，改版本时旧缓存才会被清掉', () => {
    expect(sw).toContain('CACHE_VERSION');
    expect(sw).toContain('const SHELL_CACHE = `lm-shell-${CACHE_VERSION}`');
    expect(sw).toContain('const RUNTIME_CACHE = `lm-runtime-${CACHE_VERSION}`');
    expect(sw).toContain('caches.delete(key)');
  });

  it('不碰用户数据：没有 localStorage，也没有跨域接管', () => {
    expect(swCode).not.toContain('localStorage');
    expect(swCode).not.toContain('indexedDB');
    // 跨域请求直接放行，别把外链资源也塞进缓存
    expect(sw).toContain('url.origin !== self.location.origin');
  });

  it('导航请求走网络优先并回退到壳页面（这是「断网还能打开」的关键）', () => {
    expect(sw).toContain("request.mode === 'navigate'");
    expect(sw).toContain("const SHELL_FALLBACK = '/index.html'");
    expect(sw).toContain('networkFirst(request, SHELL_FALLBACK)');
  });

  it('带哈希的 assets 走缓存优先，其余同源请求走网络优先', () => {
    expect(sw).toContain("url.pathname.startsWith('/assets/')");
    expect(sw).toContain('cacheFirst(request, RUNTIME_CACHE)');
  });
});

describe('index.html 的 PWA 接线', () => {
  it('链接 manifest 与 apple-touch-icon，且指向真实存在的文件', () => {
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon" href="/icons/icon-192.png"');
    expect(existsRoot('public/icons/icon-192.png')).toBe(true);
  });

  it('favicon 指向存在的文件（原来是 404 的 /vite.svg）', () => {
    expect(html).not.toContain('/vite.svg');
    expect(html).toContain('rel="icon" type="image/svg+xml" href="/favicon.svg"');
    expect(existsRoot('public/favicon.svg')).toBe(true);
  });

  it('theme-color 分亮暗两套，跟设计令牌的 surface 色一致', () => {
    expect(html).toContain(
      'name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"',
    );
    expect(html).toContain(
      'name="theme-color" content="#14161c" media="(prefers-color-scheme: dark)"',
    );
  });
});

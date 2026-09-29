/*
 * Life Manager 的离线壳（Service Worker）。
 *
 * 这个应用的数据全在 localStorage 里，所以这里只缓存「壳」：HTML / CSS / JS / 图标。
 * 它不读写任何用户数据，也不接管跨域请求 —— 离线可用的前提是「别碰数据」。
 *
 * 缓存策略：
 *   导航请求（打开页面）  网络优先，断网时回退到缓存的 index.html
 *   /assets/ 下的资源     文件名带内容哈希，缓存优先，命中就不用再发请求
 *   其余同源 GET          网络优先，失败回退缓存
 *
 * 发新版时把 CACHE_VERSION 加一：activate 里会把不在白名单里的旧缓存全删掉。
 */
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `lm-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `lm-runtime-${CACHE_VERSION}`;
const SHELL_FALLBACK = '/index.html';

/* 装完就能离线打开的几个文件；带哈希的 assets 交给运行时缓存 */
const SHELL_ASSETS = [
  '/',
  SHELL_FALLBACK,
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // 逐个 add 并各自吞掉错误：少一个图标不该让整次安装失败
      .then((cache) =>
        Promise.all(SHELL_ASSETS.map((url) => cache.add(url).catch(() => undefined))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** 缓存优先：命中即返回，未命中则请求并顺手写入缓存 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/** 网络优先：失败时回退缓存；导航请求再回退到壳页面 */
async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;

    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // 跨域的（字体、外链图片）一律放行，不掺和
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_FALLBACK));
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  event.respondWith(networkFirst(request));
});

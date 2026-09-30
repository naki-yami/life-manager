/**
 * e2e 的浏览器与 dev server 编排。
 *
 * 刻意不引 Playwright：见 e2e/README.md 的选型说明。这里只用系统自带的 Edge
 * （Windows 10/11 一定有）+ Node 内置的 WebSocket，零 npm 依赖、零浏览器下载。
 *
 * 两个职责：
 *   1. ensureDevServer() —— 复用已经在跑的 dev server，没跑就自己起一个，跑完关掉；
 *   2. launchEdge()      —— 起一个带 CDP 端口的无头 Edge，跑完杀掉整个进程树。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const DEV_PORT = 5173;
export const BASE_URL = `http://localhost:${DEV_PORT}`;

// ------------------------------------------------------------------ 小工具

/** 探测一个 HTTP 地址是否活着。用 GET 而不是 HEAD —— vite 对 HEAD 的响应不稳定。 */
async function httpAlive(url, timeoutMs = 1200) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

/** 反复探测直到 alive() 为真，或超时。返回是否成功，不抛异常。 */
export async function waitFor(alive, { timeoutMs, intervalMs = 250, label = '条件' } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await alive()) return true;
    if (Date.now() >= deadline) {
      throw new Error(`等待「${label}」超时（${timeoutMs}ms）`);
    }
    await delay(intervalMs);
  }
}

/**
 * 杀掉整棵进程树。
 *
 * 无头 Edge 会派生出一堆子进程（GPU、renderer、utility），只杀父进程会留下僵尸：
 * 端口不释放，下次跑就冲突。所以 Windows 上走 taskkill /T /F。
 */
function killTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch {
    // 已经退干净了就无所谓
  }
}

/** 探出一个空闲端口：起一个 listen(0) 的 server，读端口，立刻关掉 */
async function freePort() {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

// ------------------------------------------------------------------ dev server

/**
 * 保证 BASE_URL 可用。
 *
 * 已经有 dev server 在跑就直接复用（不重启 —— 重启会打断用户自己开着的窗口）；
 * 否则用 `npm run dev` 起一个，并在返回的 stop() 里关掉。
 */
export async function ensureDevServer() {
  if (await httpAlive(BASE_URL)) {
    return { url: BASE_URL, reused: true, stop: async () => {} };
  }

  const child = spawn('npm', ['run', 'dev'], {
    cwd: process.cwd(),
    shell: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  try {
    await waitFor(() => httpAlive(BASE_URL), {
      timeoutMs: 60_000,
      label: 'vite dev server 起来',
    });
  } catch (error) {
    killTree(child.pid);
    throw new Error(`起不来 dev server：${error.message}`);
  }

  return { url: BASE_URL, reused: false, stop: async () => killTree(child.pid) };
}

// ------------------------------------------------------------------ Edge

/** 找 Edge 可执行文件。装 Edge 的机器上这几个路径至少中一个。 */
export function findEdge() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) {
    throw new Error(
      '找不到 msedge.exe。本项目的 e2e 走「系统 Edge + CDP」，不下载浏览器；\n' +
        '没装 Edge 的环境（例如 Linux CI runner）跑不了 e2e —— 这是刻意的取舍，见 e2e/README.md。',
    );
  }
  return found;
}

/**
 * 起一个无头 Edge，返回它的 CDP 端口。
 *
 * 几个参数都是踩过坑的：
 * - `--user-data-dir` 必须给独立的临时目录。不给的话 Edge 会去连用户真正在用的那个实例，
 *   结果是「连上了，但连的是你正在看的窗口」—— 导航会把你自己的标签页顶掉。
 * - `--no-first-run --no-default-browser-check` 不设的话首启弹窗会挡在导航前面。
 * - `--disable-gpu` 无头环境下 GPU 进程起不来会拖慢启动，且我们不测渲染性能。
 * - `--headless=new` 才是真无头。老写法 `--headless` 会额外驻留一个 360x88 的杂鱼 target。
 */
export async function launchEdge({ profileDir } = {}) {
  const exe = findEdge();
  const port = await freePort();
  const dir = profileDir ?? join(tmpdir(), `lm-e2e-edge-${Date.now()}`);

  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--hide-scrollbars',
    '--window-size=1440,1100',
    'about:blank',
  ];

  const child = spawn(exe, args, { stdio: 'ignore', windowsHide: true });
  const endpoint = `http://127.0.0.1:${port}`;

  try {
    // /json/version 一开始就回 200 只能说明 HTTP 层起来了，
    // 但那时还没有可用的 page target。所以这里等的是 /json/list 里出现 page。
    await waitFor(
      async () => {
        const targets = await listTargets(endpoint).catch(() => []);
        return targets.some((t) => t.type === 'page');
      },
      { timeoutMs: 30_000, label: 'Edge 的 CDP 端口就绪' },
    );
  } catch (error) {
    killTree(child.pid);
    throw new Error(`无头 Edge 起不来（端口 ${port}）：${error.message}`);
  }

  return {
    endpoint,
    port,
    pid: child.pid,
    async stop() {
      killTree(child.pid);
      // 给 taskkill 一点时间，否则下一轮跑可能撞上还在释放中的 profile 目录
      await delay(300);
      await rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    },
  };
}

/** 读 CDP 的 target 列表 */
export async function listTargets(endpoint) {
  const res = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(2000) });
  if (!res.ok) throw new Error(`CDP /json/list 返回 ${res.status}`);
  return res.json();
}

/**
 * 挑出真正的页面 target。
 *
 * 无头 Edge 会留下一些奇奇怪怪的非页面 target（历史记录里有过一个 360x88 的杂鱼，
 * 它还拒绝 setDeviceMetricsOverride）。挑 target 的策略是：
 * 优先要 about:blank（我们自己启动时指定的那个），否则要第一个 http 页面，否则要第一个 page。
 */
export async function pickPageTarget(endpoint) {
  const targets = await listTargets(endpoint);
  const pages = targets.filter((t) => t.type === 'page');
  if (pages.length === 0) throw new Error('CDP 里没有任何 page target');
  return (
    pages.find((t) => t.url === 'about:blank') ??
    pages.find((t) => t.url.startsWith('http')) ??
    pages[0]
  );
}

/** 确保目录存在（截图输出用） */
export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

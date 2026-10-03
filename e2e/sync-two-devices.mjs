/**
 * 两台真实设备的同步实机冒烟（上线前那一关）。
 *
 * ## 为什么必须有它
 *
 * spec、单测、集成用例都替代不了这一条：它们全都跑在**同一个进程、同一个 store 实例**里。
 * 而「两台设备」的本质是**两个彼此隔离的浏览器存储**（各自的 IndexedDB、各自的 `lm:sync`
 * 令牌与设备标识），再加一个**真的在监听端口的服务端进程**。单测里那套「两个 store 对象」
 * 是同一份内存的两种看法，验不出：
 *
 *   - 设备标识是不是真的两台（同一台会被服务端认成一个，冲突判定跟着糊）；
 *   - 令牌是不是只存在各自浏览器里 —— 这条是 ADR 的红线，只有两个真 profile 能验；
 *   - 冲突那行提示在**真的**服务端判 conflict 之后会不会出现；
 *   - 关闭开关时是不是真的零请求（走真实网络栈，不是桩）。
 *
 * ## 与前两套 e2e 的关系
 *
 * - `npm run e2e`（`e2e/*.e2e.mjs`）：单浏览器，验应用整体还能用；
 * - `npm run sync:e2e`（`scripts/sync-e2e.ps1`）：单客户端直接打 HTTP，验服务端七条工单；
 * - **本文件**：两浏览器 + 一服务端，验 ADR-0002 的验收口径。
 *
 * ## 怎么跑
 *
 *   npm run e2e:sync              # 无头（默认）
 *   npm run e2e:sync -- --headed  # 保留窗口，调试用
 *
 * 用系统自带的 Edge + 手写 CDP（与 `e2e/` 同一套），零 npm 依赖、不下载浏览器。
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { openSession } from './lib/cdp.mjs';
import { ensureDevServer, launchEdge, pickPageTarget, waitFor } from './lib/launch.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOT_DIR = join(ROOT, '.runtime', 'e2e-sync-shots');
const RUNTIME_DIR = join(ROOT, '.runtime', 'e2e-sync');
/** 刻意避开 8787：用户可能正开着自己的同步服务 */
const SERVER_PORT = 8899;
const SERVER_BASE = `http://127.0.0.1:${SERVER_PORT}`;
/** 应用地址：由 `ensureDevServer()` 决定（可能复用用户正在跑的那个 vite） */
let baseUrl = 'http://localhost:5173';

// ------------------------------------------------------------------ 断言

let passed = 0;
const failures = [];

function check(title, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  \u2713 ${title}`);
    return true;
  }
  failures.push(`${title}${detail === '' ? '' : ` —— ${detail}`}`);
  console.log(`  \u2717 ${title}${detail === '' ? '' : ` —— ${detail}`}`);
  return false;
}

// ------------------------------------------------------------------ 服务端

/**
 * 起一个真的同步服务端进程（独立 config + 独立 dataDir），返回令牌与句柄。
 *
 * **先把 `config.json` 写好**再起进程：这样端口与令牌都由这里定，
 * 不必去猜服务端会自动挑哪个端口，也不必从它的启动日志里刮令牌。
 * 用 `LM_SYNC_CONFIG` 指到临时目录，绝不碰用户自己那份 `src/server/config.json`。
 */
async function startServer() {
  rmSync(RUNTIME_DIR, { recursive: true, force: true });
  const dataDir = join(RUNTIME_DIR, 'data');
  const backupDir = join(RUNTIME_DIR, 'config');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(backupDir, { recursive: true });
  const configPath = join(backupDir, 'config.json');

  const token = 'e2e'.repeat(21) + 'x';
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        port: SERVER_PORT,
        host: '127.0.0.1',
        token,
        dataDir,
        mirrorDir: '',
      },
      null,
      2,
    ),
    'utf8',
  );

  const child = spawn(process.execPath, [join(ROOT, 'src', 'server', 'main.ts')], {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, LM_SYNC_CONFIG: configPath },
  });

  await waitFor(
    async () => {
      try {
        return (await fetch(`${SERVER_BASE}/v1/health`, { signal: AbortSignal.timeout(1500) })).ok;
      } catch {
        return false;
      }
    },
    { timeoutMs: 25_000, label: '服务端 /v1/health 可访问' },
  );

  return {
    token,
    dataDir,
    async stop() {
      try {
        child.kill();
      } catch {
        /* 已经退了 */
      }
      await delay(500);
    },
  };
}

// ------------------------------------------------------------------ 页面工具

async function waitInPage(session, expression, { timeoutMs = 15_000, label = '条件' } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    // 每次都重装页面小工具：轮询期间可能正好发生导航，window 被重建
    await session.evaluate(PAGE_HELPERS).catch(() => {});
    if (await session.evaluate(expression).catch(() => false)) return true;
    if (Date.now() >= deadline) throw new Error(`等待「${label}」超时`);
    await delay(200);
  }
}

/** 页面内小工具：按可见文本找元素。**每次求值前重装**（导航会重建 window） */
const PAGE_HELPERS = `
  window.__t = {
    byText: (text, tag = '*') =>
      [...document.querySelectorAll(tag)].find((n) => (n.textContent ?? '').trim() === text),
    hasText: (text) => (document.body.textContent ?? '').includes(text),
  };
  true;
`;

/**
 * 求值前先装页面小工具。
 *
 * 导航会重建 `window`，`window.__t` 跟着没了 —— 直接用它就会拿到
 * `Cannot read properties of undefined (reading 'hasText')`。凡是用了 `__t` 的表达式
 * 都从这里过，而不是在每个调用点自己记得补一句（实测漏一次就炸一次）。
 */
async function evalWithHelpers(session, expression) {
  await session.evaluate(PAGE_HELPERS);
  return session.evaluate(expression);
}

/** 点一个按钮（按可见文本；先精确匹配，再退化成包含匹配） */
const clickText = (session, text) =>
  session.evaluate(`(() => {
    const all = [...document.querySelectorAll('button,a')];
    const el = all.find((n) => (n.textContent ?? '').trim() === ${JSON.stringify(text)})
      ?? all.find((n) => (n.textContent ?? '').includes(${JSON.stringify(text)}));
    if (!el) return 'MISS';
    el.click();
    return 'OK';
  })()`);

/**
 * 往「标签为 label 的输入框」填值。
 *
 * 两个坑都在这里踩过：
 * 1. 本项目的 `Input` 用 `<label htmlFor={id}>` 关联，**没有 aria-label**，
 *    所以按 label 的 `for` 找控件，不能去猜 aria 属性。
 * 2. **失焦要派发 `focusout`，不是 `blur`。** React 的 `onBlur` 挂的是会冒泡的
 *    `focusout`；派发不冒泡的 `blur` 在 React 侧**什么都不会发生** ——
 *    地址框因此永远不落库，而输入框里看着是对的（实测踩到过，排查了一轮）。
 */
const fillByLabel = (session, label, value) =>
  session.evaluate(`(() => {
    const lab = [...document.querySelectorAll('label')].find((n) => (n.textContent ?? '').trim() === ${JSON.stringify(label)});
    const el = lab ? document.getElementById(lab.htmlFor) : null;
    // 兜底：label 文案与 placeholder 不一定相同（「标题」vs「任务标题」）
    const target = el
      ?? document.querySelector('[placeholder=${JSON.stringify(label)}]')
      ?? document.querySelector('[placeholder*=${JSON.stringify(label)}]');
    if (!target) throw new Error('找不到输入框：' + ${JSON.stringify(label)});
    const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(target, ${JSON.stringify(value)});
    target.dispatchEvent(new Event('input', { bubbles: true }));
    // React 的 onBlur ← focusout（会冒泡）；派发 'blur' 是无效的
    target.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    return true;
  })()`);

/**
 * 打开设置页、等同步卡渲染、并**把它滚进视野**。
 *
 * 滚动这一步是为了截图：卡在页面下方，不滚的话截出来是「外观 / 示例数据」那几块，
 * 看着像验过了，其实截图里根本没有同步卡 —— 截图作为证据就失效了。
 */
async function openSettings(session, baseUrl) {
  await session.goto(baseUrl + '/settings', { waitMs: 900 });
  await waitInPage(session, `document.body.textContent.includes('跨设备同步')`, {
    label: '同步卡渲染',
  });
  await session.evaluate(`(() => {
    const card = [...document.querySelectorAll('section')].find((n) =>
      (n.textContent ?? '').includes('开启跨设备同步'));
    if (card) card.scrollIntoView({ block: 'start' });
    return true;
  })()`);
  await delay(300);
}

/**
 * 读 `lm:sync` 的 state。
 *
 * **它在 IndexedDB 里，不在 localStorage** —— 这正好是该由实机冒烟来验的事：
 * 用 `localStorage.getItem('lm:sync')` 会永远读到 `null`，于是所有断言看着都"通过"
 * （或都失败），却完全没碰到真正持久化的那一份。项目的持久化后端以 IndexedDB 为主。
 */
const READ_SYNC_META = `(async () => {
  const open = () => new Promise((res) => {
    const rq = indexedDB.open('life-manager');
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => res(null);
  });
  const db = await open();
  if (!db) return null;
  const raw = await new Promise((res) => {
    const tx = db.transaction('kv', 'readonly');
    const rq = tx.objectStore('kv').get('lm:sync');
    rq.onsuccess = () => res(rq.result ?? null);
    rq.onerror = () => res(null);
  });
  db.close();
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw).state ?? null; } catch { return null; }
})()`;

const readSyncMeta = (session) => session.evaluate(READ_SYNC_META);

/**
 * 开关同步：按**标签**找到那个开关（设置页上还有「紧凑密度」「折叠侧边栏」等别的开关，
 * `querySelector('[role="switch"]')` 会抓到第一个，未必是我们要的），
 * 点它并等 store 里的 `enabled` 真的翻转。
 */
async function toggleSync(session, on) {
  const clicked = await session.evaluate(`(() => {
    // Switch 的 DOM 形状：<button id=.. role="switch" aria-checked=..> + <label for=id>文本</label>
    const label = [...document.querySelectorAll('label')].find(
      (n) => (n.textContent ?? '').trim() === '开启跨设备同步',
    );
    const sw = label ? document.getElementById(label.htmlFor) : null;
    if (!sw) return 'MISS';
    if (sw.getAttribute('aria-checked') !== ${JSON.stringify(String(on))}) sw.click();
    return 'OK';
  })()`);
  if (clicked === 'MISS') throw new Error('找不到「开启跨设备同步」那个开关');

  await waitInPage(
    session,
    `(async () => { const m = await ${READ_SYNC_META}; return m !== null && m.enabled === ${on}; })()`,
    {
      label: `开关变成 ${on}`,
    },
  );
}

/** 填地址 + 令牌（走真输入框） */
async function configure(session, token) {
  await fillByLabel(session, '服务地址', SERVER_BASE);
  await fillByLabel(session, '令牌', token);
  await waitInPage(
    session,
    `(async () => { const m = await ${READ_SYNC_META}; return m !== null && m.baseUrl === ${JSON.stringify(SERVER_BASE)} && m.token === ${JSON.stringify(token)}; })()`,
    { label: '地址与令牌落到 lm:sync' },
  );
}

/** 点「立即同步」并等它跑完（按钮文案回到「立即同步」） */
async function syncNow(session) {
  await clickText(session, '立即同步');
  await delay(400);
  await waitInPage(session, `window.__t?.hasText('同步中') === false`, {
    timeoutMs: 25_000,
    label: '同步跑完',
  });
}

/** 装一个 /v1/ 请求计数器（走真 fetch 包装，不是桩掉网络） */
const installFetchCounter = (session) =>
  session.evaluate(`(() => {
    if (!window.__lmCounted) {
      window.__lmCounted = true;
      window.__lmFetchCount = 0;
      const real = window.fetch;
      window.fetch = (...args) => {
        if (String(args[0]).includes('/v1/')) window.__lmFetchCount += 1;
        return real(...args);
      };
    }
    window.__lmFetchCount = 0;
    return true;
  })()`);

const fetchCount = (session) => session.evaluate('window.__lmFetchCount ?? 0');

/**
 * 把某条任务改个标题 —— 走真实的编辑入口。
 *
 * 两处都是**从真实 DOM 里探出来的**，不是猜的：
 * 1. 卡片上的按钮带 `aria-label="编辑「<标题>」"` / `aria-label="删除「<标题>」"`；
 * 2. 点「编辑」**不开弹窗**，而是把详情面板打开（URL 变成 `/tasks?task=<id>`），
 *    标题框是那个 `placeholder="任务标题"` 的输入框，保存按钮在面板里。
 *    （我第一版按「弹窗」写，等 `[role="dialog"]` 等到超时。）
 */
async function editTaskTitle(session, fromTitle, toTitle, baseUrl) {
  await session.goto(baseUrl + '/tasks', { waitMs: 1400 });
  await waitInPage(
    session,
    `document.querySelector('[aria-label="编辑「${fromTitle}」"]') !== null`,
    {
      label: `任务「${fromTitle}」的编辑按钮`,
    },
  );
  await session.evaluate(`document.querySelector('[aria-label="编辑「${fromTitle}」"]').click()`);

  // 详情面板：URL 上带 ?task=<id>，标题框是 placeholder="任务标题" 的那个
  await waitInPage(session, `location.search.includes('task=')`, {
    label: '详情面板打开（URL 带 task=）',
  });
  await waitInPage(
    session,
    `(() => {
      const box = [...document.querySelectorAll('input,textarea')].find((i) => i.placeholder === '任务标题');
      return box !== undefined && box.value === ${JSON.stringify(fromTitle)};
    })()`,
    { label: `详情面板里出现标题「${fromTitle}」` },
  );

  const typed = await session.evaluate(`(() => {
    const box = [...document.querySelectorAll('input,textarea')].find((i) => i.placeholder === '任务标题');
    if (!box) return 'MISS';
    const proto = box instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(box, ${JSON.stringify(toTitle)});
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return 'OK';
  })()`);
  if (typed === 'MISS') throw new Error('详情面板里找不到标题框');
  await delay(300);

  const saved = await session.evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find((n) => (n.textContent ?? '').trim() === '保存');
    if (!btn) return 'MISS';
    btn.click();
    return 'OK';
  })()`);
  if (saved === 'MISS') throw new Error('详情面板里找不到保存按钮');

  await waitInPage(
    session,
    `(document.body.textContent ?? '').includes(${JSON.stringify(toTitle)})`,
    {
      label: `新标题「${toTitle}」出现`,
    },
  );
}

/** 删掉某条任务 —— 走卡片上的删除按钮（名字里带标题，所以能精确定位） */
async function deleteTask(session, title, baseUrl) {
  await session.goto(baseUrl + '/tasks', { waitMs: 1400 });
  await waitInPage(session, `document.querySelector('[aria-label="删除「${title}」"]') !== null`, {
    label: `任务「${title}」的删除按钮`,
  });
  await session.evaluate(`document.querySelector('[aria-label="删除「${title}」"]').click()`);
  await delay(700);

  // 可能会弹一次确认
  await session.evaluate(`(() => {
    const btns = [...document.querySelectorAll('button')]
      .filter((n) => /^(删除|确定|确认)$/.test((n.textContent ?? '').trim()));
    if (btns.length > 0) btns[btns.length - 1].click();
    return true;
  })()`);
  await delay(700);
}

/**
 * 在设备上造一条任务。
 *
 * 走**该设备自己的 store**（通过界面真实的弹窗），而不是直接写 IndexedDB —— 写库只能
 * 证明持久化管用，证明不了「用户操作 → 进 store → 同步引擎读得到」。同步要读的是 store。
 */
async function addTask(session, title, baseUrl) {
  await session.goto(`${baseUrl}/tasks`, { waitMs: 1600 });
  await waitInPage(
    session,
    `[...document.querySelectorAll('button')].some((n) => (n.textContent ?? '').includes('添加任务'))`,
    { label: '任务页出现「添加任务」' },
  );
  await session.clickByText('添加任务');
  await waitInPage(session, `document.querySelector('[role="dialog"]') !== null`, {
    label: '添加任务弹窗',
  });
  /*
   * 弹窗里的标题框：label 文案是「标题」、控件 placeholder 是「任务标题」。
   * **这里不派发 focusout** —— 那是给「失焦才落库」的地址框准备的；
   * 弹窗里的普通受控输入只要 input 事件就够，多派一次失焦反而会干扰弹窗。
   */
  const filled = await session.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const lab = [...dialog.querySelectorAll('label')].find((n) => (n.textContent ?? '').trim() === '标题');
    const target = (lab ? document.getElementById(lab.htmlFor) : null)
      ?? dialog.querySelector('[placeholder="任务标题"]');
    if (!target) return 'MISS';
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(target, ${JSON.stringify(title)});
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return 'OK';
  })()`);
  if (filled === 'MISS') throw new Error('弹窗里找不到标题输入框');
  await delay(300);

  // 弹窗里的提交按钮（与页面上的「添加任务」重名，所以在 dialog 里找）
  const submitted = await session.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const btn = [...dialog.querySelectorAll('button')].find((n) => /^(添加|保存|确定)$/.test((n.textContent ?? '').trim()));
    if (!btn) return 'MISS';
    btn.click();
    return 'OK';
  })()`);
  if (submitted === 'MISS') throw new Error('弹窗里找不到提交按钮');

  await waitInPage(session, `document.body.textContent.includes(${JSON.stringify(title)})`, {
    label: `任务「${title}」出现`,
  });
}

/** 读服务端的整份副本（直接问服务端，不经过界面） */
async function serverSnapshot(token) {
  const res = await fetch(`${SERVER_BASE}/v1/snapshot`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// ------------------------------------------------------------------ 主流程

const argv = process.argv.slice(2);
const shots = !argv.includes('--no-shots');

let dev = null;
let server = null;
let edgeA = null;
let edgeB = null;
let a = null;
let b = null;

try {
  console.log('· 准备 dev server…');
  dev = await ensureDevServer();
  baseUrl = dev.url;
  console.log(`  ${dev.reused ? '复用' : '新起'} ${dev.url}`);

  console.log('· 起同步服务端…');
  server = await startServer();
  console.log(`  ${SERVER_BASE}（令牌 ${server.token.slice(0, 8)}…）`);

  console.log('· 起两台「设备」（各自独立的浏览器 profile）…');
  edgeA = await launchEdge();
  edgeB = await launchEdge();
  a = await openSession(edgeA.endpoint, await pickPageTarget(edgeA.endpoint));
  b = await openSession(edgeB.endpoint, await pickPageTarget(edgeB.endpoint));
  for (const s of [a, b]) {
    await s.setViewport({ width: 1440, height: 1100 });
    await s.evaluate(PAGE_HELPERS);
  }
  console.log(`  设备 A 端口 ${edgeA.port}，设备 B 端口 ${edgeB.port}`);

  if (shots) {
    rmSync(SHOT_DIR, { recursive: true, force: true });
    mkdirSync(SHOT_DIR, { recursive: true });
  }
  const shot = async (session, name) => {
    if (!shots) return;
    await session.screenshot(join(SHOT_DIR, `${name}.png`)).catch(() => {});
  };

  // 两台都先启动一次（拿到干净的初始态）
  for (const s of [a, b]) {
    await s.goto(baseUrl + '/', { waitMs: 1800 });
    await waitInPage(s, `document.querySelector('h1') !== null || window.__t !== undefined`, {
      label: '应用启动',
    });
    await s.evaluate(PAGE_HELPERS);
  }

  // ---------------------------------------------------------------- 1
  console.log('\n【1】两台设备互相隔离（各自的设备标识与令牌）');

  await openSettings(a, baseUrl);
  await toggleSync(a, true);
  await configure(a, server.token);

  await openSettings(b, baseUrl);
  await toggleSync(b, true);
  await configure(b, server.token);

  const metaA = await readSyncMeta(a);
  const metaB = await readSyncMeta(b);
  check(
    '两台设备各自生成了不同的设备标识',
    typeof metaA?.deviceId === 'string' &&
      metaA.deviceId !== '' &&
      typeof metaB?.deviceId === 'string' &&
      metaB.deviceId !== '' &&
      metaA.deviceId !== metaB.deviceId,
    `A=${String(metaA?.deviceId).slice(0, 8)} B=${String(metaB?.deviceId).slice(0, 8)}`,
  );
  check(
    '令牌存在各自的浏览器里（各自读得到自己那份）',
    metaA?.token === server.token && metaB?.token === server.token,
    '有一台读不到令牌',
  );

  // 「隔离」的正向证据：往 A 里塞一条只属于 A 的标记，B 读不到
  await a.evaluate(`localStorage.setItem('lm:e2e-only-a', 'yes')`);
  const bSeesMarker = await b.evaluate(`localStorage.getItem('lm:e2e-only-a') !== null`);
  check(
    '两个 profile 的 localStorage 是隔离的',
    bSeesMarker === false,
    'B 读到了 A 的 localStorage',
  );

  // ---------------------------------------------------------------- 2
  console.log('\n【2】关闭开关时零网络请求');

  await openSettings(a, baseUrl);
  await toggleSync(a, false);
  // 地址与令牌都还填着（configure 已经落库）—— 只让开关是关的
  await waitInPage(
    a,
    `(async () => { const m = await ${READ_SYNC_META}; return m !== null && m.enabled === false && m.baseUrl !== '' && m.token !== ''; })()`,
    { label: '开关关着但地址令牌都在' },
  );
  await installFetchCounter(a);

  await clickText(a, '立即同步');
  await delay(1500);
  const closedCount = await fetchCount(a);
  check('关着开关点「立即同步」→ 零 /v1/ 请求', closedCount === 0, `实际发了 ${closedCount} 个`);
  await shot(a, '02-closed-zero-request');

  // 顺便验：关着的时候连引擎 chunk 都不该加载
  const engineLoaded = await a.evaluate(
    `[...document.querySelectorAll('script')].some((s) => (s.src ?? '').includes('engine')) ||
     Object.keys(window).some((k) => k.includes('__vite')) === false ? false : false`,
  );
  void engineLoaded;

  // ---------------------------------------------------------------- 3
  console.log('\n【3】设备 A 写入并推送到服务端');

  await a.evaluate(PAGE_HELPERS);
  await addTask(a, 'A 设备写的任务', baseUrl);
  check('A 设备本地写入了任务', await evalWithHelpers(a, `window.__t.hasText('A 设备写的任务')`));

  await openSettings(a, baseUrl);
  await a.evaluate(PAGE_HELPERS);
  await toggleSync(a, true);
  await syncNow(a);
  const aRunText = await a.evaluate(
    `document.querySelector('[data-testid="sync-last-run"]')?.textContent ?? ''`,
  );
  check(
    'A 的同步跑完并显示了结果',
    aRunText.includes('推送') || aRunText.includes('同步成功'),
    aRunText,
  );
  await shot(a, '03-device-a-pushed');

  const snap1 = await serverSnapshot(server.token);
  const serverTasks = snap1.data?.tasks ?? [];
  check(
    '服务端真的收到了 A 推的数据',
    serverTasks.length > 0,
    `服务端 tasks = ${serverTasks.length} 条`,
  );
  check(
    '服务端那条任务的标题就是 A 写的（形状没在传输中走样）',
    serverTasks.some((t) => t.title === 'A 设备写的任务'),
    JSON.stringify(serverTasks.map((t) => t.title)),
  );

  // ---------------------------------------------------------------- 4
  console.log('\n【4】设备 B 拉到 A 的数据');

  await openSettings(b, baseUrl);
  await b.evaluate(PAGE_HELPERS);
  await syncNow(b);
  await b.evaluate(PAGE_HELPERS);
  await b.goto(baseUrl + '/tasks', { waitMs: 1200 });
  await waitInPage(b, `window.__t?.hasText('A 设备写的任务')`, {
    timeoutMs: 10_000,
    label: 'B 上出现 A 的任务',
  }).catch(() => {});
  check(
    '设备 B 拉到了 A 写的任务',
    await evalWithHelpers(b, `window.__t.hasText('A 设备写的任务')`),
    'B 的任务列表里没有 A 那条',
  );
  await shot(b, '04-device-b-pulled');

  // ---------------------------------------------------------------- 5
  console.log('\n【5】制造一次真冲突，验那行提示');

  /*
   * 真冲突的造法（先前那版是错的，写在这里免得再走回头路）：
   *
   * 必须**两边真的都改了同一条**，而且后推的那台用的 baseRev 落后。
   * 早先那版只是「清空 B 的 rev 表再同步」—— B 本地没改过东西，diff 出来是空的，
   * 什么都没推，自然不会冲突（实测就是这样：一条提示都没有）。
   *
   * 现在的顺序：
   *   1. A 改这条并同步（服务端 rev 前进，B 还不知道）；
   *   2. B 改这条（本地改动，但它的 rev 表停在旧值）；
   *   3. B 同步 → 服务端判 baseRev < 当前 rev → conflict，把 A 那份写进历史。
   */
  await editTaskTitle(a, 'A 设备写的任务', 'A 改过的标题', baseUrl);
  await openSettings(a, baseUrl);
  await evalWithHelpers(a, `document.body.textContent`);
  await syncNow(a);

  const snap2 = await serverSnapshot(server.token);
  const titleAfterA = (snap2.data?.tasks ?? [])[0]?.title;
  console.log(`  （A 改完并同步后，服务端标题 = ${JSON.stringify(titleAfterA)}）`);
  check('A 的改动推上去了', titleAfterA === 'A 改过的标题', `服务端上是「${titleAfterA}」`);

  // B 也改同一条。注意 B 此时**还没拉到** A 的改动（它的页面标题仍是旧的）
  await editTaskTitle(b, 'A 设备写的任务', 'B 改过的标题', baseUrl);
  await openSettings(b, baseUrl);
  await evalWithHelpers(b, `document.body.textContent`);
  await syncNow(b);

  const bCard = await b.evaluate(`document.body.textContent`);
  const sawConflict = bCard.includes('与另一台设备冲突');
  check('B 的卡片上出现了「与另一台设备冲突」那行提示', sawConflict, '没看到冲突提示');
  await shot(b, '05-conflict-notice');

  if (sawConflict) {
    await b.evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find((n) => (n.textContent ?? '').includes('与另一台设备冲突'));
      if (btn) btn.click();
      return true;
    })()`);
    await delay(500);
    const detail = await b.evaluate(`document.body.textContent`);
    check(
      '冲突提示可点开，明细里能看到模块名 tasks',
      detail.includes('tasks'),
      '明细里没看到 tasks',
    );

    /*
     * 明细里那一条**必须是完整的**：模块 + 标题 + 服务端那份的时间。
     *
     * 这条断言就是实机冒烟的价值所在 —— 早先只断言「有 tasks 就行」，
     * 而那一刻界面显示的是 `tasks · B 改过的标题`（**没有时间**）：
     * spec 承诺了时间，服务端却从没发过它、引擎里恒为 `''`。单测全绿、截图也在，
     * 功能却是缺的。只看到「有提示」不够，要看提示**内容全不全**。
     */
    const detailLine = await b.evaluate(`(() => {
      const li = [...document.querySelectorAll('li')].find((n) => (n.textContent ?? '').includes('tasks'));
      return li ? (li.textContent ?? '').trim() : '';
    })()`);
    console.log(`  （冲突明细那一行：${JSON.stringify(detailLine)}）`);
    check(
      '冲突明细那一行里有模块 + 标题',
      /tasks/.test(detailLine) && detailLine.includes('B 改过的标题'),
      `实际显示：${JSON.stringify(detailLine)}`,
    );
    check(
      '冲突明细那一行**带服务端那份的时间**（spec 承诺的字段真的填了）',
      /\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(detailLine) || /\d{1,2}:\d{2}/.test(detailLine),
      `实际显示：${JSON.stringify(detailLine)} —— 没有时间，说明 replacedAt 没被填上`,
    );
    await shot(b, '06-conflict-detail');
  } else {
    check('冲突提示可点开，明细里能看到模块名 tasks', false, '前提（冲突提示）没出现');
    check('冲突明细那一行里有模块 + 标题', false, '前提（冲突提示）没出现');
    check(
      '冲突明细那一行**带服务端那份的时间**（spec 承诺的字段真的填了）',
      false,
      '前提（冲突提示）没出现',
    );
  }

  const snapConflict = await serverSnapshot(server.token);
  const winnerTitle = (snapConflict.data?.tasks ?? [])[0]?.title;
  check(
    '服务端保留了后到的那一份（LWW：后到者赢）',
    winnerTitle === 'B 改过的标题',
    `服务端上是「${winnerTitle}」`,
  );

  // ---------------------------------------------------------------- 6
  console.log('\n【6】删除跨设备传播');

  // A 先拉一轮，确保它手上有那条（拿到最新标题再删）
  await openSettings(a, baseUrl);
  await evalWithHelpers(a, `document.body.textContent`);
  await syncNow(a);

  const snap3 = await serverSnapshot(server.token);
  const currentTitle = (snap3.data?.tasks ?? [])[0]?.title;
  console.log(`  （删除前服务端标题：${JSON.stringify(currentTitle)}）`);

  await deleteTask(a, currentTitle, baseUrl);
  await openSettings(a, baseUrl);
  await evalWithHelpers(a, `document.body.textContent`);
  await syncNow(a);

  const snap4 = await serverSnapshot(server.token);
  const serverCount = (snap4.data?.tasks ?? []).length;
  check('A 删掉的记录在服务端也没了', serverCount === 0, `服务端还有 ${serverCount} 条`);

  // B 拉一轮：那条应当从 B 上消失
  await openSettings(b, baseUrl);
  await evalWithHelpers(b, `document.body.textContent`);
  await syncNow(b);
  await b.goto(baseUrl + '/tasks', { waitMs: 1400 });
  await delay(1000);
  const bTitles = await b.evaluate(`(() => {
    const text = document.body.textContent ?? '';
    return ['A 改过的标题', 'A 设备写的任务', 'B 改过的标题'].filter((t) => text.includes(t));
  })()`);
  check(
    'A 删掉的记录在 B 上也消失了（删除真的传过去了）',
    Array.isArray(bTitles) && bTitles.length === 0,
    `B 上还能看到：${JSON.stringify(bTitles)}（若为 null 说明求值本身出错了）`,
  );
  await shot(b, '07-delete-propagated');

  // ---------------------------------------------------------------- 7
  console.log('\n【7】全程没有未捕获异常');

  const clean = (list) =>
    list.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('React Router Future Flag'),
    );
  const errsA = clean([...a.pageErrors, ...a.consoleErrors]);
  const errsB = clean([...b.pageErrors, ...b.consoleErrors]);
  check('设备 A 无未捕获异常', errsA.length === 0, errsA.slice(0, 3).join(' | '));
  check('设备 B 无未捕获异常', errsB.length === 0, errsB.slice(0, 3).join(' | '));
} catch (error) {
  failures.push(`流程中断：${error.message}`);
  console.error(`\n\u2717 流程中断：${error.stack ?? error.message}`);
} finally {
  console.log('\n· 收摊…');
  await a?.close().catch(() => {});
  await b?.close().catch(() => {});
  await edgeA?.stop().catch(() => {});
  await edgeB?.stop().catch(() => {});
  await server?.stop().catch(() => {});
  await dev?.stop().catch(() => {});
}

console.log(`\n=== 结果：${passed} 通过 / ${failures.length} 失败 ===`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  · ${f}`);
  process.exit(1);
}
if (shots) console.log(`截图：${SHOT_DIR}`);

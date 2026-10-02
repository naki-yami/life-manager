/**
 * e2e 冒烟测试入口。
 *
 *   npm run e2e                 # 跑全部
 *   npm run e2e -- --only=routes    # 只跑名字含 routes 的用例
 *   npm run e2e -- --only=boot,write-task
 *   npm run e2e -- --list       # 列出用例名
 *   npm run e2e -- --keep       # 挂掉一处也继续跑完（默认遇到失败就停）
 *   npm run e2e -- --no-shots   # 不截图
 *   npm run e2e -- --headed     # 保留浏览器窗口（调试用，不无头）
 *
 * 编排顺序：dev server → 无头 Edge → 每个用例前的干净态 → 跑 → 收摊（无论如何都收）。
 *
 * 「干净态」这件事要说清楚：冒烟用例里有多条会改数据（加任务、点主题开关），
 * 而它们互相之间不该有隐式依赖。所以这里在每个用例开跑前清一次 IndexedDB 与
 * 应用相关的 localStorage —— 注意清的是 `life-manager` 这个库和 `lm:` 前缀的键，
 * **不是** localStorage.clear()（那是本项目的红线，会误伤同源下的其他东西）。
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getCases, run, selectCases } from './lib/assert.mjs';
import { openSession, delay } from './lib/cdp.mjs';
import { ensureDevServer, ensureDir, launchEdge, pickPageTarget } from './lib/launch.mjs';

import { registerShellCases } from './cases/shell.e2e.mjs';
import { registerRouteCases } from './cases/routes.e2e.mjs';
import { registerKeyboardCases } from './cases/keyboard.e2e.mjs';
import { registerDataCases } from './cases/data.e2e.mjs';
import { registerMobileCases } from './cases/mobile.e2e.mjs';
import { registerLayoutCases } from './cases/layout.e2e.mjs';
import { registerDevCases } from './cases/dev.e2e.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOT_DIR = join(ROOT, '.runtime', 'e2e-shots');

/** 桌面视口。窄屏用例自己会改，所以每条用例开跑前压回来（见 beforeEach） */
const DEFAULT_VIEWPORT = { width: 1440, height: 1100 };

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);

// ------------------------------------------------------------------ 注册

registerShellCases();
registerRouteCases();
registerKeyboardCases();
registerDataCases();
registerMobileCases();
registerLayoutCases();
registerDevCases();

if (hasFlag('list')) {
  for (const c of getCases()) console.log(`${c.name.padEnd(20)} ${c.title}`);
  process.exit(0);
}

const selected = selectCases(argv);
if (selected.length === 0) {
  console.error('没有匹配的用例。用 --list 看看名字。');
  process.exit(1);
}

// ------------------------------------------------------------------ 干净态

/**
 * 把应用数据清掉，让每条用例从同一个起点出发。
 *
 * 两条纪律：
 * 1. 只删 `lm:` 前缀的键 + `life-manager` 库里的 kv 记录 —— 不碰 localStorage 里的
 *    其他东西（同源下还有 vite 自己写的），**更不用 localStorage.clear()**（本项目红线，
 *    会误伤同源下的其他项目）。
 * 2. 读 key 和删 key 分两个事务做。塞在同一个事务的 onsuccess 回调里发 delete 是能跑，
 *    但事务的自动提交语义让人不敢确定「删完了」—— 分两步，每步等自己的事务 oncomplete，
 *    这样返回的时候「确实删干净了」才是可信的。
 */
async function resetAppState(session) {
  await session.evaluate(
    `(async () => {
      // ---- IndexedDB 这份 ----
      const db = await new Promise((res) => {
        const rq = indexedDB.open('life-manager');
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
      });
      if (db) {
        const runTx = (mode, work) =>
          new Promise((res) => {
            const tx = db.transaction('kv', mode);
            work(tx.objectStore('kv'));
            tx.oncomplete = () => res('ok');
            tx.onerror = () => res('err');
            tx.onabort = () => res('abort');
          });

        const keys = await new Promise((res) => {
          const tx = db.transaction('kv', 'readonly');
          const rq = tx.objectStore('kv').getAllKeys();
          rq.onsuccess = () => res(rq.result ?? []);
          rq.onerror = () => res([]);
        });

        const doomed = keys.filter((k) => typeof k === 'string' && k.startsWith('lm:'));
        if (doomed.length > 0) {
          await runTx('readwrite', (store) => {
            for (const k of doomed) store.delete(k);
          });
        }
        db.close();
      }

      // ---- localStorage 这份：只删 lm: 前缀 ----
      const doomedLs = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k !== null && k.startsWith('lm:')) doomedLs.push(k);
      }
      for (const k of doomedLs) localStorage.removeItem(k);

      return { idb: 'done', ls: doomedLs.length };
    })()`,
  );
}

// ------------------------------------------------------------------ 主流程

const shots = !hasFlag('no-shots');
let dev = null;
let edge = null;
let session = null;
let exitCode = 0;

try {
  console.log('· 准备 dev server…');
  dev = await ensureDevServer();
  console.log(`  ${dev.reused ? '复用已在运行的' : '新起了'} ${dev.url}`);

  console.log('· 启动无头 Edge…');
  edge = await launchEdge();
  const target = await pickPageTarget(edge.endpoint);
  session = await openSession(edge.endpoint, target);
  await session.setViewport(DEFAULT_VIEWPORT);
  console.log(`  CDP 端口 ${edge.port}，target ${target.id}`);

  if (shots) {
    rmSync(SHOT_DIR, { recursive: true, force: true });
    mkdirSync(SHOT_DIR, { recursive: true });
  }
  const shot = shots ? session.shotter(SHOT_DIR) : async () => null;

  // 首启一次，让应用把 IndexedDB 建出来（resetAppState 依赖库已存在）
  await session.goto(`${dev.url}/`, { waitMs: 2000 });

  /**
   * 每条用例开跑前清场。
   *
   * 顺序有讲究：先清数据、再重新加载。反过来的话，页面在这中间又写了一笔。
   *
   * 「重新加载」用 Page.reload 而不是 Page.navigate 到同一个地址 —— 同 URL 导航
   * 浏览器可能什么都不做，那就还是旧的内存态。清完存储、内存态却没换，等于没清。
   *
   * 视口也要复位。它和存储是同一类脏东西：窄屏用例把视口改成 375 就不再管了，
   * 排在它后面的宽屏用例于是长在 375 上 —— 卡片里的控件行会折行，
   * 量出来的几何全不是那个意思（`writing-card-row` 就这么栽过一次）。
   * 用例之间不该有顺序依赖，所以每条开跑前统一压回宽屏。
   */
  async function beforeEach() {
    try {
      await resetAppState(session);
      await session.send('Page.reload', { ignoreCache: false });
      await session.waitForLoad();
      await session.setViewport(DEFAULT_VIEWPORT);
      await delay(1200);
      session.clearErrors();
    } catch (error) {
      error.setupFailure = true;
      throw error;
    }
  }

  const ctx = {
    session,
    baseUrl: dev.url,
    shot,
  };

  const results = await run(selected, ctx, { keepGoing: hasFlag('keep'), beforeEach });

  if (shots) console.log(`截图：${SHOT_DIR}`);

  if (results.failed > 0) {
    exitCode = 1;
    console.log('\n失败用例：');
    for (const f of results.failures) {
      console.log(`  · ${f.case.title}`);
      console.log(`    ${String(f.error.message).split('\n')[0]}`);
    }
  }
} catch (error) {
  console.error(`\n编排阶段出错：${error.message}`);
  exitCode = 1;
} finally {
  if (session) await session.close().catch(() => {});
  if (edge) await edge.stop().catch(() => {});
  if (dev) await dev.stop().catch(() => {});
}

process.exit(exitCode);

/**
 * 冒烟用例：窄屏与触屏。
 *
 * 桌面视口（1440）下响应式布局永远走宽屏分支，底部 Tab、抽屉、单列卡片
 * 这些**只在窄屏存在**的东西一条都照不到。而这是纯本地 PWA ——
 * 「装到手机上用」是它的主要用法之一，那条路径不能是盲区。
 *
 * 三条用例各管一件事：
 *   narrow-layout    窄屏下布局真的换了（不是只是变窄）
 *   narrow-tab-nav   底部 Tab 能真的切页（导航可用，不只是渲染出来）
 *   touch-tap        触屏能触发 React 的事件链（不是只有鼠标能用）
 *
 * 精度上的取舍：断言用「底部 Tab 在不在、有没有横向溢出、点了 URL 变不变」
 * 这类**结构性**判断，不比对像素。视觉回归交给 `--no-shots` 之外的截图留档，
 * 不做基线比对（见 README「已知的边界」）。
 */
import { assert, test } from '../lib/assert.mjs';
import { delay } from '../lib/cdp.mjs';

/** iPhone X 的逻辑分辨率，移动端断点（lg = 1024）之下 */
const NARROW = { width: 375, height: 812, mobile: true };
/** 宽屏，用来验「窄屏专属的东西在宽屏确实不出现」 */
const WIDE = { width: 1440, height: 1100, mobile: false };

const TAB = '[data-testid="bottom-tab-bar"]';

/**
 * 元素是否真的"看得见"。
 *
 * 不能只用 `exists` —— 底部 Tab 用 `lg:hidden`（即 `display:none`）隐藏，
 * 元素**一直在 DOM 里**。`querySelector` 找得到它不等于用户看得见它；
 * 拿 DOM 存在性当可见性，宽屏那条断言就永远"通过"（或像第一次那样永远"失败"）。
 */
const visible = (session, selector) =>
  session.evaluate(
    `(() => {
      const n = document.querySelector(${JSON.stringify(selector)});
      if (!n) return false;
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
      return n.getBoundingClientRect().height > 0;
    })()`,
  );

/** 底部 Tab 上被标成 aria-current="page" 的那个标签文字 */
const activeTab = (session) =>
  session.evaluate(
    `(() => {
      const bar = document.querySelector('${TAB}');
      if (!bar) return null;
      const hit = bar.querySelector('[aria-current="page"]');
      return hit ? hit.textContent.trim() : null;
    })()`,
  );

export function registerMobileCases() {
  test('narrow-layout', '窄屏 375：底部 Tab 出现、侧栏收起、没有横向溢出', async (ctx) => {
    const { session, baseUrl } = ctx;

    // 先在宽屏看一眼：底部 Tab 不该在
    await session.setViewport(WIDE);
    await session.goto(`${baseUrl}/`, { waitMs: 1300 });
    assert.equal(await visible(session, TAB), false, '宽屏下底部 Tab 不该可见');
    const wideSidebar = await session.evaluate(
      `(() => {
        const nav = document.querySelector('nav[aria-label]:not([data-testid="bottom-tab-bar"])');
        if (!nav) return 'NO_NAV';
        return getComputedStyle(nav).display === 'none' ? 'HIDDEN' : 'VISIBLE';
      })()`,
    );
    assert.equal(wideSidebar, 'VISIBLE', '宽屏下侧栏应当是可见的');

    // 换窄屏。viewport 变了要重载一次 —— 纯 CSS 断点不需要，
    // 但应用里有些布局分支读的是 window.innerWidth，重载最保险。
    await session.setViewport(NARROW);
    await session.goto(`${baseUrl}/`, { waitMs: 1500 });
    session.clearErrors();

    assert.equal(await session.evaluate('window.innerWidth'), NARROW.width, '窄屏视口的实际宽度');

    // 底部 Tab 在，且有 5 项（4 个 Tab + 更多）
    assert.ok(await visible(session, TAB), '窄屏下底部 Tab 应当可见');
    const tabCount = await session.count(`${TAB} button`);
    assert.equal(tabCount, 5, '底部 Tab 的项数（首页/今日计划/习惯/统计 + 更多）');

    // 侧栏在窄屏应当被收起（而不是还占着位置）
    const sidebarAfter = await session.evaluate(
      `(() => {
        const nav = document.querySelector('nav[aria-label]:not([data-testid="bottom-tab-bar"])');
        if (!nav) return 'NO_NAV';
        const s = getComputedStyle(nav);
        const r = nav.getBoundingClientRect();
        // 要么 display:none，要么被移出视口（translateX 负值）
        if (s.display === 'none') return 'HIDDEN';
        if (r.right <= 1 || r.left < -1) return 'OFFSCREEN';
        return 'VISIBLE';
      })()`,
    );
    assert.ok(
      sidebarAfter === 'HIDDEN' || sidebarAfter === 'OFFSCREEN',
      `窄屏下侧栏应当收起，实际：${sidebarAfter}`,
    );

    // 没有横向溢出 —— 窄屏最容易出的问题就是某张卡片撑破了视口
    const overflow = await session.evaluate(
      `(() => {
        const de = document.documentElement;
        return {
          scrollWidth: de.scrollWidth,
          innerWidth: window.innerWidth,
          slack: de.scrollWidth - window.innerWidth,
        };
      })()`,
    );
    // 留 1px 容差：亚像素舍入会稳定地多出 0.5 左右
    assert.ok(
      overflow.slack <= 1,
      `窄屏不该横向溢出：scrollWidth ${overflow.scrollWidth} vs innerWidth ${overflow.innerWidth}`,
    );

    assert.empty(session.pageErrors, '窄屏这条链路里不该有未捕获异常');
  });

  test('narrow-tab-nav', '窄屏：点底部 Tab 真的切页，URL 与高亮都对', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.setViewport(NARROW);
    await session.goto(`${baseUrl}/`, { waitMs: 1500 });
    session.clearErrors();

    assert.equal(await activeTab(session), '首页总览', '刚进首页时的高亮 Tab');

    // 点「今日计划」→ URL 与高亮都该跟着走
    const res = await session.evaluate(
      `(() => {
        const bar = document.querySelector('${TAB}');
        if (!bar) return 'MISS';
        const b = [...bar.querySelectorAll('button')].find(n => n.textContent.trim() === '今日计划');
        if (!b) return 'NO_TAB';
        b.click();
        return 'OK';
      })()`,
    );
    assert.clicked(res, '点底部「今日计划」页签');
    await delay(900);

    const path = await session.evaluate('location.pathname');
    assert.equal(path, '/tasks', '点「今日计划」之后的地址');
    assert.equal(await activeTab(session), '今日计划', '切页后高亮的 Tab');

    const h1 = await session.text('h1');
    assert.nonEmpty(h1, '今日计划页的标题');

    // 再点一次「统计」，确认不是只有第一个能点
    const res2 = await session.evaluate(
      `(() => {
        const bar = document.querySelector('${TAB}');
        const b = [...bar.querySelectorAll('button')].find(n => n.textContent.trim() === '统计');
        if (!b) return 'MISS';
        b.click();
        return 'OK';
      })()`,
    );
    assert.clicked(res2, '点底部「统计」页签');
    await delay(900);
    assert.equal(await session.evaluate('location.pathname'), '/stats', '点「统计」之后的地址');
    assert.equal(await activeTab(session), '统计', '切到统计后高亮的 Tab');

    // 「更多」打开抽屉，不是直接跳走
    const more = await session.evaluate(
      `(() => {
        const bar = document.querySelector('${TAB}');
        const b = [...bar.querySelectorAll('button')].find(n => n.textContent.trim() === '更多');
        if (!b) return 'MISS';
        b.click();
        return 'OK';
      })()`,
    );
    assert.clicked(more, '点底部「更多」');
    await delay(900);

    const drawer = await session.evaluate(
      `(() => {
        const b = document.querySelector('${TAB} button[aria-expanded="true"]');
        // 抽屉本身：一个 dialog 或带 aria-label 的导航容器
        const dialogs = [...document.querySelectorAll('[role="dialog"]')];
        return {
          moreExpanded: b ? b.textContent.trim() : null,
          dialogCount: dialogs.length,
          pathname: location.pathname,
        };
      })()`,
    );
    assert.equal(drawer.moreExpanded, '更多', '「更多」应当进入展开态');
    assert.equal(drawer.pathname, '/stats', '点「更多」不该离开当前页');
    assert.ok(drawer.dialogCount > 0, '「更多」应当打开一个抽屉');

    assert.empty(session.pageErrors, '这条链路里不该有未捕获异常');
  });

  test('touch-tap', '触屏点击能触发 React 事件：点习惯打卡格子并落库', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.setViewport(NARROW);
    await session.goto(`${baseUrl}/habits`, { waitMs: 1500 });
    session.clearErrors();

    // 先造一个习惯（用弹窗，跟用户的操作路径一致）
    const opened = await session.evaluate(
      `(() => {
        const b = [...document.querySelectorAll('button')].find(n => n.textContent.trim() === '新建习惯');
        if (!b) return 'MISS';
        b.click();
        return 'OK';
      })()`,
    );

    if (opened !== 'OK') {
      // 空态下按钮文案可能是「添加第一个习惯」之类，退一步按任意新建入口找
      const fallback = await session.evaluate(
        `(() => {
          const b = [...document.querySelectorAll('button')].find(n => /新建|添加.*习惯/.test(n.textContent.trim()));
          if (!b) return 'MISS';
          b.click();
          return 'OK';
        })()`,
      );
      assert.clicked(fallback, '新建习惯入口');
    }
    await delay(700);

    assert.ok(await session.exists('[role="dialog"]'), '新建习惯弹窗');

    const filled = await session.evaluate(
      `(() => {
        const d = document.querySelector('[role="dialog"]');
        const label = [...d.querySelectorAll('label')].find(n => n.textContent.trim().startsWith('习惯名称'));
        if (!label) return 'NO_LABEL';
        const input = d.querySelector('#' + CSS.escape(label.getAttribute('for')));
        if (!input) return 'NO_INPUT';
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify('E2E 触屏习惯')});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return 'OK';
      })()`,
    );
    assert.equal(filled, 'OK', '填习惯名称');
    await delay(300);

    const submitted = await session.evaluate(
      `(() => {
        const d = document.querySelector('[role="dialog"]');
        const b = [...d.querySelectorAll('button')].find(n => /^(保存|新建|添加|创建)/.test(n.textContent.trim()));
        if (!b) return 'MISS';
        b.click();
        return 'OK';
      })()`,
    );
    assert.clicked(submitted, '提交习惯');
    await delay(900);

    // 找到今天那格（aria-current="date"）—— 用触屏点它
    const todayLabel = await session.evaluate(
      `(() => {
        const b = document.querySelector('button[aria-pressed][aria-current="date"]');
        return b ? b.getAttribute('aria-label') : null;
      })()`,
    );
    assert.nonEmpty(todayLabel, '今天那格打卡按钮的 aria-label');

    const tapped = await session.tapByLabel(todayLabel);
    assert.ok(tapped.ok, `触屏点「${todayLabel}」：${tapped.reason ?? 'ok'}`);

    // 触屏点击必须真的走完 React 的事件链 —— 按钮变 pressed 才算数
    const pressed = await session.evaluate(
      `(() => {
        const b = document.querySelector('button[aria-pressed][aria-current="date"]');
        return b ? b.getAttribute('aria-pressed') : null;
      })()`,
    );
    assert.equal(pressed, 'true', '触屏点过之后打卡按钮应当是选中态');

    // 再验一步：真的落库了。
    // DOM 变绿只说明内存态变了 —— persist 的写入链路断掉时按钮照样是绿的，
    // 所以绕到 IndexedDB 后面读原始字符串，跟 write-task 同一条纪律。
    await delay(900);
    const stored = await session.evaluate(
      `(async () => {
        const db = await new Promise((res) => {
          const rq = indexedDB.open('life-manager');
          rq.onsuccess = () => res(rq.result);
          rq.onerror = () => res(null);
        });
        if (!db) return null;
        const raw = await new Promise((res) => {
          const tx = db.transaction('kv', 'readonly');
          const rq = tx.objectStore('kv').get('lm:habits');
          rq.onsuccess = () => res(rq.result ?? null);
          rq.onerror = () => res(null);
        });
        db.close();
        return raw;
      })()`,
    );
    assert.nonEmpty(stored, 'lm:habits 应当已经落库');

    const habit = (() => {
      try {
        const parsed = JSON.parse(stored);
        return (parsed.state?.habits ?? []).find((h) => h.name === 'E2E 触屏习惯') ?? null;
      } catch {
        return null;
      }
    })();
    assert.ok(habit, '触屏新建的习惯应当出现在 lm:habits 里');
    const logDays = Object.keys(habit.logs ?? {});
    assert.equal(logDays.length, 1, `触屏打卡应当只记下一天，实际：${logDays.join(',')}`);

    assert.empty(session.pageErrors, '这条链路里不该有未捕获异常');
  });
}

/**
 * 冒烟用例：开发工作页（木子式左项目栏 + 右详情）。
 *
 * 单测已经把行为锁得很细，这里只验三件单测环境验不了的事：
 *   dev-rail-detail  真浏览器里左栏点项目 → 右详情联动 + URL ?project= 落库
 *   dev-redirect     旧路由 /dev/:id 重定向到 /dev?project=，页面不炸
 *   dev-narrow       375 宽下横向胶囊条不出页（页面级横向溢出为 0）
 */
import { assert, test } from '../lib/assert.mjs';
import { delay } from '../lib/cdp.mjs';

const NARROW = { width: 375, height: 812, mobile: true };

/** 新建项目弹窗走一遍（页头与左栏各有一个「新建项目」按钮，取第一个能点的） */
async function createProject(session, name) {
  const res = await session.evaluate(
    `(() => {
      const buttons = [...document.querySelectorAll('button')].filter(
        (n) => n.textContent.trim() === '新建项目' && n.getBoundingClientRect().height > 0,
      );
      if (buttons.length === 0) return 'MISS';
      buttons[0].click();
      return 'OK';
    })()`,
  );
  assert.clicked(res, '点「新建项目」');
  await delay(400);
  const typed = await session.evaluate(
    `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return 'NO_DIALOG';
      const input = [...dialog.querySelectorAll('input')].find(
        (n) => (n.labels?.[0]?.textContent ?? '').includes('项目名称'),
      );
      if (!input) return 'NO_INPUT';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(name)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'OK';
    })()`,
  );
  assert.equal(typed, 'OK', '在新建项目弹窗里填名称');
  const submit = await session.evaluate(
    `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const button = [...dialog.querySelectorAll('button')].find(
        (n) => n.textContent.trim() === '创建',
      );
      if (!button) return 'MISS';
      button.click();
      return 'OK';
    })()`,
  );
  assert.equal(submit, 'OK', '点「创建」提交');
  await delay(500);
}

/** 页面级横向溢出（内层滚动容器的溢出不算） */
const pageOverflow = (session) =>
  session.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth');

export function registerDevCases() {
  test('dev-rail-detail', '开发页：左栏选项目 → 右详情联动，选中进 URL', async (ctx) => {
    const { session, baseUrl, shot } = ctx;
    await session.goto(`${baseUrl}/dev`, { waitMs: 1200 });
    session.clearErrors();

    await createProject(session, '写作助手');
    await createProject(session, '记账工具');

    // 新建后自动选中：h2 详情头是第二个项目
    const detail = await session.evaluate(
      `(() => {
        const buttons = [...document.querySelectorAll('button')].filter(
          (n) => n.textContent.includes('记账工具') && n.getAttribute('aria-current') === 'true',
        );
        const h2 = document.querySelector('h2');
        return { selected: buttons.length > 0, h2: h2 ? h2.textContent.trim() : null };
      })()`,
    );
    assert.ok(detail.selected, '新建后左栏该项目带 aria-current');
    assert.equal(detail.h2, '记账工具', '详情头显示当前项目');

    // 点左栏第一个项目 → 详情与 URL 跟着走
    const switchRes = await session.evaluate(
      `(() => {
        const button = [...document.querySelectorAll('button')].find(
          (n) => n.textContent.includes('写作助手') && n.closest('ul[aria-label="项目列表"]'),
        );
        if (!button) return 'MISS';
        button.click();
        return 'OK';
      })()`,
    );
    assert.clicked(switchRes, '点左栏「写作助手」');
    await delay(600);

    const url = await session.evaluate('location.pathname + location.search');
    assert.ok(url.startsWith('/dev?project='), `选中态写进 URL（实际 ${url}）`);
    const h2 = await session.evaluate(
      `document.querySelector('h2') ? document.querySelector('h2').textContent.trim() : null`,
    );
    assert.equal(h2, '写作助手', '详情头切到「写作助手」');

    await shot('dev-rail-detail');
    assert.empty(session.pageErrors, '开发页操作过程无未捕获异常');
  });

  test('dev-redirect', '旧路由 /dev/:id 重定向到 /dev?project=，页面不炸', async (ctx) => {
    const { session, baseUrl } = ctx;
    session.clearErrors();
    await session.goto(`${baseUrl}/dev/some-old-id`, { waitMs: 1200 });

    const url = await session.evaluate('location.pathname + location.search');
    assert.equal(url, '/dev?project=some-old-id', '旧详情地址被替换成新地址');
    assert.nonEmpty(await session.text('h1'), '重定向后有可见的页面标题');
    assert.empty(session.pageErrors, '重定向过程无未捕获异常');
  });

  test('dev-narrow', '窄屏 375：项目栏变横向胶囊条，页面无横向溢出', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.setViewport(NARROW);
    await session.goto(`${baseUrl}/dev`, { waitMs: 1200 });
    session.clearErrors();

    await createProject(session, '写作助手');
    await createProject(session, '记账工具');

    const overflow = await pageOverflow(session);
    assert.ok(overflow <= 1, `页面级横向溢出应 ≤ 1px，实际 ${overflow}px`);

    // 胶囊条真的存在且能在内层滚（内容比容器宽也不撑破页面）
    const rail = await session.evaluate(
      `(() => {
        const list = document.querySelector('ul[aria-label="项目列表"]');
        if (!list) return null;
        return {
          horizontal: getComputedStyle(list).overflowX,
          widerThanClient: list.scrollWidth > list.clientWidth,
        };
      })()`,
    );
    assert.ok(rail !== null, '项目清单存在');
    assert.equal(rail.horizontal, 'auto', '项目清单在窄屏是内层横向滚动');

    await delay(300);
    assert.empty(session.pageErrors, '窄屏开发页无未捕获异常');
  });
}

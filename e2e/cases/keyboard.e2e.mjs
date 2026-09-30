/**
 * 冒烟用例：键盘入口 —— 命令面板、单键快捷键、g 序列、404。
 *
 * 这几件事共同的失败模式是「静默失灵」：面板打不开界面不会报错，快捷键被
 * 输入框吃掉也无从察觉。所以每条都要断言可观察的结果（面板出现 / 路由变了）。
 */
import { assert, test } from '../lib/assert.mjs';
import { delay } from '../lib/cdp.mjs';

const PANEL = '[role="dialog"][aria-label="命令面板"]';

export function registerKeyboardCases() {
  test('palette', '命令面板：Ctrl+K 打开、乱码输入不崩、Esc 关闭', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.goto(`${baseUrl}/`, { waitMs: 900 });
    session.clearErrors();

    // 用 CDP 派发真键盘事件。合成 KeyboardEvent 也能触发，但走 isTrusted 的分支会不一样，
    // 而我们要测的恰恰是真实路径。
    await session.key('k', { code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 /* Ctrl */ });
    await delay(400);

    assert.ok(await session.exists(PANEL), 'Ctrl+K 之后命令面板应当出现');

    // 输入一个什么都不会匹配的字符串：应当落到「跳转」组，不该崩
    await session.fill(`${PANEL} input[role="combobox"], ${PANEL} input`, 'zzzz-不存在的关键词-qqq');
    await delay(400);

    assert.empty(session.pageErrors, '面板里输入乱码后出现异常');
    const listText = await session.text(`${PANEL} [role="listbox"]`);
    assert.ok(listText !== null, '命令列表应当还在');

    // Esc 关闭
    await session.key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 });
    await delay(400);
    assert.equal(await session.exists(PANEL), false, 'Esc 之后命令面板应当消失');
  });

  test('palette-enter', '命令面板：回车执行当前项并关闭面板', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.goto(`${baseUrl}/`, { waitMs: 900 });

    await session.key('k', { code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 });
    await delay(400);
    assert.ok(await session.exists(PANEL), '命令面板');

    // 输入时区里稳定能命中的跳转项：导航项的 label 里一定含「写作」
    await session.fill(`${PANEL} input[role="combobox"], ${PANEL} input`, '写作');
    await delay(400);

    await session.key('Enter', { code: 'Enter', windowsVirtualKeyCode: 13 });
    await delay(900);

    assert.equal(await session.exists(PANEL), false, '回车之后面板应当关闭');
    assert.includes(
      await session.evaluate('location.pathname'),
      '/writing',
      '回车后应当跳到写作页',
    );
    const h1 = await session.text('h1');
    assert.equal(h1, '写作', '跳转后的页面标题');
  });

  test('g-sequence', 'g 序列：g 之后按 2 跳到今日计划', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.goto(`${baseUrl}/`, { waitMs: 900 });

    // NAV_ITEMS 的 main 组顺序：首页总览 / 今日计划 / 读书 …，所以 2 == 今日计划
    await session.key('g', { code: 'KeyG', windowsVirtualKeyCode: 71 });
    await delay(200);
    await session.key('2', { code: 'Digit2', windowsVirtualKeyCode: 50 });
    await delay(900);

    assert.equal(await session.evaluate('location.pathname'), '/tasks', 'g 之后按 2 的落点');
    assert.equal(await session.text('h1'), '今日计划', '今日计划的标题');
  });

  test('slash', '斜杠 / 也能开命令面板', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.goto(`${baseUrl}/`, { waitMs: 900 });

    await session.key('/', { code: 'Slash', windowsVirtualKeyCode: 191 });
    await delay(400);
    assert.ok(await session.exists(PANEL), '按 / 之后命令面板应当出现');

    await session.key('Escape', { code: 'Escape', windowsVirtualKeyCode: 27 });
    await delay(300);
    assert.equal(await session.exists(PANEL), false, 'Esc 之后命令面板应当消失');
  });

  test('not-found', '乱路径落到 404 页，能回首页', async (ctx) => {
    const { session, baseUrl } = ctx;
    session.clearErrors();
    await session.goto(`${baseUrl}/definitely-not-a-route-9f3a`, { waitMs: 900 });

    const h1 = await session.text('h1');
    assert.includes(h1, '找不到', '404 页标题');

    const clicked = await session.clickByText('返回首页');
    assert.clicked(clicked, '404 页的「返回首页」');
    await delay(900);
    assert.equal(await session.evaluate('location.pathname'), '/', '点返回首页之后的落点');
  });
}

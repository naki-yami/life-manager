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
    await session.fill(
      `${PANEL} input[role="combobox"], ${PANEL} input`,
      'zzzz-不存在的关键词-qqq',
    );
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

    // 搜「书房」：合并后它是唯一的模块条目，输入又正好等于命令名，
    // 所以回车执行的必定是它，落点是默认子页（不是裸宿主，省掉一次重定向）
    await session.fill(`${PANEL} input[role="combobox"], ${PANEL} input`, '书房');
    await delay(400);

    await session.key('Enter', { code: 'Enter', windowsVirtualKeyCode: 13 });
    await delay(900);

    assert.equal(await session.exists(PANEL), false, '回车之后面板应当关闭');
    assert.equal(
      await session.evaluate('location.pathname'),
      '/study/books',
      '回车后应当落进书房的默认子页',
    );
    const h1 = await session.text('h1');
    assert.equal(h1, '读书', '跳转后的页面标题');
  });

  test('palette-subpage', '命令面板：搜子页名直达那一页，不落在同模块的默认子页', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.goto(`${baseUrl}/`, { waitMs: 900 });

    await session.key('k', { code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 });
    await delay(400);
    assert.ok(await session.exists(PANEL), '命令面板');

    // 「饮食」和「健身」同属健康模块，默认子页是健身 —— 合并前「饮食」本身就是一条导航项，
    // 回车直接进饮食页。这条守的就是那次能力回退（和书房搜「写作」是同一类问题）
    await session.fill(`${PANEL} input[role="combobox"], ${PANEL} input`, '饮食');
    await delay(400);

    await session.key('Enter', { code: 'Enter', windowsVirtualKeyCode: 13 });
    await delay(900);

    assert.equal(await session.exists(PANEL), false, '回车之后面板应当关闭');
    assert.equal(
      await session.evaluate('location.pathname'),
      '/health/diet',
      '回车后应当落在饮食子页',
    );
    assert.equal(await session.text('h1'), '饮食', '跳转后的页面标题');
  });

  test('g-sequence', 'g 序列：g 之后按 2 跳到今日计划', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.goto(`${baseUrl}/`, { waitMs: 900 });

    // NAV_ITEMS 的 main 组顺序：首页总览 / 今日计划 / 书房 …，所以 2 == 今日计划
    await session.key('g', { code: 'KeyG', windowsVirtualKeyCode: 71 });
    await delay(200);
    await session.key('2', { code: 'Digit2', windowsVirtualKeyCode: 50 });
    await delay(900);

    assert.equal(await session.evaluate('location.pathname'), '/tasks', 'g 之后按 2 的落点');
    assert.equal(await session.text('h1'), '今日计划', '今日计划的标题');
  });

  test(
    'g-sequence-tail',
    'g 序列：7 落在成长、8 落在统计与复盘（统计与复盘是 main 组末位）',
    async (ctx) => {
      const { session, baseUrl } = ctx;
      await session.goto(`${baseUrl}/`, { waitMs: 900 });

      // 「成长」提到「统计与复盘」之前，于是 7 == 成长（落默认子页习惯养成）、
      // 8 == 统计与复盘（落默认子页统计）。这条守的就是那次顺序调整。
      await session.key('g', { code: 'KeyG', windowsVirtualKeyCode: 71 });
      await delay(200);
      await session.key('8', { code: 'Digit8', windowsVirtualKeyCode: 56 });
      await delay(900);

      assert.equal(
        await session.evaluate('location.pathname'),
        '/insight/stats',
        'g 之后按 8 的落点',
      );
      assert.equal(await session.text('h1'), '统计', '统计页的标题');

      await session.key('g', { code: 'KeyG', windowsVirtualKeyCode: 71 });
      await delay(200);
      await session.key('7', { code: 'Digit7', windowsVirtualKeyCode: 55 });
      await delay(900);

      assert.equal(
        await session.evaluate('location.pathname'),
        '/growth/habits',
        'g 之后按 7 的落点',
      );
      assert.equal(await session.text('h1'), '习惯养成', '习惯养成页的标题');
    },
  );

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

  test('list-keyboard', '列表行间键盘导航：j / k 走行、x 进批量（U8）', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.goto(`${baseUrl}/tasks`, { waitMs: 1200 });
    session.clearErrors();

    // 走真实的新建弹窗造两条任务：绕过表单直接写 store 就测不到「用完还能用」这件事
    for (const title of ['E2E 键盘甲', 'E2E 键盘乙']) {
      const opened = await session.evaluate(
        `(() => {
          const b = [...document.querySelectorAll('button')].find(n => n.textContent.trim() === '添加任务');
          if (!b) return 'MISS';
          b.click();
          return 'OK';
        })()`,
      );
      assert.equal(opened, 'OK', '打开「添加任务」弹窗');
      await delay(500);

      const typed = await session.evaluate(
        `(() => {
          const d = document.querySelector('[role="dialog"]');
          if (!d) return 'NO_DIALOG';
          const label = [...d.querySelectorAll('label')].find(n => n.textContent.trim().replace(/\\*$/, '') === '标题');
          if (!label) return 'NO_LABEL';
          const input = document.getElementById(label.getAttribute('for'));
          if (!input) return 'NO_INPUT';
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, ${JSON.stringify(title)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return 'OK';
        })()`,
      );
      assert.equal(typed, 'OK', `填进「${title}」`);
      await delay(300);

      const saved = await session.evaluate(
        `(() => {
          const d = document.querySelector('[role="dialog"]');
          if (!d) return 'NO_DIALOG';
          const b = [...d.querySelectorAll('button')].find(n => n.textContent.trim() === '添加');
          if (!b) return 'NO_BUTTON';
          b.click();
          return 'OK';
        })()`,
      );
      assert.equal(saved, 'OK', `保存「${title}」`);
      await delay(700);
    }

    // 行根元素是 data-row-id（useRovingList 的契约），勾选框是这一行的第一个控件
    const focusState = (index) =>
      session.evaluate(
        `(() => {
          const rows = [...document.querySelectorAll('[data-row-id]')];
          if (rows.length < 2) return 'ROWS:' + rows.length;
          const box = rows[${index}].querySelector('input[type="checkbox"]');
          if (!box) return 'NO_BOX';
          return document.activeElement === box ? 'FOCUSED' : 'NOT_FOCUSED';
        })()`,
      );

    const seeded = await session.evaluate(
      `(() => {
        const rows = [...document.querySelectorAll('[data-row-id]')];
        if (rows.length < 2) return 'ROWS:' + rows.length;
        rows[0].querySelector('input[type="checkbox"]').focus();
        return 'OK';
      })()`,
    );
    assert.equal(seeded, 'OK', '两条任务都渲染成了带 data-row-id 的行');

    // 这里派的也是真键盘事件：合成 KeyboardEvent 走不到 CDP 的那条路径
    await session.key('j', { code: 'KeyJ', windowsVirtualKeyCode: 74 });
    await delay(300);
    assert.equal(await focusState(1), 'FOCUSED', 'j 之后焦点应当走到第二行');

    await session.key('k', { code: 'KeyK', windowsVirtualKeyCode: 75 });
    await delay(300);
    assert.equal(await focusState(0), 'FOCUSED', 'k 之后焦点应当回到第一行');

    await session.key('x', { code: 'KeyX', windowsVirtualKeyCode: 88 });
    await delay(400);
    const picked = await session.evaluate(
      `(() => {
        const rows = [...document.querySelectorAll('[data-row-id]')];
        const box = rows[0].querySelector('input[type="checkbox"]');
        if (!box) return 'NO_BOX';
        if (!box.checked) return 'NOT_CHECKED';
        return document.activeElement === box ? 'CHECKED_AND_FOCUSED' : 'CHECKED_LOST_FOCUS';
      })()`,
    );
    assert.equal(picked, 'CHECKED_AND_FOCUSED', 'x 应当选中当前行，且焦点留在原处');

    // 再按一次 x 取消：批量模式要能进能出
    await session.key('x', { code: 'KeyX', windowsVirtualKeyCode: 88 });
    await delay(400);
    const released = await session.evaluate(
      `(() => {
        const rows = [...document.querySelectorAll('[data-row-id]')];
        const box = rows[0].querySelector('input[type="checkbox"]');
        return box && !box.checked ? 'RELEASED' : 'STILL_CHECKED';
      })()`,
    );
    assert.equal(released, 'RELEASED', '再按一次 x 应当取消选中');

    assert.empty(session.pageErrors, '走一遍列表键盘导航不该有未捕获异常');
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

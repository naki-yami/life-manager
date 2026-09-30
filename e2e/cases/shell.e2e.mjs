/**
 * 冒烟用例：外壳本身。
 *
 * 「应用能起来」这件事其实包含好几层，白屏只是最粗暴的一种失败。
 * 这条用例把外壳拆成四件必须成立的事：渲染、无异常、存储后端可用、能跳转。
 */
import { assert, test } from '../lib/assert.mjs';

export function registerShellCases() {
  test('boot', '启动：渲染出 h1、无页面异常、IndexedDB 库已建好', async (ctx) => {
    const { session, baseUrl } = ctx;
    session.clearErrors();
    await session.goto(`${baseUrl}/`, { waitMs: 1500 });

    const h1 = await session.text('h1');
    assert.nonEmpty(h1, '首屏 h1');

    assert.empty(session.pageErrors, '首屏出现未捕获异常');
    assert.empty(session.consoleErrors, '首屏出现 console.error');

    // 存储后端：应用只是「能起来」还不够，得确认它真的把库建起来了。
    // 如果这里退化成 localStorage，后面所有落库断言都会跟着换语义。
    const backend = await session.evaluate(
      `(async () => {
        if (!('indexedDB' in window)) return 'no-indexeddb';
        const names = await indexedDB.databases();
        return names.map((d) => d.name).join(',');
      })()`,
    );
    assert.includes(backend, 'life-manager', 'IndexedDB 里的库名');

    // 外壳的关键部位都在位
    assert.ok(await session.exists('nav'), '侧栏导航');
    assert.ok(await session.exists('#main-content'), '主内容区');
    assert.ok(await session.exists('header'), '顶栏');
  });

  test('shell-controls', '顶栏的三个开关都在，且能点', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.goto(`${baseUrl}/`, { waitMs: 900 });

    // 主题开关：标签里带当前模式，点一下要真的换掉
    const themeBefore = await session.evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find(n => (n.getAttribute('aria-label') ?? '').startsWith('主题：')); return b ? b.getAttribute('aria-label') : null; })()`,
    );
    assert.nonEmpty(themeBefore, '主题开关的 aria-label');

    const clicked = await session.evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find(n => (n.getAttribute('aria-label') ?? '').startsWith('主题：')); if (!b) return 'MISS'; b.click(); return 'OK'; })()`,
    );
    assert.clicked(clicked, '主题开关');

    const themeAfter = await session.evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find(n => (n.getAttribute('aria-label') ?? '').startsWith('主题：')); return b ? b.getAttribute('aria-label') : null; })()`,
    );
    assert.notEqual(themeAfter, themeBefore, '点过主题开关后标签应当变了');

    // 密度开关同样
    const density = await session.evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find(n => (n.getAttribute('aria-label') ?? '').startsWith('密度：')); return b ? b.getAttribute('aria-label') : null; })()`,
    );
    assert.nonEmpty(density, '密度开关的 aria-label');

    // 保存按钮存在
    const save = await session.evaluate(
      `(() => { const b = [...document.querySelectorAll('button')].find(n => (n.getAttribute('aria-label') ?? '').startsWith('保存')); return b ? b.getAttribute('aria-label') : null; })()`,
    );
    assert.nonEmpty(save, '保存按钮的 aria-label');
  });

  test('storage-alert-absent', '存储正常时不该出现存储告警条', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.goto(`${baseUrl}/`, { waitMs: 1200 });
    // StorageAlert 只在写入失败时渲染；能跑到这里说明 IndexedDB 是好的，
    // 那它就不该在页面上。出现了就说明首启迁移或写入链路有问题。
    const alertText = await session.evaluate(
      `(() => {
        const nodes = [...document.querySelectorAll('[role="alert"], [role="status"]')];
        const hit = nodes.find((n) => (n.textContent ?? '').includes('保存') && (n.textContent ?? '').includes('失败'));
        return hit ? hit.textContent.replace(/\\s+/g, ' ').trim().slice(0, 200) : null;
      })()`,
    );
    assert.equal(alertText, null, '页面上的存储失败告警');
  });
}

/**
 * 冒烟用例：真机上的几何。
 *
 * 为什么单独开一份：jsdom 里 `getBoundingClientRect()` 全是 0，任何「几个控件有没有对齐」
 * 的判断都做不了 —— 单测只能断言 DOM 里有没有那个元素，断言不了它长在哪儿。
 * 写作卡片那排控件就是被一行说明文字（`hint`）顶得上下错开，单测全绿、肉眼一看就歪。
 *
 * 这类用例只量几何，不量样式细节：颜色、间距该不该是 8px 不归它管，
 * 「几个控件是不是在同一条线上」才是它守的东西。
 *
 * 前提是**宽屏**：那一行控件在窄屏下本来就会折行，折了之后「在不在同一条线上」
 * 就不是这条用例要问的问题了。runner 每条用例开跑前会把视口压回 1440×1100
 * （见 run.mjs 的 beforeEach），所以这里不用自己设。
 */
import { assert, test } from '../lib/assert.mjs';
import { delay } from '../lib/cdp.mjs';

export function registerLayoutCases() {
  test('writing-card-row', '写作卡片：目标字数与状态在同一条线上，字数是只读文本', async (ctx) => {
    const { session, baseUrl } = ctx;
    await session.goto(`${baseUrl}/study/writing`, { waitMs: 1500 });
    session.clearErrors();

    // 先造一条项目 —— 这一行只在有卡片的时候才存在
    const opened = await session.clickByText('新建项目');
    assert.clicked(opened, '「新建项目」按钮');
    await delay(500);
    await session.fill('[role="dialog"] input', 'E2E 布局稿');
    await delay(300);
    const created = await session.clickByText('创建');
    assert.clicked(created, '弹窗里的「创建」按钮');
    await delay(800);

    const raw = await session.evaluate(
      `(() => {
        const bySuffix = (suffix, tag) =>
          [...document.querySelectorAll(tag)].find((n) =>
            (n.getAttribute('aria-label') ?? '').endsWith(suffix),
          );
        const target = bySuffix('的目标字数', 'input');
        const status = bySuffix('的状态', 'select');
        if (!target || !status) return JSON.stringify({ missing: true });
        const box = (n) => {
          const r = n.getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
        };
        const card = target.closest('li');
        return JSON.stringify({
          missing: false,
          boxes: [box(target), box(status)],
          // 字数现在必须是只读文本 —— 卡片里不该再有手填的「字数」输入框
          wordInput: Boolean(bySuffix('的字数', 'input')),
          cardText: card ? card.textContent : '',
        });
      })()`,
    );
    const geom = JSON.parse(raw);
    assert.equal(geom.missing, false, '目标字数与状态两个控件都该在卡片里找得到');

    const [target, status] = geom.boxes;
    // 同一行 = 上边缘一致。差 1px 以上就说明有东西把某个控件顶走了
    assert.equal(
      target.top,
      status.top,
      `目标框和状态下拉该在同一水平线上（目标 ${target.top}，状态 ${status.top}）`,
    );
    assert.equal(
      target.bottom,
      status.bottom,
      `底边也该齐（目标 ${target.bottom}，状态 ${status.bottom}）`,
    );

    /*
     * 字数改成只读文本（两个真相源）：保存正文时 store 会按 content.length 重算并覆盖，
     * 卡片上再留一个手填输入框，填了也保不住。这条把那个决定钉在真浏览器里。
     */
    assert.equal(geom.wordInput, false, '卡片里不该再有手填的「字数」输入框');
    assert.includes(geom.cardText, '已写', '卡片上该有只读的「已写 N 字」');

    // 之前那行说明就是错位的根源：它挂在字段下面，会把整个框顶高一行。
    // 现在这行字归页面正文说了，卡片里不该再出现。
    assert.equal(
      geom.cardText.includes('0 表示未设置'),
      false,
      '卡片里不该再出现「0 表示未设置」那行说明',
    );

    assert.empty(session.pageErrors, '量一下几何而已，不该有未捕获异常');
  });
}

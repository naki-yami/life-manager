/**
 * 冒烟用例：真机上的几何。
 *
 * 为什么单独开一份：jsdom 里 `getBoundingClientRect()` 全是 0，任何「几个控件有没有对齐」
 * 的判断都做不了 —— 单测只能断言 DOM 里有没有那个元素，断言不了它长在哪儿。
 * 写作卡片那三个控件就是被一行说明文字（`hint`）顶得上下错开，单测全绿、肉眼一看就歪。
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
  test('writing-card-row', '写作卡片：字数 / 目标 / 状态三个控件在同一水平线上', async (ctx) => {
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
        const nodes = [
          bySuffix('的字数', 'input'),
          bySuffix('的目标字数', 'input'),
          bySuffix('的状态', 'select'),
        ];
        if (nodes.some((n) => !n)) return JSON.stringify({ missing: true });
        const box = (n) => {
          const r = n.getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
        };
        const card = nodes[0].closest('li');
        return JSON.stringify({
          missing: false,
          boxes: nodes.map(box),
          cardText: card ? card.textContent : '',
        });
      })()`,
    );
    const geom = JSON.parse(raw);
    assert.equal(geom.missing, false, '三个控件都该在卡片里找得到（字数 / 目标字数 / 状态）');

    const [words, target, status] = geom.boxes;
    // 同一行 = 上边缘一致。差 1px 以上就说明有东西把某个控件顶走了
    assert.equal(
      target.top,
      words.top,
      `目标框和字数框该在同一水平线上（字数 ${words.top}，目标 ${target.top}）`,
    );
    assert.equal(
      status.top,
      words.top,
      `状态下拉和字数框该在同一水平线上（字数 ${words.top}，状态 ${status.top}）`,
    );
    assert.equal(
      target.bottom,
      words.bottom,
      `底边也该齐（字数 ${words.bottom}，目标 ${target.bottom}）`,
    );

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

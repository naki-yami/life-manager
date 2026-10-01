/**
 * 冒烟用例 2：全部路由逐条打开 + 旧路径重定向 + 宿主子页签条。
 *
 * 断言刻意做得浅 —— 「页面能渲染」而不是「内容对不对」。内容正确性归单测，
 * 这里要抓的是「某条路由一打开就白屏 / 报错 / 懒加载 chunk 404」这类整体性故障。
 *
 * 每条路由跑完顺手看一眼 pageErrors：某条路由自己把东西炸了，就该在它头上记一笔，
 * 而不是拖到后面某条不相干的路由上才暴露。
 */
import { assert, test } from '../lib/assert.mjs';
import { delay } from '../lib/cdp.mjs';

/**
 * 与 src/App.tsx 的路由表逐条对应；`title` 是 <PageHeader> 里真实的标题文案 ——
 * 注意它和侧栏导航标签不完全一致（导航叫「书房」，子页标题是「读书」「写作」；
 * 导航叫「健康」，子页标题是「健身」「饮食」）。这里等的是页面，所以核对页面标题。
 */
export const ROUTES = [
  // 首页的 h1 是问候语（「下午好 👋」），不是固定文案，所以不核对
  { path: '/', title: null, note: '首页总览' },
  { path: '/tasks', title: '今日计划' },
  { path: '/study/books', title: '读书' },
  { path: '/dev', title: '开发工作' },
  { path: '/dev/d1', title: null, note: '开发项目详情，h1 跟着项目名走（播种项目 d1）' },
  { path: '/study/writing', title: '写作' },
  { path: '/health/fitness', title: '健身' },
  { path: '/health/diet', title: '饮食' },
  { path: '/games', title: '游戏' },
  { path: '/stats', title: '统计' },
  { path: '/habits', title: '习惯养成' },
  { path: '/review', title: '复盘' },
  { path: '/goals', title: '目标' },
  { path: '/journal', title: '日记与心情' },
  { path: '/settings', title: '数据与设置' },
];

/**
 * 旧路径的保底重定向。
 *
 * 单列出来的理由：ROUTES 那条只核对「页面渲染出来了」，而重定向最容易错的地方是
 * **地址栏没换**（页面照样对，URL 还停在旧路径）—— 这件事只有 e2e 看得到（决策 #17）。
 */
export const REDIRECTS = [
  { from: '/books', to: '/study/books', title: '读书' },
  { from: '/writing', to: '/study/writing', title: '写作' },
  { from: '/fitness', to: '/health/fitness', title: '健身' },
  { from: '/diet', to: '/health/diet', title: '饮食' },
];

/**
 * 光秃秃的宿主地址（`/study`、`/health`）要落到默认子页。
 *
 * 不是「旧路径」，但同样是「地址栏必须跟着换」的活儿：index 那条 `<Navigate>` 一旦
 * 写错（比如忘了 replace），页面照样能出来，只有地址栏是错的 —— 只有 e2e 看得到。
 */
export const HOST_ENTRIES = [
  { from: '/study', to: '/study/books', title: '读书' },
  { from: '/health', to: '/health/fitness', title: '健身' },
];

/** 用例标题里的路由条数现算，免得又一次和数组实际长度对不上 */
const TOTAL_ROUTES = ROUTES.length + 1;

/** 签条里当前按下的那一项文字 */
const pressedTab = (session, strip) =>
  session.evaluate(
    `(() => { const n = document.querySelector('${strip} [aria-pressed="true"]'); return n ? n.textContent.trim() : null; })()`,
  );

/** 点签条上文字等于 label 的那一项 */
const clickTab = (session, strip, label) =>
  session.evaluate(
    `(() => {
      const hit = [...document.querySelectorAll('${strip} button')].find((n) => n.textContent.trim() === ${JSON.stringify(label)});
      if (!hit) return 'MISS';
      hit.click();
      return 'OK';
    })()`,
  );

export function registerRouteCases() {
  test('routes', `${TOTAL_ROUTES} 条路由逐条能打开（含 /dev/:id 与 /ui）`, async (ctx) => {
    const { session, baseUrl, shot } = ctx;
    const all = [...ROUTES, { path: '/ui', title: null, note: '组件预览' }];

    const broken = [];
    for (const route of all) {
      session.clearErrors();
      await session.goto(`${baseUrl}${route.path}`, { waitMs: 500 });

      // 页面报错就记下来，但继续跑下一条 —— 一次跑完拿到全貌比第一处就中断有用
      const errors = [...session.pageErrors, ...session.consoleErrors];
      if (errors.length > 0) {
        broken.push(`${route.path} 抛错：${errors[0].slice(0, 160)}`);
        continue;
      }

      const h1 = await session.text('h1');
      if (h1 === null || h1.trim() === '') {
        broken.push(`${route.path} 没有可见的 h1`);
        continue;
      }

      // 页面标题：除首页（问候语随时间变）与 /dev/:id（跟着项目名走）外都可精确核对
      if (route.title !== undefined && route.title !== null) {
        assert.equal(h1, route.title, `${route.path} 的标题`);
      }

      // 「渲染出来了」的最低标准：主内容区有文字
      const mainText = await session.text('#main-content');
      if (!mainText || mainText.length < 2) {
        broken.push(`${route.path} 主内容区是空的`);
      }
    }

    // 留几张关键页的截图作为人工复核的凭据（单条路由 17 张太多，挑有代表性的）
    for (const path of ['/tasks', '/stats', '/ui']) {
      await session.goto(`${baseUrl}${path}`, { waitMs: 1100 });
      await shot(`route${path.replace(/\//g, '-')}`);
    }

    assert.empty(broken, '有路由打不开');
  });

  test('routes-stable', `逐条走完 ${TOTAL_ROUTES} 条路由后，页面无累积异常`, async (ctx) => {
    const { session } = ctx;
    // 上一条用例已经走了一遍，这里只做「回访」：从最后一条路由直接回首页，
    // 确认客户端路由切换（不是整页刷新）不会炸
    session.clearErrors();
    const { baseUrl } = ctx;
    await session.goto(`${baseUrl}/settings`, { waitMs: 400 });
    await session.evaluate(
      `(() => { history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); return 1; })()`,
    );
    await delay(900);
    const errors = [...session.pageErrors, ...session.consoleErrors];
    assert.empty(errors, '客户端路由切换后出现了异常');
    const h1 = await session.text('h1');
    assert.nonEmpty(h1, '回首页后标题');
  });

  /** 重定向类用例的公共断言：地址栏 + 标题 + 不抛错 */
  const checkRedirect = async (session, baseUrl, item) => {
    session.clearErrors();
    await session.goto(`${baseUrl}${item.from}`, { waitMs: 700 });

    assert.equal(
      await session.evaluate('location.pathname'),
      item.to,
      `${item.from} 重定向后的地址栏`,
    );
    assert.equal(await session.text('h1'), item.title, `${item.from} 重定向后的标题`);
    assert.empty([...session.pageErrors, ...session.consoleErrors], `${item.from} 重定向时抛错`);
  };

  test('routes-redirect', '旧路径永久重定向到模块子页，地址栏也跟着换', async (ctx) => {
    const { session, baseUrl } = ctx;

    for (const item of REDIRECTS) await checkRedirect(session, baseUrl, item);
  });

  test('routes-host-index', '裸宿主地址落到默认子页，地址栏也跟着换', async (ctx) => {
    const { session, baseUrl } = ctx;

    for (const item of HOST_ENTRIES) await checkRedirect(session, baseUrl, item);
  });

  /** 模块签条的用例参数：从默认子页切到另一个子页 */
  const TAB_CASES = [
    {
      name: '书房',
      entry: '/study/books',
      from: '读书',
      to: '写作',
      toPath: '/study/writing',
      slug: 'study-writing',
    },
    {
      name: '健康',
      entry: '/health/fitness',
      from: '健身',
      to: '饮食',
      toPath: '/health/diet',
      slug: 'health-diet',
    },
  ];

  for (const item of TAB_CASES) {
    test(
      `routes-tabs-${item.slug}`,
      `${item.name}：子页签条切到${item.to}，地址与按下态一起走`,
      async (ctx) => {
        const { session, baseUrl, shot } = ctx;
        const strip = `[role="group"][aria-label="${item.name}内的页面"]`;

        await session.goto(`${baseUrl}${item.entry}`, { waitMs: 900 });
        session.clearErrors();

        assert.ok(await session.exists(strip), `${item.name}宿主应当渲染出子页签条`);
        assert.equal(await pressedTab(session, strip), item.from, '起始时按下的子页');

        assert.clicked(await clickTab(session, strip, item.to), `签条上的「${item.to}」`);
        await delay(900);

        assert.equal(await session.evaluate('location.pathname'), item.toPath, '切子页后的落点');
        assert.equal(await session.text('h1'), item.to, '切子页后的页面标题');
        assert.equal(await pressedTab(session, strip), item.to, '切子页后按下的子页');
        await shot(item.slug);

        assert.empty([...session.pageErrors, ...session.consoleErrors], '切子页时抛错');
      },
    );
  }
}

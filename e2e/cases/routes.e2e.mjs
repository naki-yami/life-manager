/**
 * 冒烟用例 2：17 条路由逐条打开。
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
 * 注意它和侧栏导航标签不完全一致（导航叫「健身计划」，页面标题是「健身」；
 * 导航叫「饮食计划」，页面标题是「饮食」）。这里等的是页面，所以核对页面标题。
 */
export const ROUTES = [
  // 首页的 h1 是问候语（「下午好 👋」），不是固定文案，所以不核对
  { path: '/', title: null, note: '首页总览' },
  { path: '/tasks', title: '今日计划' },
  { path: '/books', title: '读书' },
  { path: '/dev', title: '开发工作' },
  { path: '/dev/d1', title: null, note: '开发项目详情，h1 跟着项目名走（播种项目 d1）' },
  { path: '/writing', title: '写作' },
  { path: '/fitness', title: '健身' },
  { path: '/diet', title: '饮食' },
  { path: '/games', title: '游戏' },
  { path: '/stats', title: '统计' },
  { path: '/habits', title: '习惯养成' },
  { path: '/review', title: '复盘' },
  { path: '/goals', title: '目标' },
  { path: '/journal', title: '日记与心情' },
  { path: '/settings', title: '数据与设置' },
];

export function registerRouteCases() {
  test('routes', '17 条路由逐条能打开（含 /dev/:id 与 /ui）', async (ctx) => {
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

  test('routes-stable', '逐条走完 17 条路由后，页面无累积异常', async (ctx) => {
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
}

# e2e 冒烟测试

「应用整体还能不能用」这一层。单测（`npm test`，1261 条）覆盖的是 store 逻辑与组件行为，
e2e 只关心那件单测照不到的事：**在真浏览器里跑起来、路由真的能开、数据真的落到 IndexedDB**。

## 怎么跑

```bash
npm run e2e                      # 全部
npm run e2e -- --only=tasks      # 只跑名字含 tasks 的用例
npm run e2e -- --only=boot,write-task
npm run e2e -- --list            # 列出用例名（不启浏览器）
npm run e2e -- --keep            # 挂了一处也继续跑完（默认遇到失败就停）
npm run e2e -- --no-shots        # 不截图
```

跑完的截图落在 `.runtime/e2e-shots/`（已在 .gitignore 里）。

## 为什么不用 Playwright

这是本项目里一个**刻意的取舍**，写在这里免得以后有人「顺手升级一下」。

项目从 F3 到 F14 一直用「手写 CDP + 无头 Edge」做真机复核，脚本在 `.runtime/verify-*.mjs`。
把它收编成 e2e 底座的好处：

- **零新依赖、零浏览器下载。** Playwright 要下 150MB 左右的 Chromium；本项目是纯本地
  PWA，`AGENTS.md` 与优化任务书都写着「依赖克制」。
- **不动 `package-lock.json`。** CI 里那句 `npm ci` 对锁文件与 package.json 的一致性要求严格，
  加一个重依赖就是动整条流水线。
- **复用已有肌肉。** `.runtime/` 下那 20 多个脚本的写法与这里完全一致。

代价（明确认下来，不遮掩）：

- **驱动和 launcher 是自己写的** —— 约 400 行，在 `lib/` 下。
- **只能本地跑，进不了 CI。** GitHub Actions 的 runner 上没有 Edge。这不是疏忽，
  是取舍：e2e 冒烟的价值在「改完随手验一遍」，不在每次 push 都跑。CI 继续跑
  `typecheck / lint / test / build / size` 五连。

如果哪天要进 CI，正确的做法不是把 Edge 装到 runner 上（Linux 上得走 wine 或 headless-shell），
而是**给 launch.mjs 加一个 Chromium 可执行文件探测分支**，让 CI 环境用容器里的 chromium。
`findEdge()` 是唯一的入口，改一处就够。

## 目录

```
e2e/
  run.mjs              入口：编排 dev server → Edge → 清场 → 跑 → 收摊
  lib/
    launch.mjs         dev server 复用/启动、无头 Edge 启动、进程树清理
    cdp.mjs            CDP 会话封装（evaluate / click / fill / key / 截图 / 错误收集）
    assert.mjs         断言、用例注册、runner、彩色汇总
  cases/
    shell.e2e.mjs      外壳：能渲染、无异常、存储后端在位、顶栏开关可用
    routes.e2e.mjs     17 条路由逐条打开
    keyboard.e2e.mjs   命令面板、单键快捷键、g 序列、404
    data.e2e.mjs       写入链路、刷新持久化、旧 key 迁移、主题落盘
```

## 加一条用例

在 `cases/` 下新建文件（或找个合适的现有文件），注册进去：

```js
import { assert, test } from '../lib/assert.mjs';

test('my-case', '一句话说清这条用例在验什么', async (ctx) => {
  const { session, baseUrl, shot } = ctx;

  await session.goto(`${baseUrl}/habits`, { waitMs: 1200 });

  const h1 = await session.text('h1');
  assert.equal(h1, '习惯养成', '习惯页的标题');

  await shot('habits');   // 可选，落 .runtime/e2e-shots/
});
```

然后在 `run.mjs` 顶部 `register*Cases()` 那一组里 import 并调用你的注册函数。

### 三条纪律

**一、用例之间不能互相依赖。** 每条用例开跑前 runner 会清掉 IndexedDB 与 `lm:` 前缀的
localStorage，然后整页重载。所以「上一条用例留下的数据」在下一条里一定不存在 ——
需要跨步骤验证的链路，写在同一条用例里（见 `write-task`：写 → 落库 → 刷新 → 还在，
四步一条用例）。

**二、别用 `localStorage.clear()`。** 清场只删 `lm:` 前缀，不碰同源下的其他东西。
这是本项目一直在守的线。

**三、`session.evaluate` 抛异常不要吞。** 页面里 `Runtime.evaluate` 的
`exceptionDetails` 一旦被忽略，一条本该红的用例会静静地绿。`lib/cdp.mjs` 里已经统一
抛出来了，别在调用处 `try/catch` 掉。

### 常用手法

```js
await session.goto(url);                     // 导航 + 等 load + 停顿
await session.text('h1');                    // 文本（trim 过），找不到返回 null
await session.clickByLabel('完成「写周报」'); // 按 aria-label 点（最稳，不受文案改动影响）
await session.clickByText('添加任务');        // 按按钮文本点
await session.fill('[role="dialog"] input', '值'); // 写受控输入框（自动处理 React 的 setter）
await session.key('k', { modifiers: 2 });    // Ctrl+K；modifiers 2 = Ctrl, 8 = Meta(⌘)
await session.count('[role="dialog"] button');
await session.exists(PANEL);
```

读 IndexedDB 里真实字节的写法见 `data.e2e.mjs` 的 `readRaw` / `readState` ——
**验证「数据落库了」必须绕到库后面读原始字符串，不能只看 DOM。** DOM 上勾选框变绿
只说明内存态变了，`persist` 的写入链路断掉时页面照样是对的。

## 已知的边界

- **只有桌面视口（1440×1100）**。窄屏 375 的复核在 `.runtime/verify-f13.mjs` 里做过，
  还没收编进 e2e。要做的话在 `lib/cdp.mjs` 的 `setViewport` 上加一组就够。
- **触屏手势、拖拽（@dnd-kit）没测**。CDP 能派发 touch 事件，但拖拽的落点计算容易写脆，
  暂不纳入冒烟。
- **不测性能与视觉回归**。首屏体积由 `npm run size` 把关，视觉没有基线图。

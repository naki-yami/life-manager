# e2e 冒烟测试

「应用整体还能不能用」这一层。单测（`npm test`，1400+ 条）覆盖的是 store 逻辑与组件行为，
e2e 只关心那件单测照不到的事：**在真浏览器里跑起来、路由真的能开、数据真的落到 IndexedDB、
拖拽真能换位、窄屏真能点**。

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

单跑一条调试：

```bash
npm run e2e -- --only=drag-dashboard-order
```

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
    cdp.mjs            CDP 会话封装（evaluate / click / fill / key / 截图 / 错误收集
                       / scrollIntoView / dragByLabel / tapByLabel / setViewport）
    assert.mjs         断言、用例注册、runner、彩色汇总
  cases/
    shell.e2e.mjs      外壳：能渲染、无异常、存储后端在位、顶栏开关可用
    routes.e2e.mjs     逐条打开全部路由 + 旧路径重定向 + 裸宿主落点 + 宿主子页签条
    keyboard.e2e.mjs   命令面板、单键快捷键、g 序列、404
    data.e2e.mjs       写入链路、刷新持久化、旧 key 迁移、主题落盘、模板、批量操作、
                       分模块导出、首页拖拽换位
    mobile.e2e.mjs     窄屏布局、底部 Tab 导航、触屏点击
    layout.e2e.mjs     真机上的几何：几个控件有没有对齐（jsdom 的 rect 全是 0）
  sync-two-devices.mjs 两设备同步实机冒烟（`npm run e2e:sync`）—— 见下
```

### `npm run e2e:sync`：两设备同步冒烟

上面那套是**单浏览器**的。同步功能有一条单浏览器验不了的事：**「两台设备」的本质是两个
彼此隔离的浏览器存储**。所以 `sync-two-devices.mjs` 起：

- 一个**真的同步服务端进程**（独立 config 与数据目录，端口 8899 —— 刻意避开用户自己的 8787）；
- **两个独立 `--user-data-dir` 的无头 Edge**（各自的 IndexedDB、各自的 `lm:sync`）。

走完整流程：开开关 → 填令牌 → A 写 B 拉 → **制造一次真冲突**看那行提示 → 删除跨设备传播。
19 条断言，截图落 `.runtime/e2e-sync-shots/`。

**它是上线前那一关，单测替代不了**：单测里那套「两个 store 对象」是同一份内存的两种看法，
验不出「令牌是不是真的只存在各自浏览器里」「关掉开关是不是真的零请求」。
它已经抓出过一个单测、截图都漏掉的缺陷（冲突明细缺「服务端那份的时间」——
界面留了位置、spec 也承诺了，但那个字段从来没人填）。

写这类脚本时踩过的坑（都留在 `sync-two-devices.mjs` 的注释里）：
`lm:sync` 在 **IndexedDB** 而不是 localStorage；React 的 `onBlur` 要派发**冒泡的 `focusout`**
（派发 `blur` 在 React 侧什么都不发生）；导航会清掉挂在 `window` 上的页面小工具；
设置页有多个 `role="switch"`；截图前要把目标卡片滚进视野。

## 加一条用例

在 `cases/` 下新建文件（或找个合适的现有文件），注册进去：

```js
import { assert, test } from '../lib/assert.mjs';

test('my-case', '一句话说清这条用例在验什么', async (ctx) => {
  const { session, baseUrl, shot } = ctx;

  await session.goto(`${baseUrl}/growth/habits`, { waitMs: 1200 });

  const h1 = await session.text('h1');
  assert.equal(h1, '习惯养成', '习惯页的标题');

  await shot('habits'); // 可选，落 .runtime/e2e-shots/
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

**二·补、改了视口要还回来（清场已经替你压回 1440×1100）。** 视口和存储是同一类
全局脏东西：窄屏用例 `setViewport({ width: 375, mobile: true })` 之后就不管了，
排在后面的宽屏用例于是长在 375 上 —— 卡片里的控件行会折行，量出来的几何全不是那个
意思。runner 每条用例开跑前统一压回宽屏，但用例内部自己改过之后，别指望下一条还看得见你的改动。

**三、`session.evaluate` 抛异常不要吞。** 页面里 `Runtime.evaluate` 的
`exceptionDetails` 一旦被忽略，一条本该红的用例会静静地绿。`lib/cdp.mjs` 里已经统一
抛出来了，别在调用处 `try/catch` 掉。

### 常用手法

```js
await session.goto(url); // 导航 + 等 load + 停顿
await session.text('h1'); // 文本（trim 过），找不到返回 null
await session.clickByLabel('完成「写周报」'); // 按 aria-label 点（最稳，不受文案改动影响）
await session.clickByText('添加任务'); // 按按钮文本点
await session.fill('[role="dialog"] input', '值'); // 写受控输入框（自动处理 React 的 setter）
await session.key('k', { modifiers: 2 }); // Ctrl+K；modifiers 2 = Ctrl, 8 = Meta(⌘)
await session.key('Enter', { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); // 要 keypress 就得给 text
await session.count('[role="dialog"] button');
await session.exists(PANEL);

// 视口：切成窄屏并开启触屏模拟（mobile: true 才叫"真模拟手机"）
await session.setViewport({ width: 375, height: 812, mobile: true });
await session.setViewport({ width: 1440, height: 1100, mobile: false });

// 滚动到元素并拿视口坐标；返回 { x, y, inView }
await session.scrollIntoView('[data-testid="x"]');

// 拖拽（@dnd-kit）：按 aria-label 抓手柄，相对位移 dx/dy
await session.dragByLabel('拖动「概览统计」', { dx: 0, dy: 420, steps: 10 });

// 触屏点按：走 touchStart/touchEnd，不是鼠标
await session.tapByLabel('添加习惯');
```

读 IndexedDB 里真实字节的写法见 `data.e2e.mjs` 的 `readRaw` / `readState` ——
**验证「数据落库了」必须绕到库后面读原始字符串，不能只看 DOM。** DOM 上勾选框变绿
只说明内存态变了，`persist` 的写入链路断掉时页面照样是对的。

### 三个踩过的坑（省你两小时）

**一、CDP 的鼠标/触屏事件按视口坐标派发 —— 元素在视口外就命不中。**
`Input.dispatchMouseEvent` 收到的是 `(x, y)`，浏览器拿它去命中测试；元素滚出视口时
坐标算出来是对的，但点在空白上。表现是「抓手柄拿到了、拖拽也 ok、顺序却纹丝不动」。
**先 `scrollIntoView()`，再拿它返回的坐标点/拖。** `dragByLabel` 与 `tapByLabel`
内部已经这么做了，自己写裸坐标时记得手动调。

**二、`lm:` 前缀的键不都在 IndexedDB 里。**
同步键（`lm:theme`、`lm:ui`）走 localStorage，数据键才走 IndexedDB。
拿 `readRaw(session, 'lm:ui')` 会读到 `null`，让你误以为「数据没落盘」。
**判据：`src/utils/storageKeys.ts` 里不在 `DATA_STORAGE_KEYS` 的，就是同步键。**
同步键用 `session.evaluate("localStorage.getItem('lm:ui')")` 读。

**三、别看元素在不在 DOM，要看它可不可见。**
响应式隐藏常走 `lg:hidden` / `hidden`，元素**一直在 DOM 里**，`exists()` 恒为 true。
窄屏用例要判「底部 Tab 出现了没有」，得查计算样式 + 高度：

```js
const visible = async (session, selector) =>
  session.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
  })()`);
```

## 已知的边界

- **两个视口都测了**：桌面 1440×1100、窄屏 375×812（含触屏模拟）。
- **拖拽只测了首页布局换位这一条**。看板与时间轴的拖拽没纳入 —— 断言只看「相对顺序
  变了没有」，不看具体落到第几位（卡片高度一变位次就脆）。这条是刻意的窄，不是漏。
- **不测性能与视觉回归**。首屏体积由 `npm run size` 把关，视觉没有基线图。
- **触屏只测了单点 tap**，没测捏合、长按、滑动。

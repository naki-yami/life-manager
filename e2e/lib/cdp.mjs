/**
 * 极简 CDP 客户端。
 *
 * 只包这一层是因为 CDP 的握手本身很啰嗦（WebSocket + 自增 id + pending 表），
 * 而 `.runtime/` 下那 20 多个 verify-*.mjs 每个都把这套抄了一遍 —— 抄到第五遍就该收口了。
 *
 * 用法：
 *   const session = await openSession(endpoint);
 *   await session.navigate('/tasks');
 *   const h1 = await session.text('h1');
 *   await session.close();
 */
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export { delay };

/** 页面里跑一段表达式，取回 by-value 的结果 */
const DEFAULT_TIMEOUT_MS = 15_000;

export async function openSession(endpoint, target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('连 CDP WebSocket 超时')), 10_000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('CDP WebSocket 报错'));
    });
  });

  let nextId = 0;
  const pending = new Map();
  /** 页面上下文里冒出来的异常与 console.error —— 冒烟的第一条断言就是「这里必须是空的」 */
  const pageErrors = [];
  const consoleErrors = [];
  let currentUrl = target.url;

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, timer } = pending.get(msg.id);
      clearTimeout(timer);
      pending.delete(msg.id);
      resolve(msg);
      return;
    }
    // 事件流：CDP 的异常在 Runtime.exceptionThrown，页面自己 console.error 在 Runtime.consoleAPICalled
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params?.exceptionDetails;
      pageErrors.push(d?.exception?.description ?? d?.text ?? '未知异常');
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      consoleErrors.push(
        (msg.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' '),
      );
    } else if (msg.method === 'Page.frameNavigated' && !msg.params?.frame?.parentId) {
      currentUrl = msg.params.frame.url;
    }
  });

  function send(method, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP ${method} 超时（${timeoutMs}ms）`));
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** 跑表达式。异常会抛出来 —— 静默吞掉 exceptionDetails 是历史脚本最大的坑。 */
  async function evaluate(expression, { awaitPromise = true } = {}) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
      userGesture: true,
    });
    const details = res.result?.exceptionDetails;
    if (details) {
      const text = details.exception?.description ?? details.text ?? JSON.stringify(details);
      throw new Error(`页面内求值抛异常：${text}\n表达式：${expression.slice(0, 300)}`);
    }
    return res.result?.result?.value;
  }

  const session = {
    ws,
    send,
    evaluate,
    pageErrors,
    consoleErrors,
    get url() {
      return currentUrl;
    },

    async enable() {
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Log.enable');
    },

    /**
     * 设设备视口。
     *
     * `mobile: true` 时顺带开触屏模拟 —— 少了 `setTouchEmulationEnabled`，
     * `Input.dispatchTouchEvent` 派发的事件坐标会被当成鼠标坐标处理，
     * 命中测试的结果和真机对不上。只改视口宽度不算「模拟手机」。
     */
    async setViewport({ width = 1440, height = 1100, scale = 1, mobile = false } = {}) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: scale,
        mobile,
      });
      await send('Emulation.setTouchEmulationEnabled', {
        enabled: mobile,
        maxTouchPoints: 1,
      });
    },

    /** 跳到指定地址并等页面稳定 */
    async goto(url, { waitMs = 1200 } = {}) {
      await send('Page.navigate', { url });
      await session.waitForLoad();
      await delay(waitMs);
    },

    /**
     * 等 document.readyState === 'complete'。
     *
     * 不用 Page.loadEventFired 事件是因为它还依赖事件订阅的时序；
     * 轮询 readyState 笨一点，但和「什么时候能点按钮」这件事完全一致。
     */
    async waitForLoad({ timeoutMs = 20_000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const state = await evaluate('document.readyState').catch(() => null);
        if (state === 'complete') return;
        if (Date.now() >= deadline) throw new Error('等页面 load 超时');
        await delay(150);
      }
    },

    /** 文字内容（trim 过）。找不到元素返回 null 而不是抛。 */
    async text(selector) {
      return evaluate(
        `(() => { const n = document.querySelector(${JSON.stringify(selector)}); return n ? n.textContent.replace(/\\s+/g, ' ').trim() : null; })()`,
      );
    },

    async attr(selector, name) {
      return evaluate(
        `(() => { const n = document.querySelector(${JSON.stringify(selector)}); return n ? n.getAttribute(${JSON.stringify(name)}) : null; })()`,
      );
    },

    async count(selector) {
      return evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
    },

    async exists(selector) {
      return evaluate(`document.querySelector(${JSON.stringify(selector)}) !== null`);
    },

    /** 点按 aria-label 精确匹配的按钮/复选框 */
    async clickByLabel(label) {
      return session.evaluate(
        `(() => { const b = [...document.querySelectorAll('button,input,[role="button"]')].find(n => n.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!b) return 'MISS'; b.click(); return 'OK'; })()`,
      );
    },

    /** 点按文本精确匹配的按钮 */
    async clickByText(text) {
      return session.evaluate(
        `(() => { const b = [...document.querySelectorAll('button')].find(n => n.textContent.trim() === ${JSON.stringify(text)}); if (!b) return 'MISS'; b.click(); return 'OK'; })()`,
      );
    },

    /**
     * 往受控输入框写值。
     *
     * React 在 root 上代理了 value setter，直接赋 `node.value = x` 不会触发 onChange。
     * 必须拿到原型上的原生 setter 调一次，再派发 input 事件。
     */
    async fill(selector, value) {
      return session.evaluate(
        `(() => {
          const n = document.querySelector(${JSON.stringify(selector)});
          if (!n) return 'MISS';
          const proto = n instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(n, ${JSON.stringify(value)});
          n.dispatchEvent(new Event('input', { bubbles: true }));
          return 'OK';
        })()`,
      );
    },

    /** 用 CDP 派发键盘事件（比合成 KeyboardEvent 更接近真按键，React 的合成事件能收到） */
    async key(key, { code, windowsVirtualKeyCode, modifiers = 0 } = {}) {
      const base = { key, code: code ?? key, modifiers, windowsVirtualKeyCode };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },

    /**
     * 把元素滚进视口，返回它在视口里的中心坐标。
     *
     * **这是鼠标/触屏用例的前置，不是可选的。**
     *
     * CDP 的 `Input.dispatchMouseEvent` 收的是**视口坐标**，落在视口外的坐标
     * 命不中任何元素 —— 事件会静静派发出去、页面毫无反应，用例却看不出哪里错了。
     * 首页 12 个仪表盘卡片的总高度远超 1100 的视口，排在后面的手柄 y 值能到 2400+，
     * 不先滚进来，拖拽必然失败且失败得毫无线索。
     *
     * `block: 'center'` 而不是默认的 `'start'`：贴边时元素可能被固定定位的顶栏
     * 或底部 Tab 盖住，命中测试会打到覆盖层上。
     */
    async scrollIntoView(selector, { nth = 0 } = {}) {
      await evaluate(
        `(() => {
          const n = document.querySelectorAll(${JSON.stringify(selector)})[${nth}];
          if (!n) return 'MISS';
          n.scrollIntoView({ block: 'center', inline: 'center' });
          return 'OK';
        })()`,
      );
      // 滚动是异步的（平滑滚动 / 布局重排），等一帧再取坐标
      await delay(250);
      return evaluate(
        `(() => {
          const n = document.querySelectorAll(${JSON.stringify(selector)})[${nth}];
          if (!n) return null;
          const r = n.getBoundingClientRect();
          return {
            x: Math.round(r.x + r.width / 2),
            y: Math.round(r.y + r.height / 2),
            inView: r.top >= 0 && r.bottom <= window.innerHeight,
          };
        })()`,
      );
    },

    /** 派发一次真实的鼠标左键点击（真事件流，不是 DOM 的 .click()） */
    async mouseClick(x, y) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
        button: 'none',
        buttons: 0,
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 1,
        buttons: 1,
      });
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount: 1,
        buttons: 0,
      });
    },

    /**
     * 把某个 aria-label 的元素拖到相对偏移处（相对位移，不是绝对落点）。
     *
     * 三个必须这么做的理由：
     *
     * 1. **必须先滚进视口**，理由见 `scrollIntoView`；
     * 2. **必须分步移动**。@dnd-kit 的 PointerSensor 配了
     *    `activationConstraint: { distance: 4 }` —— 按下之后位移要超过 4px
     *    才被认成拖拽，否则算点击。一步跳到终点时，第一个 move 事件就跑完了
     *    整段距离，dnd-kit 有时会把它当成「点了但没动」；分步还能让 dnd-kit 的
     *    碰撞检测每步都算一次，落点才对得上。
     * 3. **运动轨迹是相对位移**。用「往下拖过一个卡片的高度」而不是「拖到第 3 格」，
     *    卡片高度一变用例不会跟着碎。断言也应该只看相对顺序变了没有。
     *
     * 返回 `{ from, to, handle }`，方便用例在做断言时把实际落点写进失败信息。
     */
    async dragByLabel(label, { dx = 0, dy = 300, steps = 10, beforeMs = 150 } = {}) {
      const sel = `[aria-label=${JSON.stringify(label)}]`;
      const rect = await session.scrollIntoView(sel);
      if (!rect) return { ok: false, reason: 'MISS' };
      if (!rect.inView) return { ok: false, reason: 'OUT_OF_VIEW', rect };

      const { x, y } = rect;
      const stepX = dx / steps;
      const stepY = dy / steps;

      // 先 hover 一下：让 dnd-kit / 浏览器的 pointer 状态与真鼠标一致
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
        button: 'none',
        buttons: 0,
      });
      await delay(60);

      await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 1,
        buttons: 1,
      });
      await delay(beforeMs);

      // 头两步小步走，稳稳跨过 4px 的激活阈值
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: x + Math.sign(dx) * 2,
        y: y + Math.sign(dy) * 6,
        button: 'left',
        buttons: 1,
      });
      await delay(70);

      for (let i = 1; i <= steps; i += 1) {
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: Math.round(x + stepX * i),
          y: Math.round(y + stepY * i),
          button: 'left',
          buttons: 1,
        });
        await delay(55);
      }

      const to = { x: Math.round(x + dx), y: Math.round(y + dy) };
      await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: to.x,
        y: to.y,
        button: 'left',
        clickCount: 1,
        buttons: 0,
      });
      await delay(700);

      return { ok: true, from: { x, y }, to, handle: label };
    },

    /**
     * 触屏点一下某个 aria-label 的元素。
     *
     * 走 `Input.dispatchTouchEvent` 而不是 DOM 的 `.click()`：前者会经过浏览器的
     * 命中测试与合成，能被 pointerdown/pointerup 与 click 两条链路同时收到；
     * 后者只发一个 click，验不出「触屏能不能点」。
     */
    async tapByLabel(label, { nth = 0 } = {}) {
      const sel = `[aria-label=${JSON.stringify(label)}]`;
      const rect = await session.scrollIntoView(sel, { nth });
      if (!rect) return { ok: false, reason: 'MISS' };
      if (!rect.inView) return { ok: false, reason: 'OUT_OF_VIEW', rect };

      const { x, y } = rect;
      await send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1 }],
      });
      await delay(60);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await delay(400);

      return { ok: true, at: { x, y } };
    },

    /** 按文本或标签点，命中后回报实际匹配到的那个 */
    async clickFirst(selector) {
      return session.evaluate(
        `(() => { const n = document.querySelector(${JSON.stringify(selector)}); if (!n) return 'MISS'; n.click(); return 'OK'; })()`,
      );
    },

    /** 截图落盘，返回文件路径 */
    async screenshot(filePath, { fullPage = true } = {}) {
      const res = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: fullPage,
      });
      writeFileSync(filePath, Buffer.from(res.result.data, 'base64'));
      return filePath;
    },

    /** 截图到某个目录，文件名自动加序号更省事 */
    shotter(dir) {
      let n = 0;
      return async (name) => {
        n += 1;
        const file = join(dir, `${String(n).padStart(2, '0')}-${name}.png`);
        await session.screenshot(file);
        return file;
      };
    },

    /** 清掉已累积的错误，用于分段断言（前面某段允许报错时） */
    clearErrors() {
      pageErrors.length = 0;
      consoleErrors.length = 0;
    },

    async close() {
      try {
        ws.close();
      } catch {
        // 无所谓
      }
    },
  };

  await session.enable();
  return session;
}

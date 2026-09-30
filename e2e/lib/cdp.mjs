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

    /** 设成桌面视口。无头 Edge 默认视口偏窄，不设的话响应式布局会走移动分支。 */
    async setViewport({ width = 1440, height = 1100, scale = 1, mobile = false } = {}) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: scale,
        mobile,
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

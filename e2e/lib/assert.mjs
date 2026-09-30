/**
 * 冒烟用例的骨架：断言、注册、跑、汇总。
 *
 * 刻意不引测试框架：这套 e2e 的用例数量在两位数以内，需要的只有
 * 「断言 + 分组 + 退出码 + 失败时能定位到哪一行」，vitest 那套 watch/快照/覆盖率
 * 一条都用不上，而它会让 e2e 跟单测跑在同一个进程模型里（jsdom 与真浏览器混跑容易互相污染）。
 */

const COLORS = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
};

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (color, text) => (supportsColor ? `${COLORS[color]}${text}${COLORS.reset}` : text);

/** 断言失败：抛出去被 runner 接住，记录成一条 failed */
export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

export const assert = {
  ok(value, message) {
    if (!value) throw new AssertionError(message ?? `期望真值，实际是 ${JSON.stringify(value)}`);
  },

  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new AssertionError(
        `${message ?? '值不相等'}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`,
      );
    }
  },

  notEqual(actual, unexpected, message) {
    if (actual === unexpected) {
      throw new AssertionError(`${message ?? '值不该相等'}：两边都是 ${JSON.stringify(actual)}`);
    }
  },

  includes(haystack, needle, message) {
    const ok = typeof haystack === 'string' ? haystack.includes(needle) : false;
    if (!ok) {
      throw new AssertionError(
        `${message ?? '文本不包含'}：期望包含 ${JSON.stringify(needle)}，实际是 ${JSON.stringify(haystack)?.slice(0, 200)}`,
      );
    }
  },

  /** 非空字符串 */
  nonEmpty(value, message) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new AssertionError(
        `${message ?? '期望非空文本'}：实际是 ${JSON.stringify(value)}`,
      );
    }
  },

  /** 数组为空 */
  empty(list, message) {
    if (!Array.isArray(list) || list.length !== 0) {
      const sample = Array.isArray(list) ? list.slice(0, 5).join(' | ') : String(list);
      throw new AssertionError(`${message ?? '期望空数组'}：实际有 ${list?.length} 项（${sample}）`);
    }
  },

  /** CDP 里点按钮的辅助函数返回 'MISS' 表示没找到，这里把它变成一条带上下文的断言 */
  clicked(result, what) {
    if (result !== 'OK') {
      throw new AssertionError(`点不到「${what}」：页面上没找到（返回 ${result}）`);
    }
  },
};

// ------------------------------------------------------------------ 注册与运行

const cases = [];

/**
 * 注册一个用例。
 * @param {string} name 稳定的短名，`--only=<name>` 用它匹配
 * @param {string} title 人类读的标题，出现在报告里
 * @param {(ctx: object) => Promise<void>} fn
 */
export function test(name, title, fn) {
  cases.push({ name, title, fn });
}

export function getCases() {
  return cases;
}

/** 按 `--only=` 过滤；支持逗号分隔的多个名字，也支持子串匹配 */
export function selectCases(argv = process.argv.slice(2)) {
  const arg = argv.find((a) => a.startsWith('--only='));
  if (!arg) return cases;
  const wanted = arg
    .slice('--only='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return cases.filter((c) => wanted.some((w) => c.name.includes(w) || c.title.includes(w)));
}

/**
 * 跑一组用例。
 *
 * ctx 由调用方构造（通常包含 session / baseUrl / shot / launch），
 * 这样单个用例可以独立跑，不需要知道浏览器是怎么起来的。
 *
 * beforeEach 在每条用例**之前**跑（不是之后）：这样每条用例的起点都一样，
 * 一条用例失败也不会把状态留给下一条 —— 否则「单跑过、全量挂」会变成常态。
 */
export async function run(casesToRun, ctx, { keepGoing = false, beforeEach } = {}) {
  const results = { passed: 0, failed: 0, failures: [] };
  const started = Date.now();

  for (const [index, c] of casesToRun.entries()) {
    const label = `[${index + 1}/${casesToRun.length}] ${c.title}`;
    process.stdout.write(`${paint('cyan', '▶')} ${label} … `);
    const t0 = Date.now();
    try {
      if (beforeEach) await beforeEach(c, ctx);
      await c.fn(ctx);
      results.passed += 1;
      process.stdout.write(`${paint('green', '通过')} ${paint('dim', `${Date.now() - t0}ms`)}\n`);
    } catch (error) {
      const tag = error instanceof AssertionError ? '断言失败' : '执行出错';
      // 清场失败要单独标出来：那说明问题在编排，不是用例本身
      const isSetupFailure = error?.setupFailure === true;
      results.failed += 1;
      results.failures.push({ case: c, error });
      process.stdout.write(
        `${paint('red', isSetupFailure ? '清场失败' : tag)} ${paint('dim', `${Date.now() - t0}ms`)}\n`,
      );
      const detail = (error.stack ?? error.message ?? String(error))
        .split('\n')
        .slice(0, 6)
        .map((line) => `      ${paint('dim', line.trim())}`)
        .join('\n');
      process.stdout.write(`${detail}\n`);
      if (!keepGoing) break;
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write('\n');
  const summary = `通过 ${results.passed} ／ 失败 ${results.failed} ／ 共 ${casesToRun.length}，耗时 ${elapsed}s`;
  process.stdout.write(
    results.failed === 0 ? `${paint('green', summary)}\n` : `${paint('red', summary)}\n`,
  );

  return results;
}

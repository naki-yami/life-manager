// @vitest-environment node
/**
 * 冲突响应里要带**被覆盖那一份**的时间。
 *
 * 这条是实机冒烟（`npm run e2e:sync`）逼出来的：spec 写着冲突明细显示
 * 「服务端那份的时间」，但引擎里那一项恒为 `''`、服务端也从没发过它 ——
 * 于是界面上**永远**看不到那个时间。单测全绿、截图也在，但功能是缺的。
 *
 * 教训：只有把两台设备真的跑起来、去看那块界面上有什么，才发现「文档承诺的字段
 * 从来没人填」。断言「有冲突提示」是不够的 —— 还要断言那条提示**内容完整**。
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReplica } from './replica';
import { handlePush, type PushChange } from './push';

const BASE = new Date('2026-10-03T00:00:00.000Z');
const fixedClock = () => BASE;

const harness = () => {
  const { replica } = loadReplica({
    dataDir: mkdtempSync(join(tmpdir(), 'lm-replaced-')),
    now: fixedClock,
  });
  return {
    replica,
    push: (changes: PushChange[], deviceId = 'dev-A') =>
      handlePush({ replica, now: fixedClock }, { deviceId, changes }),
  };
};

const put = (record: Record<string, unknown>, baseRev: number): PushChange => ({
  module: 'tasks',
  key: 't1',
  baseRev,
  op: 'put',
  record,
});

describe('冲突响应带被覆盖那份的时间', () => {
  it('服务端那份有 updatedAt → 原样带回来', () => {
    const h = harness();
    h.push([put({ id: 't1', title: '服务端的', updatedAt: '2026-09-01T10:00:00.000Z' }, 0)]);

    // 第二台用落后的 baseRev 推 → conflict
    const result = h.push([put({ id: 't1', title: '后到的' }, 0)], 'dev-B');

    const conflict = result.results.find((r) => r.outcome === 'conflict');
    expect(conflict).toBeDefined();
    expect(conflict?.replacedAt).toBe('2026-09-01T10:00:00.000Z');
  });

  it('只有 createdAt 时用它（各模块字段不统一）', () => {
    const h = harness();
    h.push([put({ id: 't1', title: 'x', createdAt: '2026-08-15T08:30:00.000Z' }, 0)]);

    const result = h.push([put({ id: 't1', title: 'y' }, 0)], 'dev-B');

    expect(result.results.find((r) => r.outcome === 'conflict')?.replacedAt).toBe(
      '2026-08-15T08:30:00.000Z',
    );
  });

  it('自定义字段里的 ISO 时间也能兜住', () => {
    const h = harness();
    h.push([put({ id: 't1', title: 'x', happenedOn: '2026-07-01T00:00:00.000Z' }, 0)]);

    const result = h.push([put({ id: 't1', title: 'y' }, 0)], 'dev-B');

    expect(result.results.find((r) => r.outcome === 'conflict')?.replacedAt).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });

  it('记录里没有任何时间字段 → 空串，**不编一个时间出来**', () => {
    const h = harness();
    h.push([put({ id: 't1', title: '没有时间的记录' }, 0)]);

    const result = h.push([put({ id: 't1', title: 'y' }, 0)], 'dev-B');

    expect(result.results.find((r) => r.outcome === 'conflict')?.replacedAt).toBe('');
  });

  it('删掉别人的版本也算冲突，同样带时间', () => {
    const h = harness();
    h.push([put({ id: 't1', title: 'x', updatedAt: '2026-06-01T00:00:00.000Z' }, 0)]);

    // dev-B 用一个落后的 baseRev 删 → conflict
    const result = h.push([{ module: 'tasks', key: 't1', baseRev: 0, op: 'delete' }], 'dev-B');

    expect(result.results.find((r) => r.outcome === 'conflict')?.replacedAt).toBe(
      '2026-06-01T00:00:00.000Z',
    );
  });

  it('**非冲突**的结果不带这个字段（别让它出现在 toEqual 里污染断言）', () => {
    const h = harness();
    const applied = h.push([put({ id: 't1', title: 'x' }, 0)]);

    expect(applied.results[0]).not.toHaveProperty('replacedAt');

    // 同内容重推是 noop，也不该带
    const noop = h.push([put({ id: 't1', title: 'x' }, 1)]);
    expect(noop.results[0]?.outcome).toBe('noop');
    expect(noop.results[0]).not.toHaveProperty('replacedAt');
  });
});

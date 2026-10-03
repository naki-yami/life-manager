// @vitest-environment node
/**
 * 设备的「还活着」判据两侧都要刷（§11）。
 *
 * 实测发现的不对称：`lastSeenAt` 只由 **push** 刷新，而 `isDormant` 只看它。
 * 于是「定期同步、但本地一直没改动」的设备（客户端引擎在没有 diff 时会跳过 push）
 * 会被**永远**判成休眠 —— 每次同步都重下一份全量快照，而且自己好不了。
 *
 * 另一半对称性（只推不拉）在 `trim.test.ts` 里：那会让水位钉住、日志涨。
 * 两件事的根因是同一个 —— 「谁算这台设备还活着」没想全。
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReplica } from './replica';
import { handlePush, type PushChange } from './push';
import { recordPullProgress, readChanges } from './changes';
import { DORMANT_DAYS, deviceNeedsFullResync } from './tombstones';

const BASE = new Date('2026-10-03T00:00:00.000Z');
const days = (n: number) => new Date(BASE.getTime() + n * 24 * 60 * 60 * 1000);

const harness = () => {
  const { replica } = loadReplica({
    dataDir: mkdtempSync(join(tmpdir(), 'lm-live-')),
    now: () => BASE,
  });
  return {
    replica,
    push: (changes: PushChange[], deviceId = 'dev-A') =>
      handlePush({ replica, now: () => BASE }, { deviceId, changes }),
  };
};

const put = (key: string): PushChange => ({
  module: 'tasks',
  key,
  baseRev: 0,
  op: 'put',
  record: { id: key, title: key },
});

describe('只拉不推的设备不该被判成休眠', () => {
  it('设备推过一次之后长期只拉 → 不会被要求全量对账', () => {
    const h = harness();
    h.push([put('t1')]); // 登记设备

    // 它此后每 10 天只拉一次，从不推（本地没改动）
    for (let day = 10; day <= 200; day += 10) {
      recordPullProgress(h.replica, 'dev-A', h.replica.envelope.sync.seq, days(day));
      const needs = deviceNeedsFullResync(h.replica.envelope, 'dev-A', () => days(day));
      expect(needs, `第 ${day} 天不该判成休眠（它一直在拉）`).toBe(false);
    }
  });

  it('拉取会刷新 lastSeenAt（这就是它不会休眠的原因）', () => {
    const h = harness();
    h.push([put('t1')]);
    const device = h.replica.envelope.sync.devices[0]!;
    expect(device.lastSeenAt).toBe(BASE.toISOString());

    recordPullProgress(h.replica, 'dev-A', 1, days(30));

    expect(device.lastSeenAt).toBe(days(30).toISOString());
  });

  it('真的 91 天没推也没拉 → 仍然算休眠（别把守卫弄没了）', () => {
    const h = harness();
    h.push([put('t1')]);

    expect(deviceNeedsFullResync(h.replica.envelope, 'dev-A', () => days(DORMANT_DAYS + 1))).toBe(
      true,
    );
  });

  it('过期的设备来拉 → 走全量对账分支，拉完就自愈', () => {
    const h = harness();
    h.push([put('t1')]);

    // 91 天后它来拉：先被判休眠
    const stale = readChanges(h.replica, { since: 0, limit: 100, deviceId: 'dev-A' }, () =>
      days(91),
    );
    expect(stale.needFullResync).toBe(true);

    // 走过全量对账之后（引擎会 commit 并刷新），它不再被要求重来
    recordPullProgress(h.replica, 'dev-A', h.replica.envelope.sync.seq, days(91));
    expect(deviceNeedsFullResync(h.replica.envelope, 'dev-A', () => days(92))).toBe(false);
  });
});

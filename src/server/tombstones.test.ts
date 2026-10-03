// @vitest-environment node
/**
 * 墓碑与休眠设备的验收（工单 05）。
 *
 * 只测外部行为：删一条之后墓碑在不在、清理守卫放不放行、水位推到哪里、日志裁剩什么、
 * 休眠设备拉取时拿到什么。不测内部函数名。
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReplica } from './replica';
import { handlePush, type PushChange } from './push';
import { readChanges } from './changes';
import {
  DORMANT_DAYS,
  TOMBSTONE_MAX_AGE_DAYS,
  clearTombstone,
  deviceNeedsFullResync,
  isDormant,
  purgeTombstones,
  tombstoneSeq,
} from './tombstones';

const BASE = new Date('2026-10-03T00:00:00.000Z');
const fixedClock = () => BASE;
const days = (n: number) => new Date(BASE.getTime() + n * 24 * 60 * 60 * 1000);

const makeHarness = () => {
  const { replica } = loadReplica({
    dataDir: mkdtempSync(join(tmpdir(), 'lm-tomb-')),
    now: fixedClock,
  });
  return {
    replica,
    push: (changes: PushChange[], deviceId = 'dev-A') =>
      handlePush({ replica, now: fixedClock }, { deviceId, changes }),
  };
};

const put = (key: string, baseRev = 0): PushChange => ({
  module: 'tasks',
  key,
  baseRev,
  op: 'put',
  record: { id: key, title: key },
});
const del = (key: string, baseRev: number): PushChange => ({
  module: 'tasks',
  key,
  baseRev,
  op: 'delete',
});

describe('墓碑的产生', () => {
  it('删一条整记录 → 记一条墓碑', () => {
    const h = makeHarness();
    h.push([put('t1')]);
    h.push([del('t1', 1)]);

    expect(h.replica.envelope.sync.tombstones).toHaveLength(1);
    expect(h.replica.envelope.sync.tombstones[0]).toMatchObject({ module: 'tasks', key: 't1' });
    expect(h.replica.envelope.sync.tombstones[0]!.deletedAt).toBe(BASE.toISOString());
  });

  it('删一条不存在的记录 → 不记墓碑（noop）', () => {
    const h = makeHarness();
    h.push([del('不存在', 0)]);

    expect(h.replica.envelope.sync.tombstones).toEqual([]);
  });

  /**
   * 打卡（习惯记录内部的日期映射）与饮水（日期键映射）**不产生墓碑** ——
   * 它们的一次删除只是该单元的字段变更，墓碑只服务于「整条记录」的删除。
   */
  it('删饮水的一个日期键 → 不记墓碑（keyed 模块不是整记录）', () => {
    const h = makeHarness();
    h.push([
      {
        module: 'dietWater',
        key: '2026-10-02',
        baseRev: 0,
        op: 'put',
        record: { '2026-10-02': 8 },
      },
    ]);
    h.push([{ module: 'dietWater', key: '2026-10-02', baseRev: 1, op: 'delete' }]);

    expect(h.replica.envelope.sync.tombstones).toEqual([]);
    // 但变更日志里有这条 delete（它要传出去）
    expect(h.replica.envelope.sync.changes.some((c) => c.op === 'delete')).toBe(true);
  });

  it('习惯打卡的取消只是记录的一次 put，不产生墓碑', () => {
    const h = makeHarness();
    // 打卡日志内嵌在习惯记录里，所以「取消打卡」对同步来说就是该记录被改了一次
    h.push([
      {
        module: 'habits',
        key: 'h1',
        baseRev: 0,
        op: 'put',
        record: { id: 'h1', name: '晨跑', logs: { '2026-10-01': 1 } },
      },
    ]);
    h.push([
      {
        module: 'habits',
        key: 'h1',
        baseRev: 1,
        op: 'put',
        record: { id: 'h1', name: '晨跑', logs: {} },
      },
    ]);

    expect(h.replica.envelope.sync.tombstones).toEqual([]);
    expect(h.replica.envelope.sync.changes.filter((c) => c.op === 'put')).toHaveLength(2);
  });
});

describe('墓碑的撤销（记录被写回来）', () => {
  it('删掉之后又推回来 → 墓碑被撤掉（否则下次清理会把它当该删的传出去）', () => {
    const h = makeHarness();
    h.push([put('t1')]);
    h.push([del('t1', 1)]);
    expect(h.replica.envelope.sync.tombstones).toHaveLength(1);

    // 晚到的写复活它 —— LWW 的固有语义，不是 bug
    h.push([put('t1', 2)]);

    expect(h.replica.envelope.sync.tombstones).toEqual([]);
    expect(h.replica.envelope.data.tasks).toHaveLength(1);
  });

  it('clearTombstone 对没有墓碑的记录返回 false', () => {
    const h = makeHarness();
    expect(clearTombstone(h.replica.envelope, 'tasks', '不存在')).toBe(false);
  });
});

describe('清理守卫', () => {
  it('所有设备都拉过 → 墓碑被清，水位推到它的 seq', () => {
    const h = makeHarness();
    h.push([put('t1')]);
    h.push([del('t1', 1)], 'dev-A');
    // dev-A 自己删的，lastSeq 已经到最新
    const seqOfTombstone = tombstoneSeq(h.replica.envelope, h.replica.envelope.sync.tombstones[0]!);

    const result = purgeTombstones(h.replica.envelope, { now: fixedClock });

    expect(result.purgedTombstones).toBe(1);
    expect(h.replica.envelope.sync.tombstones).toEqual([]);
    expect(h.replica.envelope.sync.purgedThroughSeq).toBe(seqOfTombstone);
  });

  it('还有设备没拉过 → 墓碑留着（不能清）', () => {
    const h = makeHarness();
    h.push([put('t1')], 'dev-A');
    h.push([del('t1', 1)], 'dev-A');
    // 另有一台设备停在很后面
    h.replica.envelope.sync.devices.push({
      deviceId: 'dev-B',
      label: '',
      lastSeenAt: BASE.toISOString(),
      lastSeq: 0,
    });

    const result = purgeTombstones(h.replica.envelope, { now: fixedClock });

    expect(result.purgedTombstones).toBe(0);
    expect(h.replica.envelope.sync.tombstones).toHaveLength(1);
    expect(h.replica.envelope.sync.purgedThroughSeq).toBe(0);
  });

  it('超过 90 天 → 即使有设备没拉过也清（防止一台设备把墓碑钉死）', () => {
    const h = makeHarness();
    h.push([put('t1')], 'dev-A');
    h.push([del('t1', 1)], 'dev-A');
    h.replica.envelope.sync.devices.push({
      deviceId: 'dev-never-returns',
      label: '',
      lastSeenAt: BASE.toISOString(),
      lastSeq: 0,
    });

    const result = purgeTombstones(h.replica.envelope, {
      now: () => days(TOMBSTONE_MAX_AGE_DAYS + 1),
    });

    expect(result.purgedTombstones).toBe(1);
  });

  it('没有可清的东西时什么都不做（不推水位，免得平白要求一堆设备全量对账）', () => {
    const h = makeHarness();
    h.push([put('t1')]);

    const result = purgeTombstones(h.replica.envelope, { now: fixedClock });

    expect(result).toMatchObject({ purgedTombstones: 0, purgedThroughSeq: 0 });
    expect(h.replica.envelope.sync.purgedThroughSeq).toBe(0);
  });
});

describe('清理时顺手裁变更日志', () => {
  it('只留 seq > 水位 的条目，水位以上一条不少', () => {
    const h = makeHarness();
    h.push([put('t1'), put('t2')]); // seq 1,2
    h.push([del('t1', 1)]); // seq 3 + 墓碑
    // dev 的 lastSeq 已到 3，所以墓碑可以清
    const before = h.replica.envelope.sync.changes.length;
    expect(before).toBe(3);

    const result = purgeTombstones(h.replica.envelope, { now: fixedClock });

    expect(result.purgedTombstones).toBe(1);
    // 水位推到 3（墓碑的 seq），所以 1..3 全被裁掉
    expect(h.replica.envelope.sync.purgedThroughSeq).toBe(3);
    expect(h.replica.envelope.sync.changes).toEqual([]);
    expect(result.trimmedChanges).toBe(3);
  });

  it('水位之后新来的变更不会被裁掉（不能把还在用的增量丢了）', () => {
    const h = makeHarness();
    h.push([put('t1')]);
    h.push([del('t1', 1)]);
    purgeTombstones(h.replica.envelope, { now: fixedClock }); // 水位到 2

    // 之后再推一条：seq 3，在水位之上
    h.push([put('t2')]);
    purgeTombstones(h.replica.envelope, { now: fixedClock }); // 没有墓碑可清 → 不动水位

    const page = readChanges(h.replica, { since: 2, limit: 100 });
    expect(page.needFullResync).toBe(false);
    expect(page.changes.map((c) => c.key)).toEqual(['t2']);
  });
});

describe('休眠设备', () => {
  it('90 天没出现算休眠', () => {
    expect(isDormant({ lastSeenAt: BASE.toISOString() }, () => days(89))).toBe(false);
    expect(isDormant({ lastSeenAt: BASE.toISOString() }, () => days(91))).toBe(true);
    expect(isDormant({ lastSeenAt: BASE.toISOString() }, () => days(DORMANT_DAYS + 1))).toBe(true);
  });

  it('没见过的新设备不算休眠（它没有本地状态，正常增量就行）', () => {
    const h = makeHarness();
    expect(deviceNeedsFullResync(h.replica.envelope, 'dev-new', () => days(500))).toBe(false);
  });

  it('休眠设备来拉 → 要求全量对账，而不是给增量', () => {
    const h = makeHarness();
    h.push([put('t1')], 'dev-A');

    const page = readChanges(h.replica, { since: 0, limit: 100, deviceId: 'dev-A' }, () =>
      days(91),
    );

    expect(page.needFullResync).toBe(true);
    expect(page.changes).toEqual([]);
  });

  it('活跃设备照常拿增量', () => {
    const h = makeHarness();
    h.push([put('t1')], 'dev-A');

    const page = readChanges(h.replica, { since: 0, limit: 100, deviceId: 'dev-A' }, () => days(1));

    expect(page.needFullResync).toBe(false);
    expect(page.changes).toHaveLength(1);
  });

  it('休眠设备回来推一条会刷新它的 lastSeenAt（下次就不休眠了）', () => {
    const h = makeHarness();
    h.push([put('t1')], 'dev-A');

    // 91 天后它回来推一条 —— push 的 now 是固定时钟，所以这里直接改设备行模拟
    h.replica.envelope.sync.devices[0]!.lastSeenAt = BASE.toISOString();
    expect(deviceNeedsFullResync(h.replica.envelope, 'dev-A', () => days(91))).toBe(true);

    handlePush(
      { replica: h.replica, now: () => days(91) },
      { deviceId: 'dev-A', changes: [put('t2')] },
    );

    expect(deviceNeedsFullResync(h.replica.envelope, 'dev-A', () => days(92))).toBe(false);
  });
});

describe('墓碑清理后的 seq 空洞（工单 05 的核心验收）', () => {
  /**
   * 原验收写「since 早于墓碑的拉取不会把它当成新增」是**恒真**的：记录已删、墓碑已清，
   * 服务端对谁都返回空，它检测不到真实失效路径。这里换成能失败的形式：
   * 构造一台 lastSeq 落在水位之前的设备 → 服务端**拒绝给增量**。
   */
  it('lastSeq 落在水位之前的设备来拉 → 被要求全量对账，而不是拿到空增量', () => {
    const h = makeHarness();
    h.push([put('t1'), put('t2')], 'dev-A');
    h.push([del('t1', 1)], 'dev-A');

    // dev-B 注册过但停在 seq 1（没见过那次删除）
    h.replica.envelope.sync.devices.push({
      deviceId: 'dev-B',
      label: '',
      lastSeenAt: BASE.toISOString(),
      lastSeq: 1,
    });
    // 清墓碑：dev-B 会挡住它，所以直接给它一个「已拉过」的 ack 来模拟它后来拉过了
    purgeTombstones(h.replica.envelope, {
      now: fixedClock,
      deviceAcks: [{ deviceId: 'dev-A', lastSeq: 99 }],
    });
    expect(h.replica.envelope.sync.purgedThroughSeq).toBeGreaterThan(0);

    // 现在 dev-B 用一个**落在水位之前**的 since 来拉
    const page = readChanges(h.replica, { since: 1, limit: 100 });

    expect(page.needFullResync).toBe(true);
    expect(page.changes).toEqual([]);
    // 关键：它与「你已是最新」可区分 —— 后者 needFullResync 为 false
    const upToDate = readChanges(h.replica, { since: h.replica.envelope.sync.seq, limit: 100 });
    expect(upToDate.needFullResync).toBe(false);
  });

  it('水位之后正常拉取不受影响', () => {
    const h = makeHarness();
    h.push([put('t1')], 'dev-A');
    h.push([del('t1', 1)], 'dev-A');
    purgeTombstones(h.replica.envelope, { now: fixedClock });
    const watermark = h.replica.envelope.sync.purgedThroughSeq;

    h.push([put('t2')], 'dev-A');
    const page = readChanges(h.replica, { since: watermark, limit: 100 });

    expect(page.needFullResync).toBe(false);
    expect(page.changes.map((c) => c.key)).toEqual(['t2']);
  });
});

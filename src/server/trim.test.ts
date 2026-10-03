// @vitest-environment node
/**
 * 变更日志的增长与裁剪（回归闸）。
 *
 * 这一组守的是一个**实测发现的无界增长**：早先的实现只在「有墓碑可清」时才裁日志，
 * 于是**只增不删**的用法（最常见的那种 —— 加的东西远多于删的）日志会一路涨到 `seq`，
 * 副本文件无界变大。3000 次写入实测留下 3000 条日志。
 *
 * 裁剪现在由 `safeWatermark` 独立驱动：只要设备都拉过了，那些条目就没用了，
 * 与有没有墓碑无关。
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReplica } from './replica';
import { handlePush, type PushChange } from './push';
import { parseChangesQuery, readChanges, recordPullProgress } from './changes';
import { purgeTombstones, safeWatermark, tombstoneSeq } from './tombstones';

const BASE = new Date('2026-10-03T00:00:00.000Z');
const fixedClock = () => BASE;
const days = (n: number) => new Date(BASE.getTime() + n * 24 * 60 * 60 * 1000);

const makeHarness = () => {
  const { replica } = loadReplica({
    dataDir: mkdtempSync(join(tmpdir(), 'lm-trim-')),
    now: fixedClock,
  });
  return {
    replica,
    /**
     * 走一遍**真实客户端的一轮**：push 之后必然 pull（客户端流程是「先推后拉」）。
     *
     * 这个顺序是关键 —— `lastSeq` 由拉取推进，不是推送。只推不拉的话设备会被
     * 当成「还没拉过」，日志就不会被裁（那也是对的：它确实还没拿到）。
     */
    pushOne: (key: string, title: string, deviceId = 'dev-A') => {
      const change: PushChange = {
        module: 'tasks',
        key,
        baseRev: 0,
        op: 'put',
        record: { id: key, title },
      };
      handlePush({ replica, now: fixedClock }, { deviceId, changes: [change] });
      // 客户端随后拉一次（就是它自己刚推的那条）
      recordPullProgress(replica, deviceId, replica.envelope.sync.seq);
      purgeTombstones(replica.envelope, { now: fixedClock });
    },
  };
};

describe('只增不删时的日志裁剪（回归闸）', () => {
  it('反复写入同一个 key、一次删除都没有 → 日志不会无界增长', () => {
    const h = makeHarness();

    for (let i = 0; i < 200; i += 1) {
      h.pushOne('t1', `第 ${i} 次`);
    }

    // 单设备场景：它自己就是唯一读者，改完自己就知道了 → 日志该被裁掉
    expect(h.replica.envelope.sync.seq).toBe(200);
    expect(h.replica.envelope.sync.changes.length).toBeLessThan(200);
    expect(h.replica.envelope.sync.purgedThroughSeq).toBeGreaterThan(0);
  });

  it('写入很多条不同的记录 → 同样不会无界增长', () => {
    const h = makeHarness();

    for (let i = 0; i < 100; i += 1) {
      h.pushOne(`t${i}`, `第 ${i} 条`);
    }

    expect(h.replica.envelope.sync.seq).toBe(100);
    expect(h.replica.envelope.sync.changes.length).toBeLessThan(100);
  });

  it('有一台设备没拉过时**不裁**（它还需要那些条目）', () => {
    const h = makeHarness();
    // dev-B 注册过但停在 0（从没拉过）
    h.replica.envelope.sync.devices.push({
      deviceId: 'dev-B',
      label: '',
      lastSeenAt: BASE.toISOString(),
      lastSeq: 0,
    });

    h.pushOne('t1', 'A 改的');

    // dev-B 还需要 → 水位不动、日志留着
    expect(h.replica.envelope.sync.purgedThroughSeq).toBe(0);
    expect(h.replica.envelope.sync.changes).toHaveLength(1);
  });

  it('那台设备拉过之后，日志才被裁', () => {
    const h = makeHarness();
    const b = {
      deviceId: 'dev-B',
      label: '',
      lastSeenAt: BASE.toISOString(),
      lastSeq: 0,
    };
    h.replica.envelope.sync.devices.push(b);
    h.pushOne('t1', 'A 改的');
    expect(h.replica.envelope.sync.changes).toHaveLength(1);

    // dev-B 拉过了（lastSeq 跟上）
    b.lastSeq = h.replica.envelope.sync.seq;
    purgeTombstones(h.replica.envelope, { now: fixedClock });

    expect(h.replica.envelope.sync.purgedThroughSeq).toBe(h.replica.envelope.sync.seq);
    expect(h.replica.envelope.sync.changes).toEqual([]);
  });

  it('休眠设备不把水位钉死（否则一台卖掉的设备会让文件永远涨）', () => {
    const h = makeHarness();
    h.replica.envelope.sync.devices.push({
      deviceId: 'dev-卖掉了',
      label: '',
      lastSeenAt: BASE.toISOString(),
      lastSeq: 0,
    });
    // 91 天后：那台设备算休眠，不该再挡着裁剪
    for (let i = 0; i < 5; i += 1) {
      handlePush(
        { replica: h.replica, now: () => days(91) },
        {
          deviceId: 'dev-A',
          changes: [
            {
              module: 'tasks',
              key: `t${i}`,
              baseRev: 0,
              op: 'put',
              record: { id: `t${i}`, title: 'x' },
            },
          ],
        },
      );
      // 活跃设备随后拉一次（真实客户端流程是「先推后拉」）
      recordPullProgress(h.replica, 'dev-A', h.replica.envelope.sync.seq);
      purgeTombstones(h.replica.envelope, { now: () => days(91) });
    }

    expect(h.replica.envelope.sync.purgedThroughSeq).toBeGreaterThan(0);
    expect(h.replica.envelope.sync.changes.length).toBeLessThan(5);
  });
});

describe('safeWatermark', () => {
  it('没有设备时等于当前 seq（没人需要这些条目）', () => {
    const h = makeHarness();
    h.replica.envelope.sync.seq = 42;
    expect(safeWatermark(h.replica.envelope, fixedClock)).toBe(42);
  });

  it('取未休眠设备里最小的 lastSeq', () => {
    const h = makeHarness();
    h.replica.envelope.sync.seq = 10;
    h.replica.envelope.sync.devices.push(
      { deviceId: 'a', label: '', lastSeenAt: BASE.toISOString(), lastSeq: 7 },
      { deviceId: 'b', label: '', lastSeenAt: BASE.toISOString(), lastSeq: 3 },
    );
    expect(safeWatermark(h.replica.envelope, fixedClock)).toBe(3);
  });

  it('休眠设备不参与（否则水位被它钉在 0）', () => {
    const h = makeHarness();
    h.replica.envelope.sync.seq = 10;
    h.replica.envelope.sync.devices.push(
      { deviceId: 'active', label: '', lastSeenAt: BASE.toISOString(), lastSeq: 8 },
      { deviceId: 'dormant', label: '', lastSeenAt: days(-200).toISOString(), lastSeq: 0 },
    );
    expect(safeWatermark(h.replica.envelope, fixedClock)).toBe(8);
  });
});

describe('裁剪不误伤还在用的增量', () => {
  it('水位以上的条目一条不少', () => {
    const h = makeHarness();
    const b = { deviceId: 'dev-B', label: '', lastSeenAt: BASE.toISOString(), lastSeq: 0 };
    h.replica.envelope.sync.devices.push(b);
    h.pushOne('t1', 'A');
    h.pushOne('t2', 'B');
    h.pushOne('t3', 'C');
    // 三条都在（B 没拉过）
    expect(h.replica.envelope.sync.changes).toHaveLength(3);

    // B 拉到第 2 条
    b.lastSeq = 2;
    purgeTombstones(h.replica.envelope, { now: fixedClock });

    // 水位到 2 → 只剩第 3 条
    expect(h.replica.envelope.sync.purgedThroughSeq).toBe(2);
    expect(h.replica.envelope.sync.changes.map((c) => c.key)).toEqual(['t3']);
  });
});

/**
 * 墓碑的 `seq` **记在墓碑上**，不靠回头查日志。
 *
 * 原实现用 `.find()` 在日志里找第一条 module+key 匹配的 delete：删→复活→再删之后
 * 同一个 key 有两条 delete，拿到的是**旧的那条**（实测真实 seq 4、查出来 2），
 * 墓碑因此显得比实际更早「已被所有设备拉过」；日志被裁到水位以下后更只能退回 0。
 */
describe('墓碑自己的 seq', () => {
  const push = (changes: PushChange[]) =>
    handlePush({ replica: changes as never, now: fixedClock } as never, {} as never);

  it('删→复活→再删之后，墓碑带的是**第二次**删除的 seq', () => {
    const h = makeHarness();
    const seqOf = (changes: PushChange[]) =>
      handlePush({ replica: h.replica, now: fixedClock }, { deviceId: 'dev-A', changes });

    seqOf([
      { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: { id: 't1', title: 'v1' } },
    ]);
    seqOf([{ module: 'tasks', key: 't1', baseRev: 1, op: 'delete' }]);
    seqOf([
      { module: 'tasks', key: 't1', baseRev: 2, op: 'put', record: { id: 't1', title: 'v2' } },
    ]);
    seqOf([{ module: 'tasks', key: 't1', baseRev: 3, op: 'delete' }]);

    const tombstone = h.replica.envelope.sync.tombstones[0]!;
    expect(tombstone.seq).toBe(4);
    expect(tombstoneSeq(h.replica.envelope, tombstone)).toBe(4);
    void push;
  });

  it('日志被裁掉之后仍然知道自己的 seq（老实现只能退回 0）', () => {
    const h = makeHarness();
    handlePush(
      { replica: h.replica, now: fixedClock },
      {
        deviceId: 'dev-A',
        changes: [
          { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: { id: 't1', title: 'v1' } },
        ],
      },
    );
    handlePush(
      { replica: h.replica, now: fixedClock },
      { deviceId: 'dev-A', changes: [{ module: 'tasks', key: 't1', baseRev: 1, op: 'delete' }] },
    );
    const tombstone = h.replica.envelope.sync.tombstones[0]!;

    // 把日志清空（模拟已裁到水位以下）
    h.replica.envelope.sync.changes = [];

    expect(tombstone.seq).toBeGreaterThan(0);
    expect(tombstoneSeq(h.replica.envelope, tombstone)).toBe(tombstone.seq);
  });

  it('老副本（墓碑没有 seq 字段）退回日志，取**最后一条**匹配的 delete', () => {
    const h = makeHarness();
    h.replica.envelope.sync.seq = 5;
    h.replica.envelope.sync.changes = [
      { seq: 2, module: 'tasks', key: 't1', rev: 2, op: 'delete' },
      { seq: 4, module: 'tasks', key: 't1', rev: 4, op: 'delete' },
    ];
    const legacy = { module: 'tasks', key: 't1', rev: 4, deletedAt: BASE.toISOString() } as never;

    // 取最后一条（4），不是第一条（2）
    expect(tombstoneSeq(h.replica.envelope, legacy)).toBe(4);
  });
});

/**
 * `since` 夹进 `[0, seq]`。
 *
 * 客户端可以传任意有限正数。`since=1e15` 会被收进 `nextSince`、写进设备的 `lastSeq`、
 * 把 `safeWatermark` 抬到 1e15 —— 水位永久钉死，此后每次拉取都被判成「落后于水位」、
 * 强制全量对账。一条数据都不丢，却让同步永远退化成全量。
 */
describe('乱传的 since 不会污染水位', () => {
  it('since 超过 seq 时被夹到 seq', () => {
    const h = makeHarness();
    h.pushOne('t1', 'x');
    const seq = h.replica.envelope.sync.seq;

    const page = readChanges(h.replica, { since: 1e15, limit: 100 });

    expect(page.needFullResync).toBe(false);
    expect(page.nextSince).toBe(seq);
  });

  it('用夹过的值推进设备进度 → 水位不会被抬到天文数字', () => {
    const h = makeHarness();
    h.pushOne('t1', 'x');
    const page = readChanges(h.replica, { since: 1e15, limit: 100 });

    recordPullProgress(h.replica, 'dev-A', page.nextSince);
    purgeTombstones(h.replica.envelope, { now: fixedClock });

    expect(h.replica.envelope.sync.purgedThroughSeq).toBeLessThanOrEqual(
      h.replica.envelope.sync.seq,
    );
  });

  it('负数 / 非有限值不会穿过解析层', () => {
    expect(parseChangesQuery(new URLSearchParams('since=-5')).since).toBe(0);
    expect(parseChangesQuery(new URLSearchParams('since=Infinity')).since).toBe(0);
  });
});

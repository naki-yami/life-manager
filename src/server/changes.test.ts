// @vitest-environment node
/**
 * 拉取的验收（工单 04）。
 *
 * 只测外部行为：发请求 → 看返回的变更序列、`more`、`nextSince`、以及快照的形状。
 * 分页的「不漏不重」是这一轮的核心不变量，所以专门有一组用例反复翻页比对。
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupDataSchema } from '../services/schemas';
import { loadReplica } from './replica';
import { handlePush, type PushChange } from './push';
import { DEFAULT_LIMIT, MAX_LIMIT, parseChangesQuery, readChanges, readSnapshot } from './changes';

const fixedClock = () => new Date('2026-10-03T00:00:00.000Z');

const makeHarness = () => {
  const { replica } = loadReplica({
    dataDir: mkdtempSync(join(tmpdir(), 'lm-ch-')),
    now: fixedClock,
  });
  return {
    replica,
    push: (changes: PushChange[]) =>
      handlePush({ replica, now: fixedClock }, { deviceId: 'dev-1', changes }),
  };
};

const task = (id: string, title: string): Record<string, unknown> => ({ id, title });
const put = (key: string, title: string, baseRev = 0): PushChange => ({
  module: 'tasks',
  key,
  baseRev,
  op: 'put',
  record: task(key, title),
});

describe('增量拉取：不漏不重（spec Testing 第 3 条）', () => {
  it('推 3 条后从 since=0 一次拉完，顺序等于 seq 顺序', () => {
    const h = makeHarness();
    h.push([put('t1', 'A'), put('t2', 'B'), put('t3', 'C')]);

    const page = readChanges(h.replica, { since: 0, limit: DEFAULT_LIMIT });

    expect(page.changes.map((c) => c.key)).toEqual(['t1', 't2', 't3']);
    expect(page.changes.map((c) => c.seq)).toEqual([1, 2, 3]);
    expect(page.more).toBe(false);
    expect(page.nextSince).toBe(3);
    expect(page.seq).toBe(3);
  });

  it('分页翻到底：每页 limit=2，合起来不重不漏', () => {
    const h = makeHarness();
    h.push([put('t1', 'A'), put('t2', 'B'), put('t3', 'C'), put('t4', 'D'), put('t5', 'E')]);

    const seen: string[] = [];
    let since = 0;
    let guard = 0;
    for (;;) {
      const page = readChanges(h.replica, { since, limit: 2 });
      seen.push(...page.changes.map((c) => c.key));
      since = page.nextSince;
      if (!page.more) break;
      guard += 1;
      if (guard > 10) throw new Error('分页没有终止');
    }

    expect(seen).toEqual(['t1', 't2', 't3', 't4', 't5']);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('since 恰好等于当前 seq → 空结果、more=false、nextSince 原地', () => {
    const h = makeHarness();
    h.push([put('t1', 'A')]);

    const page = readChanges(h.replica, { since: 1, limit: DEFAULT_LIMIT });

    expect(page.changes).toEqual([]);
    expect(page.more).toBe(false);
    expect(page.nextSince).toBe(1);
  });

  it('连推两批后，续传只拿到第二批', () => {
    const h = makeHarness();
    h.push([put('t1', 'A')]);
    const first = readChanges(h.replica, { since: 0, limit: DEFAULT_LIMIT });

    h.push([put('t2', 'B')]);
    const second = readChanges(h.replica, { since: first.nextSince, limit: DEFAULT_LIMIT });

    expect(second.changes.map((c) => c.key)).toEqual(['t2']);
  });

  it('noop 不产生日志条目（重推不该被当成新变更）', () => {
    const h = makeHarness();
    h.push([put('t1', 'A')]);
    h.push([put('t1', 'A')]);

    expect(h.replica.envelope.sync.changes).toHaveLength(1);
  });

  it('冲突会产生日志条目（后到者赢，前一份进历史）', () => {
    const h = makeHarness();
    h.push([put('t1', 'A')]);
    h.push([put('t1', 'B')]);

    const page = readChanges(h.replica, { since: 0, limit: DEFAULT_LIMIT });
    expect(page.changes).toHaveLength(2);
    expect(page.changes[1]!.record).toEqual(task('t1', 'B'));
  });

  it('删除也会进日志，且不带 record', () => {
    const h = makeHarness();
    h.push([put('t1', 'A')]);
    h.push([{ module: 'tasks', key: 't1', baseRev: 1, op: 'delete' }]);

    const page = readChanges(h.replica, { since: 0, limit: DEFAULT_LIMIT });
    const del = page.changes.find((c) => c.op === 'delete')!;
    expect(del).toBeDefined();
    expect(del.key).toBe('t1');
    expect(del.record).toBeUndefined();
  });

  it('keyed 模块的变更也进日志', () => {
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

    const page = readChanges(h.replica, { since: 0, limit: DEFAULT_LIMIT });
    expect(page.changes[0]).toMatchObject({ module: 'dietWater', key: '2026-10-02', op: 'put' });
  });
});

describe('查询参数解析', () => {
  it('缺省 since=0、limit=默认值', () => {
    expect(parseChangesQuery(new URLSearchParams())).toEqual({
      since: 0,
      limit: DEFAULT_LIMIT,
    });
  });

  it('非法 / 负值退回默认，不报错', () => {
    expect(parseChangesQuery(new URLSearchParams('since=abc&limit=xyz'))).toEqual({
      since: 0,
      limit: DEFAULT_LIMIT,
    });
    expect(parseChangesQuery(new URLSearchParams('since=-5&limit=-1'))).toEqual({
      since: 0,
      limit: DEFAULT_LIMIT,
    });
  });

  it('limit 有上限，防止一次把整份日志拉走', () => {
    expect(parseChangesQuery(new URLSearchParams(`limit=${MAX_LIMIT + 9999}`)).limit).toBe(
      MAX_LIMIT,
    );
  });
});

describe('快照', () => {
  it('返回整份副本：信封 + sync 段都在', () => {
    const h = makeHarness();
    h.push([put('t1', 'A')]);

    const snapshot = readSnapshot(h.replica);

    expect(snapshot.app).toBe('life-manager');
    expect(snapshot.data.tasks).toHaveLength(1);
    expect(snapshot.sync.seq).toBe(1);
    expect(snapshot.sync.changes).toHaveLength(1);
  });

  /**
   * 快照是客户端「换机首同步」的唯一路径 —— 它必须是一份**能被直接落库的合法备份**。
   * 两个 keyed 模块是最容易写成数组的地方：写成数组客户端会当「模块不在文件里」，
   * 新设备上的饮水与目标**静默变空**。
   */
  it('快照的 data 段通过客户端 backupDataSchema（能直接当备份落库）', () => {
    const h = makeHarness();
    h.push([
      put('t1', 'A'),
      {
        module: 'dietWater',
        key: '2026-10-02',
        baseRev: 0,
        op: 'put',
        record: { '2026-10-02': 8 },
      },
      {
        module: 'dietGoals',
        key: 'dietGoals',
        baseRev: 0,
        op: 'put',
        record: { calories: 2100, protein: 120 },
      },
    ]);

    const parsed = backupDataSchema.safeParse(readSnapshot(h.replica).data);
    if (!parsed.success) {
      throw new Error(`快照不是合法备份：${JSON.stringify(parsed.error.issues.slice(0, 5))}`);
    }
    expect(parsed.success).toBe(true);
  });

  it('空副本的快照也是合法备份', () => {
    const h = makeHarness();
    expect(backupDataSchema.safeParse(readSnapshot(h.replica).data).success).toBe(true);
  });
});

describe('水位（工单 05 定案的前置）', () => {
  it('since 落在水位之前 → 不给增量，要求全量对账', () => {
    const h = makeHarness();
    h.push([put('t1', 'A')]);
    // 手工推高水位（工单 05 会按清理动作维护它）
    h.replica.envelope.sync.purgedThroughSeq = 2;

    const page = readChanges(h.replica, { since: 1, limit: DEFAULT_LIMIT });

    expect(page.needFullResync).toBe(true);
    expect(page.changes).toEqual([]);
    // 关键：不能只回空数组 —— 那与「你已是最新」无法区分
    expect(page.purgedThroughSeq).toBe(2);
  });

  it('since 等于水位 → 照常给增量', () => {
    const h = makeHarness();
    h.push([put('t1', 'A')]);
    h.replica.envelope.sync.purgedThroughSeq = 1;

    const page = readChanges(h.replica, { since: 1, limit: DEFAULT_LIMIT });

    expect(page.needFullResync).toBe(false);
  });
});

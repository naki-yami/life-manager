// @vitest-environment node
/**
 * 自带备份、历史与恢复的验收（工单 06）。
 *
 * 只测外部行为：跑一次恢复之后数据变成什么、`seq` 与 rev 怎么走、磁盘上多了哪些文件。
 * 核心不变量是**恢复不倒退 `seq`** —— 它一旦破了，在线设备的增量拉取会永远返回空。
 */
import { describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReplica } from './replica';
import { handlePush, type PushChange } from './push';
import { readChanges } from './changes';
import {
  HISTORY_RETENTION_DAYS,
  MAX_DAILY_BACKUPS,
  appendHistory,
  dailyBackupName,
  historyPath,
  listBackups,
  pruneHistory,
  readHistory,
  writeDailyBackup,
} from './history';
import { restoreReplica, validateRestoreRequest } from './restore';

const BASE = new Date('2026-10-03T00:00:00.000Z');
const fixedClock = () => BASE;
const days = (n: number) => new Date(BASE.getTime() + n * 24 * 60 * 60 * 1000);

const makeHarness = () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'lm-restore-'));
  const { replica } = loadReplica({ dataDir, now: fixedClock });
  return {
    replica,
    dataDir,
    push: (changes: PushChange[]) =>
      handlePush({ replica, now: fixedClock }, { deviceId: 'dev-1', changes }),
  };
};

const put = (key: string, title: string, baseRev = 0): PushChange => ({
  module: 'tasks',
  key,
  baseRev,
  op: 'put',
  record: { id: key, title },
});

describe('请求校验（防手滑，不是鉴权）', () => {
  it('confirm 必须逐字等于 restore', () => {
    expect(validateRestoreRequest({ confirm: 'yes', source: 'history', ref: 'x' })).toMatchObject({
      status: 400,
    });
    expect(validateRestoreRequest({ source: 'history', ref: 'x' })).toMatchObject({ status: 400 });
    expect(validateRestoreRequest({ confirm: 'restore', source: 'history', ref: 'x' })).toBeNull();
  });

  it('source 只能是 backup 或 history', () => {
    expect(
      validateRestoreRequest({ confirm: 'restore', source: 'whatever', ref: 'x' }),
    ).toMatchObject({ status: 400 });
  });

  it('ref 必须是非空字符串', () => {
    expect(
      validateRestoreRequest({ confirm: 'restore', source: 'history', ref: '' }),
    ).toMatchObject({ status: 400 });
    expect(validateRestoreRequest({ confirm: 'restore', source: 'history' })).toMatchObject({
      status: 400,
    });
  });

  it('缺确认参数时恢复被拒，副本不变', () => {
    const h = makeHarness();
    h.push([put('t1', 'A')]);
    const before = JSON.stringify(h.replica.envelope.data);

    const result = restoreReplica(
      h.replica,
      { source: 'history', ref: 'x' },
      h.dataDir,
      fixedClock,
    );

    expect(result.ok).toBe(false);
    expect(JSON.stringify(h.replica.envelope.data)).toBe(before);
  });
});

describe('每日备份', () => {
  it('写一份带日期的文件，文件名就是那一天', () => {
    const h = makeHarness();
    h.push([put('t1', 'A')]);

    const { name } = writeDailyBackup(h.dataDir, h.replica.envelope, BASE);

    expect(name).toBe(dailyBackupName(BASE));
    expect(listBackups(h.dataDir)).toEqual([name]);
  });

  it('同一天重复调用只覆盖那一份（一天开十次服务不该攒十份）', () => {
    const h = makeHarness();
    writeDailyBackup(h.dataDir, h.replica.envelope, BASE);
    writeDailyBackup(h.dataDir, h.replica.envelope, BASE);

    expect(listBackups(h.dataDir)).toHaveLength(1);
  });

  it('超过 10 份时清掉最旧的，始终 ≤ 10', () => {
    const h = makeHarness();
    for (let day = 0; day < 12; day += 1) {
      writeDailyBackup(h.dataDir, h.replica.envelope, days(day));
    }

    const backups = listBackups(h.dataDir);
    expect(backups).toHaveLength(MAX_DAILY_BACKUPS);
    // 最旧的两天（day 0、day 1）已经不在了，最新的一天还在
    expect(backups).not.toContain(dailyBackupName(days(0)));
    expect(backups).not.toContain(dailyBackupName(days(1)));
    expect(backups).toContain(dailyBackupName(days(11)));
  });

  it('第 11 天的备份会把第 1 天那份挤掉', () => {
    const h = makeHarness();
    for (let day = 0; day < 10; day += 1)
      writeDailyBackup(h.dataDir, h.replica.envelope, days(day));
    expect(listBackups(h.dataDir)).toHaveLength(10);

    writeDailyBackup(h.dataDir, h.replica.envelope, days(10));

    expect(listBackups(h.dataDir)).toHaveLength(10);
    expect(listBackups(h.dataDir)).not.toContain(dailyBackupName(days(0)));
  });
});

describe('历史', () => {
  it('追加与读取', () => {
    const h = makeHarness();
    appendHistory(h.dataDir, {
      replacedAt: BASE.toISOString(),
      module: 'tasks',
      key: 't1',
      rev: 1,
      record: { id: 't1', title: '旧值' },
      reason: 'conflict',
    });

    const entries = readHistory(h.dataDir, BASE);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.record).toEqual({ id: 't1', title: '旧值' });
    // id 能用来寻址
    expect(readHistory(h.dataDir, BASE, entries[0]!.id)).toHaveLength(1);
  });

  it('超过 30 天的条目不再返回，也会被物理清掉', () => {
    const h = makeHarness();
    appendHistory(h.dataDir, {
      replacedAt: days(-40).toISOString(),
      module: 'tasks',
      key: 'old',
      rev: 1,
      record: null,
      reason: 'overwritten',
    });
    appendHistory(h.dataDir, {
      replacedAt: BASE.toISOString(),
      module: 'tasks',
      key: 'new',
      rev: 1,
      record: null,
      reason: 'overwritten',
    });

    expect(readHistory(h.dataDir, BASE)).toHaveLength(1);
    expect(pruneHistory(h.dataDir, BASE)).toBe(1);
    expect(readFileSync(historyPath(h.dataDir), 'utf8').trim().split('\n')).toHaveLength(1);
    void HISTORY_RETENTION_DAYS;
  });

  it('坏行跳过，不影响其它条目的读取', () => {
    const h = makeHarness();
    appendHistory(h.dataDir, {
      replacedAt: BASE.toISOString(),
      module: 'tasks',
      key: 'good',
      rev: 1,
      record: null,
      reason: 'conflict',
    });
    writeFileSync(
      historyPath(h.dataDir),
      `${readFileSync(historyPath(h.dataDir), 'utf8')}这不是 JSON\n`,
    );

    expect(readHistory(h.dataDir, BASE)).toHaveLength(1);
  });
});

describe('从历史恢复', () => {
  it('把被覆盖的旧版本捞回来，且 seq 不倒退', () => {
    const h = makeHarness();
    h.push([put('t1', 'v1')]);
    const beforeSeq = h.replica.envelope.sync.seq;

    // 造一条历史：t1 的 v1 被 v2 覆盖了
    const entry = appendHistory(h.dataDir, {
      replacedAt: BASE.toISOString(),
      module: 'tasks',
      key: 't1',
      rev: 1,
      record: { id: 't1', title: 'v1' },
      reason: 'conflict',
    });
    h.push([put('t1', 'v2', 1)]);
    expect(h.replica.envelope.data.tasks).toEqual([{ id: 't1', title: 'v2' }]);

    const result = restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'history', ref: entry.id },
      h.dataDir,
      fixedClock,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 数据回到那一版
    expect(h.replica.envelope.data.tasks).toEqual([{ id: 't1', title: 'v1' }]);
    // **关键：seq 前进，不倒退**
    expect(result.seq).toBeGreaterThan(beforeSeq);
  });

  it('恢复前那份副本进了 backups/（恢复错了还有退路）', () => {
    const h = makeHarness();
    h.push([put('t1', 'v1')]);
    const entry = appendHistory(h.dataDir, {
      replacedAt: BASE.toISOString(),
      module: 'tasks',
      key: 't1',
      rev: 1,
      record: { id: 't1', title: '旧' },
      reason: 'conflict',
    });

    const result = restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'history', ref: entry.id },
      h.dataDir,
      fixedClock,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(listBackups(h.dataDir)).toContain(result.safetyBackup);
    // 那份备份里是恢复**之前**的内容
    const saved = JSON.parse(
      readFileSync(join(h.dataDir, 'backups', result.safetyBackup), 'utf8'),
    ) as { data: { tasks: unknown[] } };
    expect(saved.data.tasks).toEqual([{ id: 't1', title: 'v1' }]);
  });

  it('恢复之后来拉增量的设备能拿到恢复后的那批变更', () => {
    const h = makeHarness();
    h.push([put('t1', 'v1')]);
    const entry = appendHistory(h.dataDir, {
      replacedAt: BASE.toISOString(),
      module: 'tasks',
      key: 't1',
      rev: 1,
      record: { id: 't1', title: '捞回来的' },
      reason: 'conflict',
    });
    const sinceBeforeRestore = h.replica.envelope.sync.seq;

    const result = restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'history', ref: entry.id },
      h.dataDir,
      fixedClock,
    );
    expect(result.ok).toBe(true);

    // 在线设备用恢复前的游标来拉 → 拿到恢复产生的那批变更（而不是空）
    const page = readChanges(h.replica, { since: sinceBeforeRestore, limit: 100 });
    expect(page.needFullResync).toBe(false);
    expect(page.changes.length).toBeGreaterThan(0);
    expect(page.changes[0]!.record).toEqual({ id: 't1', title: '捞回来的' });
  });

  it('从每日备份恢复：数据等于那一版', () => {
    const h = makeHarness();
    h.push([put('t1', '第一天')]);
    const { name } = writeDailyBackup(h.dataDir, h.replica.envelope, days(0));
    // 之后又改了
    h.push([put('t1', '第二天', 1)]);

    const result = restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'backup', ref: name },
      h.dataDir,
      fixedClock,
    );

    expect(result.ok).toBe(true);
    expect(h.replica.envelope.data.tasks).toEqual([{ id: 't1', title: '第一天' }]);
  });

  it('恢复不存在的备份 → 404，副本不变', () => {
    const h = makeHarness();
    h.push([put('t1', 'A')]);
    const before = JSON.stringify(h.replica.envelope.data);

    const result = restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'backup', ref: '不存在.json' },
      h.dataDir,
      fixedClock,
    );

    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(JSON.stringify(h.replica.envelope.data)).toBe(before);
  });

  it('恢复不存在的历史 → 404，副本不变', () => {
    const h = makeHarness();
    h.push([put('t1', 'A')]);
    const before = JSON.stringify(h.replica.envelope.data);

    const result = restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'history', ref: '不存在' },
      h.dataDir,
      fixedClock,
    );

    expect(result).toMatchObject({ ok: false, status: 404 });
    expect(JSON.stringify(h.replica.envelope.data)).toBe(before);
  });

  it('恢复会重建 daily 备份而不破坏已有份数上限', () => {
    const h = makeHarness();
    for (let day = 0; day < 12; day += 1)
      writeDailyBackup(h.dataDir, h.replica.envelope, days(day));
    expect(listBackups(h.dataDir)).toHaveLength(MAX_DAILY_BACKUPS);

    const entry = appendHistory(h.dataDir, {
      replacedAt: BASE.toISOString(),
      module: 'tasks',
      key: 't1',
      rev: 1,
      record: { id: 't1', title: 'x' },
      reason: 'conflict',
    });
    restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'history', ref: entry.id },
      h.dataDir,
      fixedClock,
    );

    expect(listBackups(h.dataDir).length).toBeLessThanOrEqual(MAX_DAILY_BACKUPS);
  });

  it('keyed 模块也能从历史恢复', () => {
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
    const entry = appendHistory(h.dataDir, {
      replacedAt: BASE.toISOString(),
      module: 'dietWater',
      key: '2026-10-02',
      rev: 1,
      record: { '2026-10-02': 3 },
      reason: 'conflict',
    });

    const result = restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'history', ref: entry.id },
      h.dataDir,
      fixedClock,
    );

    expect(result.ok).toBe(true);
    expect(h.replica.envelope.data.dietWater).toEqual({ '2026-10-02': 3 });
  });
});

describe('落盘', () => {
  it('备份目录不存在时自动建出来', () => {
    const h = makeHarness();
    expect(existsSync(join(h.dataDir, 'backups'))).toBe(false);

    writeDailyBackup(h.dataDir, h.replica.envelope, BASE);

    expect(existsSync(join(h.dataDir, 'backups'))).toBe(true);
    expect(readdirSync(join(h.dataDir, 'backups'))).toHaveLength(1);
  });

  it('备份文件是合法 JSON，且带 data 段', () => {
    const h = makeHarness();
    h.push([put('t1', 'A')]);
    const { name } = writeDailyBackup(h.dataDir, h.replica.envelope, BASE);

    const saved = JSON.parse(readFileSync(join(h.dataDir, 'backups', name), 'utf8')) as {
      app: string;
      data: unknown;
      sync: unknown;
    };
    expect(saved.app).toBe('life-manager');
    expect(saved.data).toBeDefined();
    expect(saved.sync).toBeDefined();
  });

  it('历史文件是 jsonl（一行一条）', () => {
    const h = makeHarness();
    mkdirSync(h.dataDir, { recursive: true });
    for (const key of ['a', 'b', 'c']) {
      appendHistory(h.dataDir, {
        replacedAt: BASE.toISOString(),
        module: 'tasks',
        key,
        rev: 1,
        record: null,
        reason: 'conflict',
      });
    }

    const lines = readFileSync(historyPath(h.dataDir), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  });
});

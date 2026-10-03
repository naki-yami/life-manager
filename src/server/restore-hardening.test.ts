// @vitest-environment node
/**
 * 恢复路径的加固回归（code review 抓到的四个缺陷）。
 *
 * 这组用例的共同点：**缺陷活了很久，正是因为没有任何用例覆盖它们**。
 * 每一条都对着一个实测复现过的失效路径。
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadReplica, REPLICA_FILE } from './replica';
import { handlePush, type PushChange } from './push';
import { appendHistory, dailyBackupName, writeDailyBackup } from './history';
import { restoreReplica } from './restore';

const BASE = new Date('2026-10-03T00:00:00.000Z');
const fixedClock = () => BASE;

const harness = () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'lm-hard-'));
  const { replica } = loadReplica({ dataDir, now: fixedClock });
  return {
    dataDir,
    replica,
    push: (changes: PushChange[], deviceId = 'dev-A') =>
      handlePush({ replica, now: fixedClock }, { deviceId, changes }),
    writeBackup: (name: string, data: unknown) => {
      mkdirSync(join(dataDir, 'backups'), { recursive: true });
      writeFileSync(join(dataDir, 'backups', name), JSON.stringify({ app: 'life-manager', data }));
    },
  };
};

const put = (key: string, title: string, baseRev = 0): PushChange => ({
  module: 'tasks',
  key,
  baseRev,
  op: 'put',
  record: { id: key, title },
});

describe('恢复源形状不合法 → 整份拒绝、一个字节都不改', () => {
  it('tasks 是对象（不是数组）→ 400，且后续 push 照常工作', () => {
    const h = harness();
    h.push([put('KEEP', '真实数据')]);
    h.writeBackup('bad.json', { tasks: { not: 'an array' } });

    const result = restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'backup', ref: 'bad.json' },
      h.dataDir,
      fixedClock,
    );

    expect(result).toMatchObject({ ok: false, status: 400 });
    // 数据一个字节没动
    expect(h.replica.envelope.data.tasks).toEqual([{ id: 'KEEP', title: '真实数据' }]);
    // 关键：后续 push 不该崩（早先这里会 records.findIndex is not a function）
    expect(() => h.push([put('NEW', '新数据')])).not.toThrow();
  });

  it('tasks 是 null → 400（早先会被接受、写进副本、让每次 push 都 500）', () => {
    const h = harness();
    h.push([put('KEEP', '真实数据')]);
    h.writeBackup('null.json', { tasks: null, dietWater: null });

    const result = restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'backup', ref: 'null.json' },
      h.dataDir,
      fixedClock,
    );

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(h.replica.envelope.data.tasks).toEqual([{ id: 'KEEP', title: '真实数据' }]);
    expect(h.replica.envelope.data.dietWater).toEqual({});
  });

  it('keyed 模块写成数组 → 400（饮水与目标都必须是对象）', () => {
    const h = harness();
    h.writeBackup('keyed-array.json', { dietWater: [{ '2026-10-02': 8 }] });
    expect(
      restoreReplica(
        h.replica,
        { confirm: 'restore', source: 'backup', ref: 'keyed-array.json' },
        h.dataDir,
        fixedClock,
      ),
    ).toMatchObject({ ok: false, status: 400 });

    h.writeBackup('goals-array.json', { dietGoals: [{ calories: 1 }] });
    expect(
      restoreReplica(
        h.replica,
        { confirm: 'restore', source: 'backup', ref: 'goals-array.json' },
        h.dataDir,
        fixedClock,
      ),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it('形状合法时照常成功（别把正常路径也挡了）', () => {
    const h = harness();
    h.writeBackup('good.json', {
      tasks: [{ id: 't1', title: '来自备份' }],
      dietWater: { '2026-10-02': 8 },
    });

    const result = restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'backup', ref: 'good.json' },
      h.dataDir,
      fixedClock,
    );

    expect(result.ok).toBe(true);
    expect(h.replica.envelope.data.tasks).toEqual([{ id: 't1', title: '来自备份' }]);
  });
});

describe('恢复一个饮水日期不能清掉其它日期', () => {
  it('三天饮水，恢复其中一天 → 其余两天原样留着', () => {
    const h = harness();
    for (const [date, glasses] of [
      ['2026-10-01', 5],
      ['2026-10-02', 8],
      ['2026-10-03', 6],
    ] as const) {
      h.push([
        { module: 'dietWater', key: date, baseRev: 0, op: 'put', record: { [date]: glasses } },
      ]);
    }
    expect(h.replica.envelope.data.dietWater).toEqual({
      '2026-10-01': 5,
      '2026-10-02': 8,
      '2026-10-03': 6,
    });

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
    // 只有 10-02 变成 3，兄弟们都在（早先这里会只剩 { '2026-10-02': 3 }）
    expect(h.replica.envelope.data.dietWater).toEqual({
      '2026-10-01': 5,
      '2026-10-02': 3,
      '2026-10-03': 6,
    });
  });

  it('目标（模块单值）仍是整块替换 —— 别把加法套到它身上', () => {
    const h = harness();
    h.push([
      {
        module: 'dietGoals',
        key: 'dietGoals',
        baseRev: 0,
        op: 'put',
        record: { calories: 2100, protein: 120 },
      },
    ]);

    const entry = appendHistory(h.dataDir, {
      replacedAt: BASE.toISOString(),
      module: 'dietGoals',
      key: 'dietGoals',
      rev: 1,
      record: { calories: 1800, protein: 90 },
      reason: 'conflict',
    });
    restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'history', ref: entry.id },
      h.dataDir,
      fixedClock,
    );

    expect(h.replica.envelope.data.dietGoals).toEqual({ calories: 1800, protein: 90 });
  });
});

describe('ref 不能跑出 backups 目录（路径穿越）', () => {
  it('..\\..\\evil.json 被拒，且不把外面那份 JSON 读进来', () => {
    const h = harness();
    const outside = resolve(h.dataDir, '..', 'evil-outside.json');
    writeFileSync(
      outside,
      JSON.stringify({ app: 'life-manager', data: { tasks: [{ id: 'INJECTED' }] } }),
    );

    const result = restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'backup', ref: join('..', '..', 'evil-outside.json') },
      h.dataDir,
      fixedClock,
    );

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(h.replica.envelope.data.tasks).toEqual([]);
    rmSync(outside, { force: true });
  });

  it('绝对路径同样被拒', () => {
    const h = harness();
    const result = restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'backup', ref: resolve(h.dataDir, REPLICA_FILE) },
      h.dataDir,
      fixedClock,
    );
    expect(result.ok).toBe(false);
  });

  it('不是本应用的 JSON 被拒（别把任意文件当备份）', () => {
    const h = harness();
    mkdirSync(join(h.dataDir, 'backups'), { recursive: true });
    writeFileSync(
      join(h.dataDir, 'backups', 'foreign.json'),
      JSON.stringify({ some: 'other app', data: { tasks: [{ id: 'X' }] } }),
    );

    const result = restoreReplica(
      h.replica,
      { confirm: 'restore', source: 'backup', ref: 'foreign.json' },
      h.dataDir,
      fixedClock,
    );

    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});

describe('副本被重建时不覆盖今天的好备份', () => {
  it('副本丢了 + 重启 → 今天的备份保持原样（别把告警的事实现一遍）', () => {
    const h = harness();
    h.push([put('t1', '真实数据')]);
    const { name } = writeDailyBackup(h.dataDir, h.replica.envelope, BASE);
    expect(readFileSync(join(h.dataDir, 'backups', name), 'utf8')).toContain('真实数据');

    // 副本文件被删（杀毒 / 用户 / 同步盘）
    rmSync(join(h.dataDir, REPLICA_FILE), { force: true });

    // 重启：loadReplica 会建一份空副本，并告警
    const warns: string[] = [];
    const { replica: fresh, created } = loadReplica({
      dataDir: h.dataDir,
      now: fixedClock,
      onWarn: (m) => warns.push(m),
    });
    expect(created).toBe(true);
    expect(warns.join('\n')).toContain('副本文件不存在');

    // 启动时的每日备份：副本刚重建 → 必须跳过
    const result = writeDailyBackup(h.dataDir, fresh.envelope, BASE, undefined, {
      skipIfExists: true,
    });

    expect(result.skipped).toBe(true);
    // 关键：今天那份备份里还是**真实数据**，没被空副本覆盖
    expect(readFileSync(join(h.dataDir, 'backups', name), 'utf8')).toContain('真实数据');
  });

  it('副本是修好的（repaired）时也跳过', () => {
    const h = harness();
    h.push([put('t1', '真实数据')]);
    const { name } = writeDailyBackup(h.dataDir, h.replica.envelope, BASE);

    // 把副本写成半截 JSON
    writeFileSync(join(h.dataDir, REPLICA_FILE), '{"app":"life-manager","schemaVer', 'utf8');
    const { repaired } = loadReplica({ dataDir: h.dataDir, now: fixedClock });
    expect(repaired).toBe(true);

    const result = writeDailyBackup(h.dataDir, h.replica.envelope, BASE, undefined, {
      skipIfExists: true,
    });

    expect(result.skipped).toBe(true);
    expect(readFileSync(join(h.dataDir, 'backups', name), 'utf8')).toContain('真实数据');
  });

  it('正常情况下（副本没重建）不传 skipIfExists，照常覆盖当天的备份', () => {
    const h = harness();
    h.push([put('t1', '第一版')]);
    writeDailyBackup(h.dataDir, h.replica.envelope, BASE);
    h.push([put('t1', '第二版', 1)]);

    // 健康路径**不传** skipIfExists —— 当天多次写入应当覆盖成最新的
    const result = writeDailyBackup(h.dataDir, h.replica.envelope, BASE);

    expect(result.skipped).toBe(false);
    const saved = readFileSync(join(h.dataDir, 'backups', dailyBackupName(BASE)), 'utf8');
    expect(saved).toContain('第二版');
    expect(existsSync(join(h.dataDir, 'backups', dailyBackupName(BASE)))).toBe(true);
  });
});

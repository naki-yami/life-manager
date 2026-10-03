// @vitest-environment node
/**
 * 副本存储的验收（工单 02）。
 *
 * 只测外部行为：载入 / 落盘之后**磁盘上的内容**变成了什么、守卫给出的结论是什么。
 * 不测内部函数名。原子性靠注入的 fs 替身测「失败后目标文件仍是上一个好版本」。
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SYNC_MODULES, SERVER_SCHEMA_VERSION } from './config';
import {
  BACKUPS_DIR,
  REPLICA_FILE,
  atomicWrite,
  checkSchemaVersion,
  emptyReplica,
  loadReplica,
  nodeFs,
  replicaPaths,
  validateRecord,
  type ReplicaEnvelope,
} from './replica';
import { createMemoryFs } from './test-memory-fs';

const tempDir = (): string => mkdtempSync(join(tmpdir(), 'lm-replica-'));
const fixedClock = () => new Date('2026-10-03T00:00:00.000Z');

describe('空目录启动', () => {
  it('没有副本文件时生成一份 seq = 0 的合法副本，并落盘', () => {
    const dir = tempDir();
    const warns: string[] = [];

    const { replica, created } = loadReplica({
      dataDir: dir,
      now: fixedClock,
      onWarn: (message) => warns.push(message),
    });

    expect(created).toBe(true);
    expect(replica.envelope.sync.seq).toBe(0);
    expect(replica.envelope.sync.purgedThroughSeq).toBe(0);
    expect(replica.envelope.schemaVersion).toBe(SERVER_SCHEMA_VERSION);
    expect(replica.envelope.app).toBe('life-manager');
    // 没有异常就没有告警（别把正常路径也喊成问题）
    expect(warns).toEqual([]);

    // 真的写到了磁盘上，且是合法 JSON
    const onDisk = JSON.parse(readFileSync(join(dir, REPLICA_FILE), 'utf8')) as ReplicaEnvelope;
    expect(onDisk.sync.seq).toBe(0);
  });

  it('data 段的键集合逐字等于 BACKUP_MODULES（23 条），不含 settings', () => {
    const { replica } = loadReplica({ dataDir: tempDir(), now: fixedClock });

    expect(Object.keys(replica.envelope.data)).toEqual([...SYNC_MODULES]);
    expect(Object.keys(replica.envelope.data)).toHaveLength(23);
    expect(Object.keys(replica.envelope.data)).not.toContain('settings');
  });

  it('再载入一次读的是磁盘上那份，不是重新生成', () => {
    const dir = tempDir();
    const first = loadReplica({ dataDir: dir, now: fixedClock });
    first.replica.envelope.sync.seq = 7;
    first.replica.save();

    const second = loadReplica({ dataDir: dir, now: fixedClock });

    expect(second.created).toBe(false);
    expect(second.replica.envelope.sync.seq).toBe(7);
  });
});

describe('结构守卫', () => {
  it('不在册的模块名被拒（settings 就是这一条）', () => {
    const result = validateRecord('settings', { id: 'x', themeMode: 'dark' });

    expect(result).toEqual({ kind: 'unknown_module', module: 'settings' });
  });

  it('id 不是非空字符串的记录被拒', () => {
    expect(validateRecord('tasks', { id: '' })).toEqual({
      kind: 'bad_record',
      module: 'tasks',
      reason: 'id 应为非空字符串',
    });
    expect(validateRecord('tasks', { id: 42 })?.kind).toBe('bad_record');
    expect(validateRecord('tasks', {})?.kind).toBe('bad_record');
  });

  it('不是对象的记录被拒（数组 / null / 标量）', () => {
    for (const bad of [[], null, 'text', 3]) {
      expect(validateRecord('tasks', bad)?.kind).toBe('bad_record');
    }
  });

  it('在册模块 + 合法 id → 放行，且不校验业务字段', () => {
    // 只有 id，没有 title / status 等 —— 服务端不该看懂业务字段
    expect(validateRecord('tasks', { id: 't1' })).toBeNull();
  });

  it('磁盘上已有副本含 settings 键时被丢掉，并告警', () => {
    const dir = tempDir();
    const dirty = {
      ...emptyReplica(),
      data: { ...emptyReplica().data, settings: [{ id: 's1', themeMode: 'dark' }] },
    };
    writeFileSync(join(dir, REPLICA_FILE), JSON.stringify(dirty), 'utf8');
    const warns: string[] = [];

    const { replica } = loadReplica({
      dataDir: dir,
      now: fixedClock,
      onWarn: (message) => warns.push(message),
    });

    expect(Object.keys(replica.envelope.data)).not.toContain('settings');
    expect(Object.keys(replica.envelope.data)).toEqual([...SYNC_MODULES]);
    expect(warns.join('\n')).toContain('不在册');
  });
});

describe('版本兼容', () => {
  it('客户端声明高于服务端支持值 → 拒绝', () => {
    expect(checkSchemaVersion(SERVER_SCHEMA_VERSION + 1)).toEqual({
      kind: 'schema_too_new',
      clientVersion: SERVER_SCHEMA_VERSION + 1,
      serverVersion: SERVER_SCHEMA_VERSION,
    });
  });

  it('等于或低于支持值 → 接受（缺字段由客户端归一化补齐）', () => {
    expect(checkSchemaVersion(SERVER_SCHEMA_VERSION)).toBeNull();
    expect(checkSchemaVersion(SERVER_SCHEMA_VERSION - 1)).toBeNull();
    expect(checkSchemaVersion(undefined)).toBeNull();
  });

  it('高版本写入被拒时，副本文件逐字节不变（连临时文件都不留）', () => {
    const dir = tempDir();
    const { replica } = loadReplica({ dataDir: dir, now: fixedClock });
    const replicaPath = join(dir, REPLICA_FILE);
    const before = readFileSync(replicaPath, 'utf8');

    // 攒一个改动，但用过高的版本号去存 —— 必须被拒，且一个字节都不落盘
    replica.envelope.sync.seq = 999;
    replica.envelope.data.tasks = [{ id: 't1', title: '不该落盘' }];
    const error = replica.saveChecked(SERVER_SCHEMA_VERSION + 1);

    expect(error).toEqual({
      kind: 'schema_too_new',
      clientVersion: SERVER_SCHEMA_VERSION + 1,
      serverVersion: SERVER_SCHEMA_VERSION,
    });
    expect(readFileSync(replicaPath, 'utf8')).toBe(before);
    // 也不该留下临时文件
    expect(existsSync(`${replicaPath}.tmp`)).toBe(false);
  });

  it('版本号合法时照常落盘', () => {
    const dir = tempDir();
    const { replica } = loadReplica({ dataDir: dir, now: fixedClock });
    replica.envelope.sync.seq = 4;

    expect(replica.saveChecked(SERVER_SCHEMA_VERSION)).toBeNull();

    const onDisk = JSON.parse(readFileSync(join(dir, REPLICA_FILE), 'utf8')) as ReplicaEnvelope;
    expect(onDisk.sync.seq).toBe(4);
  });

  it('载入比服务端新的副本：照常读进来（数据比版本标签重要），但告警', () => {
    const dir = tempDir();
    const newer = { ...emptyReplica(), schemaVersion: SERVER_SCHEMA_VERSION + 5 };
    newer.sync.seq = 8;
    newer.data.tasks = [{ id: 't1', title: '来自未来版本的记录' }];
    writeFileSync(join(dir, REPLICA_FILE), JSON.stringify(newer), 'utf8');
    const warns: string[] = [];

    const { replica } = loadReplica({
      dataDir: dir,
      now: fixedClock,
      onWarn: (message) => warns.push(message),
    });

    // 不因为版本号高就拒读 —— 那等于丢数据
    expect(replica.envelope.sync.seq).toBe(8);
    expect(replica.envelope.data.tasks).toEqual([{ id: 't1', title: '来自未来版本的记录' }]);
    expect(warns.join('\n')).toContain('高于本服务端支持');
  });
});

describe('原子写', () => {
  it('写入顺序是 temp → fsync → rename（不直接改目标文件）', () => {
    const fs = createMemoryFs();
    const target = '/data/replica.json';

    atomicWrite(fs, target, '{"a":1}');

    const temp = `${target}.tmp`;
    const order = fs.calls.map((call) => call.split(':')[0]);
    expect(order).toEqual(['writeFileSync', 'fsyncFile', 'rename']);
    expect(fs.calls[0]).toBe(`writeFileSync:${temp}`);
    expect(fs.calls[2]).toBe(`rename:${temp}->${target}`);
    expect(fs.contentOf(target)).toBe('{"a":1}');
    // 临时文件不该留下
    expect(fs.contentOf(temp)).toBeUndefined();
  });

  /**
   * **真 fs 上 fsync 必须真的成功。**
   *
   * 这条守的是一个只在 Windows 上暴露的空操作：`openSync(path,'r')` 之后再 `fsyncSync`
   * 抛 `EPERM`，而 `atomicWrite` 的 catch 是空的 —— 于是 docstring 承诺的
   * 「内容真的落盘再改名」在本平台**从来没有发生**，谁也不知道。
   *
   * 用真 fs 的 fsyncFile 跑一次：它要是抛，这条就红（而不是被静默吞掉）。
   */
  it('真 fs 上 fsync 真的成功（Windows 上只读句柄会 EPERM）', () => {
    const dir = tempDir();
    const target = join(dir, 'fsync-probe.json');
    let fsyncError: unknown = null;

    // 用真 fs（nodeFs），把 fsync 的失败暴露出来
    atomicWrite(nodeFs, target, '{"ok":true}', (error) => {
      fsyncError = error;
    });

    expect(fsyncError, `fsync 失败了：${String(fsyncError)}`).toBeNull();
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({ ok: true });
  });

  it('fsync 失败时仍不抛、且回调能看见（不支持的盘不该让写入失败）', () => {
    const fs = createMemoryFs();
    fs.fsyncFile = () => {
      throw new Error('EIO: 这个文件系统不支持 fsync');
    };
    const seen: unknown[] = [];

    // 不该抛
    expect(() =>
      atomicWrite(fs, '/data/replica.json', '{"a":1}', (e) => seen.push(e)),
    ).not.toThrow();
    // 但调用方能看见 —— 早先这个 catch 是空的
    expect(seen).toHaveLength(1);
    // 写入本身仍然成功（顺序保证了不半截）
    expect(fs.contentOf('/data/replica.json')).toBe('{"a":1}');
  });

  it('rename 前抛错 → 目标文件仍是上一个好版本，且未留下半截内容', () => {
    const fs = createMemoryFs();
    const target = '/data/replica.json';
    atomicWrite(fs, target, '{"version":"good"}');

    // 下一次写入在 rename 那一刻失败
    fs.failNextRename('磁盘满了');
    expect(() => atomicWrite(fs, target, '{"version":"half-writ')).toThrow('磁盘满了');

    // 关键：目标文件还是上一份完整内容 —— 没有半截 JSON
    expect(fs.contentOf(target)).toBe('{"version":"good"}');
  });

  it('真 fs 上写入中途失败时，副本文件仍是完整可解析的旧内容', () => {
    const dir = tempDir();
    const { replica } = loadReplica({ dataDir: dir, now: fixedClock });
    replica.envelope.sync.seq = 3;
    replica.save();
    const replicaPath = join(dir, REPLICA_FILE);
    const good = readFileSync(replicaPath, 'utf8');

    // 用真 fs 包一层，只在 rename 那一刻失败 —— 这是「写入中途被打断」最接近的模拟
    const failing = {
      ...nodeFs,
      rename: () => {
        throw new Error('注入的 rename 失败');
      },
    };
    expect(() => atomicWrite(failing, replicaPath, '{"app":"life-manager","schemaVer')).toThrow(
      '注入的 rename 失败',
    );

    // 目标文件逐字节不变，且仍能解析
    expect(readFileSync(replicaPath, 'utf8')).toBe(good);
    expect(JSON.parse(good)).toMatchObject({ sync: { seq: 3 } });
  });
});

describe('半写文件恢复', () => {
  it('副本解析失败但有 backups/ → 用最近一份好备份顶上，并告警', () => {
    const dir = tempDir();
    const { backupsDir } = replicaPaths(dir);
    mkdirSync(backupsDir, { recursive: true });

    const good = emptyReplica(fixedClock());
    good.sync.seq = 42;
    writeFileSync(
      join(backupsDir, 'replica-2026-10-01T00-00-00-000Z.json'),
      JSON.stringify(good),
      'utf8',
    );

    // 半写文件：JSON 截断
    writeFileSync(join(dir, REPLICA_FILE), '{"app":"life-manager","schemaVer', 'utf8');
    const warns: string[] = [];

    const { replica } = loadReplica({
      dataDir: dir,
      now: fixedClock,
      onWarn: (message) => warns.push(message),
    });

    expect(replica.envelope.sync.seq).toBe(42);
    expect(warns.join('\n')).toContain('备份顶上');
  });

  it('多份备份时取最近的一份（文件名按时间排序）', () => {
    const dir = tempDir();
    const { backupsDir } = replicaPaths(dir);
    mkdirSync(backupsDir, { recursive: true });

    for (const [stamp, seq] of [
      ['2026-09-30T00-00-00-000Z', 1],
      ['2026-10-02T00-00-00-000Z', 9],
      ['2026-10-01T00-00-00-000Z', 5],
    ] as const) {
      const envelope = emptyReplica(fixedClock());
      envelope.sync.seq = seq;
      writeFileSync(join(backupsDir, `replica-${stamp}.json`), JSON.stringify(envelope), 'utf8');
    }
    writeFileSync(join(dir, REPLICA_FILE), 'not json at all', 'utf8');

    const { replica } = loadReplica({ dataDir: dir, now: fixedClock });

    expect(replica.envelope.sync.seq).toBe(9);
  });

  it('副本坏了且没有可用备份 → 回退空副本，但一定告警（不静默丢数据）', () => {
    const dir = tempDir();
    writeFileSync(join(dir, REPLICA_FILE), '{{{', 'utf8');
    const warns: string[] = [];

    const { replica } = loadReplica({
      dataDir: dir,
      now: fixedClock,
      onWarn: (message) => warns.push(message),
    });

    expect(replica.envelope.sync.seq).toBe(0);
    expect(warns.join('\n')).toContain('数据可能已丢');
  });

  it('副本完整时读回来不告警、内容照旧', () => {
    const dir = tempDir();
    const { replica: first } = loadReplica({ dataDir: dir, now: fixedClock });
    first.envelope.sync.seq = 11;
    first.envelope.data.tasks = [{ id: 't1', title: '写周报' }];
    first.save();

    const warns: string[] = [];
    const { replica: second } = loadReplica({
      dataDir: dir,
      now: fixedClock,
      onWarn: (message) => warns.push(message),
    });

    expect(warns).toEqual([]);
    expect(second.envelope.sync.seq).toBe(11);
    expect(second.envelope.data.tasks).toEqual([{ id: 't1', title: '写周报' }]);
  });

  it('救援之后立刻把修好的内容写回磁盘（不留着坏文件等下次再救）', () => {
    const dir = tempDir();
    const { backupsDir } = replicaPaths(dir);
    mkdirSync(backupsDir, { recursive: true });
    const good = emptyReplica(fixedClock());
    good.sync.seq = 42;
    writeFileSync(
      join(backupsDir, 'replica-2026-10-01T00-00-00-000Z.json'),
      JSON.stringify(good),
      'utf8',
    );
    // 磁盘上是一份半写文件
    writeFileSync(join(dir, REPLICA_FILE), '{"app":"life-manager","schemaVer', 'utf8');

    loadReplica({ dataDir: dir, now: fixedClock });

    // 关键：磁盘上的副本已经不是那份坏文件了，且能正常解析
    const onDisk = JSON.parse(readFileSync(join(dir, REPLICA_FILE), 'utf8')) as ReplicaEnvelope;
    expect(onDisk.sync.seq).toBe(42);
  });

  it('「启动后副本等于那份备份」对**文件**也成立，不只是内存模型', () => {
    const dir = tempDir();
    const { backupsDir } = replicaPaths(dir);
    mkdirSync(backupsDir, { recursive: true });
    const good = emptyReplica(fixedClock());
    good.sync.seq = 7;
    good.data.tasks = [{ id: 't9', title: '备份里的记录' }];
    writeFileSync(
      join(backupsDir, 'replica-2026-10-01T00-00-00-000Z.json'),
      JSON.stringify(good),
      'utf8',
    );
    writeFileSync(join(dir, REPLICA_FILE), 'half-written garbage', 'utf8');

    loadReplica({ dataDir: dir, now: fixedClock });

    const onDisk = JSON.parse(readFileSync(join(dir, REPLICA_FILE), 'utf8')) as ReplicaEnvelope;
    expect(onDisk.sync.seq).toBe(7);
    expect(onDisk.data.tasks).toEqual([{ id: 't9', title: '备份里的记录' }]);
  });
});

describe('副本可以当备份导入的前提', () => {
  it('落盘的信封形状与备份信封一致（app / schemaVersion / exportedAt / data）', () => {
    const dir = tempDir();
    loadReplica({ dataDir: dir, now: fixedClock });

    const onDisk = JSON.parse(readFileSync(join(dir, REPLICA_FILE), 'utf8')) as Record<
      string,
      unknown
    >;

    expect(onDisk.app).toBe('life-manager');
    expect(onDisk.schemaVersion).toBe(SERVER_SCHEMA_VERSION);
    expect(typeof onDisk.exportedAt).toBe('string');
    expect(typeof onDisk.data).toBe('object');
    // sync 是副本独有的键，客户端导入路径会忽略它
    expect(typeof onDisk.sync).toBe('object');
    // STORE_VERSION 与同步无关，不该出现在副本里
    expect(JSON.stringify(onDisk)).not.toContain('storeVersion');
  });

  it('replicaPaths 指到 dataDir 下的 replica.json 与 backups/', () => {
    // 别写成 existsSync(tempDir()) —— 那是恒真的，replicaPaths 坏了也照样通过
    expect(replicaPaths('/data')).toEqual({
      replica: join('/data', REPLICA_FILE),
      backupsDir: join('/data', BACKUPS_DIR),
    });
    expect(BACKUPS_DIR).toBe('backups');
  });
});

describe('脏判定（工单 07 的去抖镜像写入靠它）', () => {
  it('刚载入是干净的；改过是脏的；改回去又干净', () => {
    const dir = tempDir();
    const { replica } = loadReplica({ dataDir: dir, now: fixedClock });

    expect(replica.isDirty()).toBe(false);

    replica.envelope.sync.seq = 1;
    expect(replica.isDirty()).toBe(true);

    replica.envelope.sync.seq = 0;
    expect(replica.isDirty()).toBe(false);
  });

  it('save() 之后必须回到干净 —— 否则镜像会每 30 秒无条件重写第二份副本', () => {
    const dir = tempDir();
    const { replica } = loadReplica({ dataDir: dir, now: fixedClock });
    replica.envelope.sync.seq = 3;

    replica.save();

    expect(replica.isDirty()).toBe(false);
    // 连存两次也一样（exportedAt 每次都变，不该被算进脏判定）
    replica.save();
    expect(replica.isDirty()).toBe(false);
  });

  it('载入再存，仍然是干净的', () => {
    const dir = tempDir();
    loadReplica({ dataDir: dir, now: fixedClock }).replica.save();

    const second = loadReplica({ dataDir: dir, now: fixedClock });
    expect(second.replica.isDirty()).toBe(false);
    second.replica.save();
    expect(second.replica.isDirty()).toBe(false);
  });
});

describe('副本读不出来时走同一条救援路径', () => {
  it('readFile 抛错（权限 / 文件锁 / 路径是目录）不会把 loadReplica 打挂', () => {
    const fs = createMemoryFs({ '/data/replica.json': '{"app":"life-manager"}' });
    fs.readFile = () => {
      throw new Error('EACCES: permission denied');
    };
    const warns: string[] = [];

    const { replica } = loadReplica({
      dataDir: '/data',
      fs,
      now: fixedClock,
      onWarn: (message) => warns.push(message),
    });

    // 没抛出去，且说清了原因
    expect(replica.envelope.sync.seq).toBe(0);
    expect(warns.join('\n')).toContain('读不出来');
  });

  it('读不出来但有备份 → 用备份顶替（与解析失败同一待遇）', () => {
    const good = emptyReplica(fixedClock());
    good.sync.seq = 77;
    const fs = createMemoryFs({
      '/data/replica.json': 'x',
      '/data/backups/replica-2026-10-02T00-00-00-000Z.json': JSON.stringify(good),
    });
    const realRead = fs.readFile.bind(fs);
    fs.readFile = (path: string) => {
      if (!path.includes('backups')) throw new Error('EBUSY: resource busy or locked');
      return realRead(path);
    };
    const warns: string[] = [];

    const { replica } = loadReplica({
      dataDir: '/data',
      fs,
      now: fixedClock,
      onWarn: (message) => warns.push(message),
    });

    expect(replica.envelope.sync.seq).toBe(77);
    expect(warns.join('\n')).toContain('备份顶上');
  });

  it('副本不存在但 backups/ 里有过东西 → 告警（仅剩的静默丢数据形状）', () => {
    const fs = createMemoryFs({ '/data/backups/replica-2026-10-01T00-00-00-000Z.json': '{}' });
    const warns: string[] = [];

    loadReplica({ dataDir: '/data', fs, now: fixedClock, onWarn: (m) => warns.push(m) });

    expect(warns.join('\n')).toContain('副本文件不存在');
  });

  it('真正首次启动（没有副本也没有备份）→ 不告警', () => {
    const warns: string[] = [];
    const { created } = loadReplica({
      dataDir: '/data',
      fs: createMemoryFs(),
      now: fixedClock,
      onWarn: (m) => warns.push(m),
    });

    expect(created).toBe(true);
    expect(warns).toEqual([]);
  });
});

describe('注入替身也能测救援路径（不再偷读真磁盘）', () => {
  it('用内存 fs 播种 backups/ 后，半写文件仍能从备份恢复', () => {
    const good = emptyReplica(fixedClock());
    good.sync.seq = 55;
    const fs = createMemoryFs({
      '/data/replica.json': '{"app":"life-manager","schemaVer',
      '/data/backups/replica-2026-10-01T00-00-00-000Z.json': JSON.stringify(good),
    });
    const warns: string[] = [];

    const { replica } = loadReplica({
      dataDir: '/data',
      fs,
      now: fixedClock,
      onWarn: (m) => warns.push(m),
    });

    expect(replica.envelope.sync.seq).toBe(55);
    expect(warns.join('\n')).toContain('备份顶上');
    // 关键：确实走了替身的 readdir，而不是真磁盘
    expect(fs.calls.some((call) => call.startsWith('readdir:'))).toBe(true);
  });

  it('内存 fs 的路径写法混用 / 与反斜杠时仍是同一份文件', () => {
    const fs = createMemoryFs({ 'C:\\data\\replica.json': '{"app":"life-manager"}' });

    expect(fs.exists('C:\\data\\replica.json')).toBe(true);
    expect(fs.exists('C:/data/replica.json')).toBe(true);
  });
});

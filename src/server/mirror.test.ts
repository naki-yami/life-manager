// @vitest-environment node
/**
 * 第二份存储与可观测的验收（工单 07）。
 *
 * 只测外部行为：镜子文件有没有出现、内容对不对、同卷时告警文案有没有、
 * 写失败时状态能不能看出来、去抖窗口是不是真的在起作用。
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReplica } from './replica';
import {
  MIRROR_FILE,
  MIRROR_DEBOUNCE_MS,
  createMirror,
  failingFs,
  fakeVolumeOf,
  mirrorHealth,
} from './mirror';
import { nodeFs } from './replica';

const tempDir = (): string => mkdtempSync(join(tmpdir(), 'lm-mirror-'));
const fixedClock = () => new Date('2026-10-03T00:00:00.000Z');

const makeHarness = (mirrorDir: string, volumeOf = fakeVolumeOf({})) => {
  const dataDir = tempDir();
  const { replica } = loadReplica({ dataDir, now: fixedClock });
  return { dataDir, replica, mirrorDir, volumeOf };
};

describe('镜子文件', () => {
  it('写入后镜子文件出现，内容与副本一致', () => {
    const mirrorDir = tempDir();
    const h = makeHarness(mirrorDir);

    const mirror = createMirror(h.replica, h.dataDir, mirrorDir, {
      volumeOf: h.volumeOf,
      now: fixedClock,
    });
    h.replica.envelope.data.tasks = [{ id: 't1', title: '写周报' }];

    expect(mirror.write()).toBe(true);

    const path = join(mirrorDir, MIRROR_FILE);
    expect(existsSync(path)).toBe(true);
    const saved = JSON.parse(readFileSync(path, 'utf8')) as { data: { tasks: unknown[] } };
    expect(saved.data.tasks).toEqual([{ id: 't1', title: '写周报' }]);
  });

  it('文件名与客户端 folderSync 的分开（同目录互不覆盖）', () => {
    // 客户端写的是 life-manager-auto-backup.json，服务端写这个
    expect(MIRROR_FILE).toBe('life-manager-server-replica.json');
    expect(MIRROR_FILE).not.toBe('life-manager-auto-backup.json');
  });

  it('mirrorDir 为空时什么都不做（那是「还没指定」，不是错误）', () => {
    const h = makeHarness('');

    const mirror = createMirror(h.replica, h.dataDir, '', {
      volumeOf: h.volumeOf,
      now: fixedClock,
    });

    expect(mirror.write()).toBe(false);
    expect(mirror.status.configured).toBe(false);
    expect(mirror.needsWrite()).toBe(false);
    expect(mirror.startupWarning()).toBeNull();
  });

  it('目录不存在时自动建出来', () => {
    const base = tempDir();
    const mirrorDir = join(base, '还没建的子目录');
    const h = makeHarness(mirrorDir);

    const mirror = createMirror(h.replica, h.dataDir, mirrorDir, {
      volumeOf: h.volumeOf,
      now: fixedClock,
    });
    expect(mirror.write()).toBe(true);

    expect(existsSync(join(mirrorDir, MIRROR_FILE))).toBe(true);
  });
});

describe('去抖', () => {
  it('第一次就该写；紧接着第二次不该写（30 秒窗口内）', () => {
    const mirrorDir = tempDir();
    const h = makeHarness(mirrorDir);
    let clock = fixedClock();
    const mirror = createMirror(h.replica, h.dataDir, mirrorDir, {
      volumeOf: h.volumeOf,
      now: () => clock,
    });

    expect(mirror.needsWrite()).toBe(true);
    mirror.write();
    // 同一时刻再问：还在窗口里
    expect(mirror.needsWrite()).toBe(false);

    // 过了去抖窗口就又可以写了
    clock = new Date(fixedClock().getTime() + MIRROR_DEBOUNCE_MS + 1);
    expect(mirror.needsWrite()).toBe(true);
  });

  it('窗口边界：刚好 30 秒时算到期', () => {
    const mirrorDir = tempDir();
    const h = makeHarness(mirrorDir);
    let clock = fixedClock();
    const mirror = createMirror(h.replica, h.dataDir, mirrorDir, {
      volumeOf: h.volumeOf,
      now: () => clock,
    });
    mirror.write();

    clock = new Date(fixedClock().getTime() + MIRROR_DEBOUNCE_MS);
    expect(mirror.needsWrite()).toBe(true);
  });
});

describe('同卷校验（ADR 那条代价）', () => {
  it('同卷 → 启动时告警', () => {
    const mirrorDir = tempDir();
    const h = makeHarness(mirrorDir);
    // 数据目录与镜子目录都在「卷 1」
    const volumeOf = fakeVolumeOf({ [h.dataDir]: 1, [mirrorDir]: 1 });

    const mirror = createMirror(h.replica, h.dataDir, mirrorDir, { volumeOf, now: fixedClock });

    const warning = mirror.startupWarning();
    expect(warning).not.toBeNull();
    expect(warning).toContain('同一卷');
    expect(mirror.status.sameVolume).toBe(true);
  });

  it('异卷 → 不告警', () => {
    const mirrorDir = tempDir();
    const h = makeHarness(mirrorDir);
    const volumeOf = fakeVolumeOf({ [h.dataDir]: 1, [mirrorDir]: 2 });

    const mirror = createMirror(h.replica, h.dataDir, mirrorDir, { volumeOf, now: fixedClock });

    expect(mirror.startupWarning()).toBeNull();
    expect(mirror.status.sameVolume).toBe(false);
  });

  it('判断不出卷号时按异卷处理（不对正常配置乱喊）', () => {
    const mirrorDir = tempDir();
    const h = makeHarness(mirrorDir);
    const volumeOf = fakeVolumeOf({});

    const mirror = createMirror(h.replica, h.dataDir, mirrorDir, { volumeOf, now: fixedClock });

    expect(mirror.startupWarning()).toBeNull();
  });

  it('未配置 mirrorDir 时不告警（那条代价还没开始付）', () => {
    const h = makeHarness('');
    const mirror = createMirror(h.replica, h.dataDir, '', {
      volumeOf: fakeVolumeOf({}),
      now: fixedClock,
    });

    expect(mirror.startupWarning()).toBeNull();
  });
});

describe('写失败不改变同步行为（ADR 回滚信号）', () => {
  it('写失败 → write 返回 false、状态里能看出来，但不抛异常', () => {
    const mirrorDir = tempDir();
    const h = makeHarness(mirrorDir);
    const mirror = createMirror(h.replica, h.dataDir, mirrorDir, {
      volumeOf: h.volumeOf,
      fs: failingFs('同步盘没开'),
      now: fixedClock,
    });

    expect(() => mirror.write()).not.toThrow();
    expect(mirror.write()).toBe(false);
    expect(mirror.status.lastError).toContain('同步盘没开');
  });

  it('写失败之后 `/v1/health` 那段能看出来', () => {
    const mirrorDir = tempDir();
    const h = makeHarness(mirrorDir);
    const mirror = createMirror(h.replica, h.dataDir, mirrorDir, {
      volumeOf: h.volumeOf,
      fs: failingFs('路径失效'),
      now: fixedClock,
    });
    mirror.write();

    const health = mirrorHealth(mirror);

    expect(health.configured).toBe(true);
    expect(health.lastError).toContain('路径失效');
    expect(health.lastWrittenAt).toBeNull();
  });

  it('失败之后恢复：下一次写成功会把 lastError 清掉', () => {
    const mirrorDir = tempDir();
    const h = makeHarness(mirrorDir);
    let shouldFail = true;
    const fs = {
      ...nodeFs,
      writeFileSync: (path: string, contents: string) => {
        if (shouldFail) throw new Error('临时故障');
        nodeFs.writeFileSync(path, contents);
      },
    };
    const mirror = createMirror(h.replica, h.dataDir, mirrorDir, {
      volumeOf: h.volumeOf,
      fs,
      now: fixedClock,
    });

    mirror.write();
    expect(mirror.status.lastError).toContain('临时故障');

    shouldFail = false;
    expect(mirror.write()).toBe(true);
    expect(mirror.status.lastError).toBeNull();
    expect(existsSync(join(mirrorDir, MIRROR_FILE))).toBe(true);
  });
});

describe('mirrorHealth', () => {
  it('成功写入之后 lastWrittenAt 有值、lastError 为 null', () => {
    const mirrorDir = tempDir();
    const h = makeHarness(mirrorDir);
    const mirror = createMirror(h.replica, h.dataDir, mirrorDir, {
      volumeOf: h.volumeOf,
      now: fixedClock,
    });
    mirror.write();

    const health = mirrorHealth(mirror);

    expect(health.lastWrittenAt).toBe('2026-10-03T00:00:00.000Z');
    expect(health.lastError).toBeNull();
  });

  it('未配置时 configured 为 false，其余为空', () => {
    const h = makeHarness('');
    const mirror = createMirror(h.replica, h.dataDir, '', {
      volumeOf: h.volumeOf,
      now: fixedClock,
    });

    expect(mirrorHealth(mirror)).toEqual({
      configured: false,
      sameVolume: false,
      lastError: null,
      lastWrittenAt: null,
    });
  });
});

/**
 * 第二份存储（mirrorDir）与启动校验。
 *
 * ADR-0002 记下的一条代价：「第二份存储必须离开本机」。若它与数据目录**在同一卷**，
 * 那两台 SSD 一起挂掉时两份一起没 —— 这条代价就白付了，所以启动时必须明确告警。
 *
 * 写失败**不改变同步行为**：只记日志并计入 `/v1/health`（ADR 把它列为回滚信号之一）。
 * 一个同步盘没开、目录失效之类的原因，不该让同步这件事本身停下来。
 */
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Replica } from './replica.ts';
import { atomicWrite, nodeFs, type FsAdapter } from './replica.ts';

/** 镜子文件名。**刻意**与客户端 `folderSync` 的 `life-manager-auto-backup.json` 分开 ——
 *  同目录里两边各写各的，互不覆盖。 */
export const MIRROR_FILE = 'life-manager-server-replica.json';
/** 每次写入后的去抖窗口。 */
export const MIRROR_DEBOUNCE_MS = 30 * 1000;
/** 兜底周期：即便一直没有新写入，也至少这么久写一次。 */
export const MIRROR_INTERVAL_MS = 5 * 60 * 1000;

/** 内容指纹：整份信封序列化。镜子拿它判断「与上次镜像的是不是同一份」。 */
function fingerprintOf(envelope: Replica['envelope']): string {
  return JSON.stringify(envelope);
}

/**
 * 「是不是同一个卷」的判断。**做成可注入函数**，因为测试里没法真的造两个卷。
 *
 * 真实现用设备号（`statSync().dev`）：同一块盘上的两个目录设备号相同。拿不到时
 * （路径不存在、某些文件系统不报告 dev）退回「不同卷」—— 宁可不告警，也别对着
 * 一个正常配置乱喊。
 */
export type VolumeOf = (path: string) => number | undefined;

export const realVolumeOf: VolumeOf = (path: string) => {
  try {
    const stat = statSync(path);
    return typeof stat.dev === 'number' ? stat.dev : undefined;
  } catch {
    return undefined;
  }
};

export interface MirrorStatus {
  configured: boolean;
  /** 与数据目录同卷（代价白付了） */
  sameVolume: boolean;
  /** 最近一次写失败的原因；没失败则为 null */
  lastError: string | null;
  lastWrittenAt: string | null;
}

export interface MirrorOptions {
  volumeOf?: VolumeOf;
  fs?: FsAdapter;
  now?: () => Date;
}

export interface Mirror {
  status: MirrorStatus;
  /** 去抖 + 兜底周期：现在该写吗 */
  needsWrite: () => boolean;
  /** 写一次。失败**不抛**，只记到 status.lastError */
  write: () => boolean;
  /** 启动校验：同卷时返回一条告警文案，否则 null */
  startupWarning: () => string | null;
}

/**
 * 建一个镜子。
 *
 * `mirrorDir` 为空时一切动作都是空转 —— 「用户还没指定」是正常状态，不是错误。
 */
export function createMirror(
  replica: Replica,
  dataDir: string,
  mirrorDir: string,
  options: MirrorOptions = {},
): Mirror {
  const volumeOf = options.volumeOf ?? realVolumeOf;
  const fs = options.fs ?? nodeFs;
  const now = options.now ?? (() => new Date());

  const configured = typeof mirrorDir === 'string' && mirrorDir.trim() !== '';
  let lastAttemptAt: number | null = null;
  let lastWrittenAt: string | null = null;
  let lastError: string | null = null;
  /**
   * 上一次**成功镜像**时的内容指纹。
   *
   * 不排除 `exportedAt`：镜子就是要把「整份当前内容」原样复制过去，时间戳变了确实该重写一次
   * —— 但那只会在真有写入时发生（写入才更新 `exportedAt`）。
   */
  let mirroredFingerprint: string | null = null;

  const sameVolume = (): boolean => {
    if (!configured) return false;
    const left = volumeOf(dataDir);
    const right = volumeOf(mirrorDir);
    // 拿不到就当作不同卷：别对一个判断不了的配置乱告警
    if (left === undefined || right === undefined) return false;
    return left === right;
  };

  return {
    status: {
      get configured() {
        return configured;
      },
      get sameVolume() {
        return sameVolume();
      },
      get lastError() {
        return lastError;
      },
      get lastWrittenAt() {
        return lastWrittenAt;
      },
    },

    needsWrite: () => {
      if (!configured) return false;
      /*
       * **没改动就不写。**
       *
       * 去抖窗口只是「别在 30 秒内写两次」，不等于「有改动才写」。
       * 早先只看时间，于是空闲服务每 30 秒把整份副本重写一遍 ——
       * 实测 10 分钟空转写了 20 次，而同步盘（OneDrive 之类）会把这当成上传风暴，
       * 正是 ADR-0002 警告过的那种成本。
       *
       * 判据用**镜子自己记的指纹**，而不是 `replica.isDirty()` ——
       * 后者比的是「与上次 save 的差别」，而每次 push 之后 HTTP 层都会 `save()`，
       * 于是它恒为 false，镜子会永远不写。镜子关心的是「与上次**镜像**的差别」。
       *
       * 例外：从没写过时一定写一次（第一次总得把第二份建出来）。
       */
      if (lastAttemptAt === null) return true;
      if (fingerprintOf(replica.envelope) === mirroredFingerprint) return false;
      return now().getTime() - lastAttemptAt >= MIRROR_DEBOUNCE_MS;
    },

    write: () => {
      if (!configured) return false;
      lastAttemptAt = now().getTime();
      try {
        if (!existsSync(mirrorDir)) mkdirSync(mirrorDir, { recursive: true });
        atomicWrite(fs, join(mirrorDir, MIRROR_FILE), JSON.stringify(replica.envelope, null, 2));
        // 记下「镜像的是哪一份」，这样内容没变时 needsWrite 会说不必再写
        mirroredFingerprint = fingerprintOf(replica.envelope);
        lastWrittenAt = now().toISOString();
        lastError = null;
        return true;
      } catch (error) {
        // 不改变同步行为 —— 只记下来，让 /v1/health 能看出来
        lastError = error instanceof Error ? error.message : String(error);
        return false;
      }
    },

    startupWarning: () => {
      if (!configured) return null;
      if (!sameVolume()) return null;
      return (
        `第二份存储（mirrorDir: ${mirrorDir}）与数据目录在**同一卷** —— ` +
        `这台机器挂掉时两份会一起没，ADR-0002 记下的那条代价就白付了。请指向另一块盘或网络位置。`
      );
    },
  };
}

/** 给 `/v1/health` 用的一段：镜子现在什么状态。 */
export function mirrorHealth(mirror: Mirror): {
  configured: boolean;
  sameVolume: boolean;
  lastError: string | null;
  lastWrittenAt: string | null;
} {
  return {
    configured: mirror.status.configured,
    sameVolume: mirror.status.sameVolume,
    lastError: mirror.status.lastError,
    lastWrittenAt: mirror.status.lastWrittenAt,
  };
}

/** 供测试替身用的假卷判断：给两个目录各指定一个「卷号」。 */
export function fakeVolumeOf(map: Record<string, number>): VolumeOf {
  return (path: string) => {
    for (const [prefix, volume] of Object.entries(map)) {
      if (path.startsWith(prefix)) return volume;
    }
    return undefined;
  };
}

/** 一个会失败的 fs 替身（模拟同步盘没开 / 只读）。 */
export function failingFs(message = 'ENOENT: 同步盘不可用'): FsAdapter {
  return {
    ...nodeFs,
    writeFileSync: () => {
      throw new Error(message);
    },
  };
}

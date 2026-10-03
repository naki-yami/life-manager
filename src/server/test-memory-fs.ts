/**
 * 内存 fs 替身：给副本的原子写与半写文件恢复用。
 *
 * 为什么必须有个替身：工单验收要求「注入一个在 `rename` 前抛错的 fs 适配器 → 副本仍是
 * 上一个好版本」。真去制造磁盘故障是不可行的（也不该那么测），所以把 fs 做成可注入接缝。
 *
 * 它刻意**不做**真实 fs 的解析/规范化，只维持一个 `路径 → 内容` 映射 —— 被测的是副本的
 * 写入顺序与失败行为，不是 fs 本身。
 */
import type { FsAdapter } from './replica';

export interface MemoryFs extends FsAdapter {
  /** 当前所有文件内容（可断言「副本仍是上一个好版本」） */
  files: Map<string, string>;
  /** 目录集合 */
  dirs: Set<string>;
  /** 调用记录，用来断言写入顺序是 temp → rename */
  calls: string[];
  /** 让下一次 rename 抛错（模拟写入中途被打断） */
  failNextRename: (message?: string) => void;
  /** 写入的文件名（不含 .tmp） */
  contentOf: (path: string) => string | undefined;
}

/**
 * 路径归一化：`join()` 在 Windows 上产出 `\`，而测试里常手写 `/`。
 * 不归一化的话，seed 进去的 `/data/replica.json` 与查询的 `\data\replica.json`
 * 会变成两个不同的键 —— 表现为「文件明明在，却当成不存在」，非常难查。
 */
const norm = (path: string): string => path.replace(/\\/g, '/');

export function createMemoryFs(initial: Record<string, string> = {}): MemoryFs {
  const files = new Map<string, string>(
    Object.entries(initial).map(([path, contents]) => [norm(path), contents]),
  );
  const dirs = new Set<string>();
  const calls: string[] = [];
  let renameError: string | null = null;

  const fs: MemoryFs = {
    files,
    dirs,
    calls,
    failNextRename: (message = '注入的 rename 失败') => {
      renameError = message;
    },
    contentOf: (path) => files.get(norm(path)),
    exists: (path) => {
      calls.push(`exists:${path}`);
      const key = norm(path);
      if (files.has(key) || dirs.has(key)) return true;
      // 归一化后的前缀匹配：mkdirp 建的目录与 join 出来的子路径可能写法不同
      return [...files.keys(), ...dirs].some((known) => known.startsWith(`${key}/`));
    },
    readFile: (path) => {
      calls.push(`readFile:${path}`);
      const value = files.get(norm(path));
      if (value === undefined) throw new Error(`ENOENT: ${path}`);
      return value;
    },
    writeFileSync: (path, contents) => {
      calls.push(`writeFileSync:${path}`);
      files.set(norm(path), contents);
    },
    mkdirp: (path) => {
      calls.push(`mkdirp:${path}`);
      dirs.add(norm(path));
    },
    fsyncFile: (path) => {
      calls.push(`fsyncFile:${path}`);
    },
    rename: (from, to) => {
      calls.push(`rename:${from}->${to}`);
      if (renameError !== null) {
        const message = renameError;
        renameError = null;
        throw new Error(message);
      }
      const value = files.get(norm(from));
      if (value === undefined) throw new Error(`ENOENT: ${from}`);
      files.set(norm(to), value);
      files.delete(norm(from));
    },
    readdir: (path) => {
      calls.push(`readdir:${path}`);
      const prefix = `${norm(path)}/`;
      return [...files.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length))
        .filter((name) => !name.includes('/'));
    },
  };
  return fs;
}

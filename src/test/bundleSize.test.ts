import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * 首屏体积预算脚本（scripts/check-bundle-size.mjs）的端到端测试。
 *
 * 这个脚本是 CI 的一道门禁，但它的失败路径（产物结构变了、体积超标）平时根本不会跑到，
 * 真出问题时就只剩「CI 红了但不知道为什么」。所以在临时目录里造几份假的 dist 产物，
 * 把它的四种结局都跑一遍。
 */

const scriptPath = resolve(process.cwd(), 'scripts', 'check-bundle-size.mjs');

const tempDirs: string[] = [];

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lm-size-'));
  tempDirs.push(dir);
  return dir;
}

function writeAsset(dir: string, name: string, content: Buffer | string): void {
  const assets = join(dir, 'dist', 'assets');
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, name), content);
}

interface RunResult {
  status: number;
  output: string;
}

function runScript(cwd: string): RunResult {
  try {
    const output = execFileSync(process.execPath, [scriptPath], { cwd, encoding: 'utf8' });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('check-bundle-size', () => {
  it('还没构建时给出提示并以 1 退出', () => {
    const result = runScript(makeProject());

    expect(result.status).toBe(1);
    expect(result.output).toContain('npm run build');
  });

  it('正常产物：把三项加起来，通过预算', () => {
    const dir = makeProject();
    writeAsset(dir, 'index-abc123.js', 'console.log("entry")');
    writeAsset(dir, 'index-abc123.css', '.a{color:red}');
    writeAsset(dir, 'HomePage-def456.js', 'console.log("home")');

    const result = runScript(dir);

    expect(result.status).toBe(0);
    expect(result.output).toContain('入口 JS');
    expect(result.output).toContain('入口 CSS');
    expect(result.output).toContain('首页 chunk');
    expect(result.output).toContain('合计');
    expect(result.output).not.toContain('超出预算');
  });

  it('少了首页 chunk 时明确指出产物结构变了', () => {
    const dir = makeProject();
    writeAsset(dir, 'index-abc123.js', 'console.log("entry")');
    writeAsset(dir, 'index-abc123.css', '.a{color:red}');

    const result = runScript(dir);

    expect(result.status).toBe(1);
    expect(result.output).toContain('首页 chunk');
  });

  it('首屏超过 300KB 时拦住（随机字节，压不动）', () => {
    const dir = makeProject();
    // 随机数据几乎不可压缩，400KB 随机字节 gzip 后仍在 400KB 上下
    writeAsset(dir, 'index-abc123.js', randomBytes(400 * 1024));
    writeAsset(dir, 'index-abc123.css', '.a{color:red}');
    writeAsset(dir, 'HomePage-def456.js', 'console.log("home")');

    const result = runScript(dir);

    expect(result.status).toBe(1);
    expect(result.output).toContain('超出预算');
  });
});

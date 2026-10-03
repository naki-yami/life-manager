// @vitest-environment node
/**
 * 运维脚本的**语义**检查（不只是「文件里有没有这个词」）。
 *
 * 起因：早先这组用例是纯 grep —— 我实测过三种破坏全都逃得过去：
 * - `-RestartCount 3` 改成 `0`（崩溃重启策略没了）
 * - `-AtLogOn` 改成 `-AtStartup`（不再在用户会话里跑，node 拿不到环境）
 * - `node "src\server\main.ts"` 整行注释掉（启动器的**全部意义**）
 * - 把 `Register-ScheduledTask` 换成一句含同样字样的 `Write-Host`
 * 因为断言只查「子串在不在」，而这些改动都保留了子串。
 *
 * 所以这里改成**解析后断言结构**：把脚本当数据看，检查真正决定行为的那些参数。
 * 能真的跑 PowerShell 时还会做一次语法解析（`Parser::ParseFile`），
 * 语法坏了当场红灯 —— 那是 grep 永远查不出来的。
 */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const serverDir = join(__dirname);
const repoRoot = join(serverDir, '..', '..');
const read = (name: string): Buffer => readFileSync(join(serverDir, name));
const readText = (name: string): string => read(name).toString('utf8');

describe('start-sync-server.bat', () => {
  it('纯 ASCII：一个非 ASCII 字节都没有', () => {
    const bytes = read('start-sync-server.bat');
    expect([...bytes].filter((byte) => byte > 127)).toEqual([]);
  });

  it('切了代码页（否则 Node 的 UTF-8 中文日志会显示成乱码）', () => {
    expect(readText('start-sync-server.bat')).toContain('chcp 65001');
  });

  /**
   * 关键：`node` 那一行必须是**真的命令**，不是注释、不是 echo。
   *
   * 早先只断言 `src\server\main.ts` 这几个字在文件里 —— 把它整行注释掉照样通过，
   * 而那一行就是这个启动器的全部意义。
   */
  it('真的调用 node 跑 main.ts（不是注释、不是 echo）', () => {
    const lines = readText('start-sync-server.bat').split(/\r?\n/);
    const invocation = lines.find((line) => /\bnode\b/.test(line) && /main\.ts/.test(line));

    expect(invocation, '找不到「调用 node 跑 main.ts」的那一行').toBeDefined();
    const trimmed = invocation!.trim();
    // 不能是注释（REM / ::），也不能是 echo
    expect(trimmed.startsWith('REM')).toBe(false);
    expect(trimmed.startsWith('::')).toBe(false);
    expect(trimmed.startsWith('echo')).toBe(false);
    // 必须真的带 node 可执行文件与入口路径
    expect(trimmed).toMatch(/^node\s+/);
    expect(trimmed).toContain('src\\server\\main.ts');
  });

  it('找不到 node 时给出可操作的提示并退出（不是静默继续）', () => {
    const text = readText('start-sync-server.bat');
    expect(text).toContain('where node');
    expect(text).toMatch(/exit\s+\/b\s+1/);
  });
});

describe('install-autostart.ps1', () => {
  it('以 UTF-8 BOM 开头（PowerShell 5.1 靠它认 UTF-8）', () => {
    const bytes = read('install-autostart.ps1');
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('去掉 BOM 之后内容仍能按 UTF-8 解出中文（不是别的编码）', () => {
    const text = readText('install-autostart.ps1');
    expect(text).toContain('同步服务');
    expect(text).not.toContain('\uFFFD');
  });

  /**
   * 注册动作必须是**真的 cmdlet 调用**，且参数是我们要求的那些值。
   *
   * 只查「Register-ScheduledTask 这个词在不在」是不够的：把整个调用换成一句
   * `Write-Host '... Register-ScheduledTask ...'` 同样含这个词，却什么都不做。
   */
  it('真的调用 Register-ScheduledTask（不是被塞进字符串里）', () => {
    const text = readText('install-autostart.ps1');
    // 行首（允许前导空白）出现 cmdlet，才算真的调用
    expect(text).toMatch(/^\s*Register-ScheduledTask\b/m);
    expect(text).toMatch(/^\s*Unregister-ScheduledTask\b/m);
  });

  it('崩溃重启策略没被改弱（RestartCount > 0）', () => {
    const text = readText('install-autostart.ps1');
    const match = /-RestartCount\s+(\d+)/.exec(text);
    expect(match, '找不到 -RestartCount').not.toBeNull();
    expect(Number(match![1])).toBeGreaterThan(0);
  });

  it('触发器是登录时启动（-AtLogOn），不是开机（-AtStartup）', () => {
    const text = readText('install-autostart.ps1');
    // 两者不能同时出现：-AtStartup 会让 node 拿不到用户会话环境
    expect(text).toMatch(/-AtLogOn\b/);
    expect(text).not.toMatch(/-AtStartup\b/);
  });

  it('有卸载分支，且入口与仓库实际文件对得上', () => {
    const text = readText('install-autostart.ps1');
    expect(text).toContain('-Remove');
    // 脚本里写的主入口路径必须真的存在
    expect(existsSync(join(serverDir, 'main.ts'))).toBe(true);
    expect(text).toContain('main.ts');
  });

  /**
   * 语法解析：能跑 PowerShell 就真解析一遍。
   *
   * grep 永远查不出拼错的括号或漏掉的引号 —— 而那种脚本双击就报错。
   */
  it('PowerShell 语法解析通过（若有 pwsh 可用）', () => {
    const script = join(serverDir, 'install-autostart.ps1');
    const probe = `
      $errors = $null
      $null = [System.Management.Automation.Language.Parser]::ParseFile('${script.replace(/'/g, "''")}', [ref]$null, [ref]$errors)
      if ($errors.Count -eq 0) { 'PARSE_OK' } else { $errors | ForEach-Object { $_.Message } }
    `;
    let output: string;
    try {
      output = execFileSync('pwsh', ['-NoProfile', '-Command', probe], {
        encoding: 'utf8',
        timeout: 30000,
      });
    } catch {
      // 这台机器上没有 pwsh（或不允许起进程）：跳过这条，不让环境差异变成假红灯
      return;
    }
    expect(output).toContain('PARSE_OK');
  });
});

describe('scripts/sync-e2e.ps1（服务端集成验收脚本）', () => {
  it('同样是 UTF-8 BOM（它也有中文，5.1 读无 BOM 会乱码）', () => {
    const bytes = readFileSync(join(repoRoot, 'scripts', 'sync-e2e.ps1'));
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  /**
   * 断言它对**行为**下判断，而不是只打印。
   *
   * 早先只查子串（`noop` / `more` / `镜子` 在不在），把断言换成 `Write-Host` 照样通过。
   * 现在要求它真的调 Check 并统计失败、失败时以非零码退出 —— 否则 CI 看不出区别。
   */
  it('真的做断言并在失败时非零退出（不是只打印）', () => {
    const text = readFileSync(join(repoRoot, 'scripts', 'sync-e2e.ps1')).toString('utf8');
    expect(text).toMatch(/function\s+Check/);
    expect(text).toMatch(/\$script:fail\+\+/);
    expect(text).toMatch(/exit\s+1/);
    // 每一步都要真的走一遍 Check
    expect((text.match(/\bCheck\s+'/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });

  it('覆盖各工单的关键验收点', () => {
    const text = readFileSync(join(repoRoot, 'scripts', 'sync-e2e.ps1')).toString('utf8');
    for (const marker of ['noop', 'more', 'delete', '不倒退', '镜子']) {
      expect(text).toContain(marker);
    }
  });
});

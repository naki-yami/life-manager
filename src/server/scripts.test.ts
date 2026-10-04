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
/** 读仓库根或任意相对路径的字节 */
const readAt = (relative: string): Buffer => readFileSync(join(repoRoot, relative));

/**
 * 用 PowerShell 真解析一遍某个 `.ps1`，返回输出；**跑不了就返回 `null`**（调用方跳过）。
 *
 * 为什么要有这个公共实现，而不是每条测试各写一遍 —— 这里踩过一个 CI 专属的坑：
 * 早先每条都直接 `execFileSync('pwsh', …, { timeout: 30000 })`，而那个 timeout
 * **比 vitest 自己的 5000ms 上限还长**。本地 Windows 上 pwsh 400ms 就返回，看不出问题；
 * Ubuntu CI runner 上 pwsh 是**预装的**（所以不会抛「找不到命令」，而是慢慢启动），
 * 于是 vitest 先到 5 秒把这条判成超时失败，我写的 catch 根本没机会执行 ——
 * 表现就是「本地 2036 条全绿、CI 挂」。
 *
 * 现在：非 Windows 直接跳过（这些脚本本来就只有 Windows 会跑），
 * Windows 上给足 15 秒并显式放宽该用例的时间。拿不到结果一律跳过，
 * **不让环境差异变成假红灯**。
 */
function parseWithPowerShell(scriptPath: string): string | null {
  if (process.platform !== 'win32') return null;

  const probe = `
    $errors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile('${scriptPath.replace(/'/g, "''")}', [ref]$null, [ref]$errors)
    if ($errors.Count -eq 0) { 'PARSE_OK' } else { $errors | ForEach-Object { $_.Message } }
  `;

  // 优先 pwsh（PowerShell 7），退回 Windows PowerShell 5.1
  for (const exe of ['pwsh', 'powershell']) {
    try {
      return execFileSync(exe, ['-NoProfile', '-Command', probe], {
        encoding: 'utf8',
        timeout: 15_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      // 这个 exe 不可用（或解析超时）：试下一个
    }
  }
  return null;
}

/**
 * 桌面快捷方式的创建脚本。
 *
 * 这一组守的是一个**文档承诺了、但从来没实现**的入口：`启动说明.md` 一直写着
 * 「双击桌面上的『Life Manager』快捷方式」，而仓库里没有任何代码会写 `.lnk` ——
 * 照说明去找必然找不到，用户看到的就是「打不开」。
 *
 * 现在拆成两个文件，各自的编码要求都是本仓库实测过的坑：
 * - `.bat` 必须**纯 ASCII**（cmd 在 936 代码页下解析 UTF-8 中文会崩）；
 * - `.ps1` 必须**UTF-8 带 BOM**（5.1 读无 BOM 的 UTF-8 会当 ANSI，报「缺少 }」）。
 * 中文文件名只能写在 `.ps1` 里，所以逻辑必须在 `.ps1`。
 */
describe('创建桌面快捷方式（.bat + .ps1）', () => {
  const batName = '创建桌面快捷方式.bat';

  it('.bat 是纯 ASCII（中文不能出现在 .bat 内容里）', () => {
    const bytes = readAt(batName);
    expect([...bytes].filter((byte) => byte > 127)).toEqual([]);
  });

  it('.bat 真的调用那个 .ps1（不是只打印一句话）', () => {
    const text = readAt(batName).toString('utf8');
    expect(text).toMatch(/powershell\b/);
    expect(text).toContain('create-desktop-shortcut.ps1');
    // 不能是注释掉的一行
    const line = text.split(/\r?\n/).find((l) => l.includes('create-desktop-shortcut.ps1'));
    expect(line?.trim().startsWith('REM')).toBe(false);
  });

  it('.bat 把退出码透出去（创建失败要让调用方知道）', () => {
    const text = readAt(batName).toString('utf8');
    expect(text).toMatch(/exit\s+\/b\s+%RC%/i);
  });

  it('.ps1 是 UTF-8 BOM（它要写中文文件名与中文提示）', () => {
    const bytes = readAt(join('scripts', 'create-desktop-shortcut.ps1'));
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('.ps1 真的创建快捷方式并指向真正的启动器', () => {
    const text = readAt(join('scripts', 'create-desktop-shortcut.ps1')).toString('utf8');
    // 真的调用 COM 的 CreateShortcut，而不是把字样塞进字符串
    expect(text).toMatch(/New-Object\s+-ComObject\s+WScript\.Shell/);
    expect(text).toMatch(/\$shell\.CreateShortcut\(/);
    expect(text).toMatch(/\.Save\(\)/);

    /*
     * 目标必须是**真的启动器文件**。两件事缺一不可：
     * 1. 脚本里拼的文件名就是那个真启动器（改成别的名字要红）；
     * 2. 那个文件在磁盘上真的存在。
     *
     * 早先只断言了第 2 条对一个**写死的**仓库路径成立 —— 于是把脚本里的目标改成
     * 「不存在的启动器.bat」照样全绿（变异测试抓到的），那等于没守住。
     */
    const target = /Join-Path\s+\$root\s+'([^']+)'/.exec(text);
    expect(target, '找不到脚本里拼的启动器路径').not.toBeNull();
    expect(target![1]).toBe('启动 Life Manager.vbs');
    expect(existsSync(join(repoRoot, target![1]))).toBe(true);
  });

  /**
   * 启动器必须是 `.vbs`，不能退回 `.bat`。
   *
   * 这是用户直接反馈的两条之一：「打开快捷方式就会出一个终端对话框 不好」。
   * `.bat` 双击**必然**弹一个 cmd 控制台窗口，而且关不掉（关掉 = 停服务）。
   * `.vbs` 由 `wscript.exe` 跑，天然无窗口 —— 这是 Windows 上最轻的零依赖办法。
   */
  it('启动器是 .vbs（.bat 会弹终端窗口，用户明确不接受）', () => {
    expect(existsSync(join(repoRoot, '启动 Life Manager.vbs'))).toBe(true);
    expect(existsSync(join(repoRoot, '启动 Life Manager.bat'))).toBe(false);

    const vbs = readAt('启动 Life Manager.vbs');
    // UTF-16LE + BOM —— VBScript 读无 BOM 的 UTF-8 会当 ANSI，中文注释直接解析崩
    // （实测报「无效字符」，这里踩过）
    expect([vbs[0], vbs[1]]).toEqual([0xff, 0xfe]);
  });

  it('.vbs 隐藏窗口起服务，且不套 cmd（套了会多留一个 cmd.exe）', () => {
    const vbs = readAt('启动 Life Manager.vbs').toString('utf16le');
    // 窗口风格 0 = 隐藏，这是「不要黑框」的落点。
    // 这个调用跨了两行（VBScript 的行延续符 `_`），所以先把续行折起来再断言。
    const joined = vbs.replace(/_\r?\n\s*/g, ' ');
    expect(joined).toMatch(/shell\.Run\s+"?"?[^\n]*,\s*0,\s*False/i);

    /*
     * 起服务那一行必须**直接调 node.exe**，不能套 `cmd /c cd ... && node`。
     * 套一层会在任务管理器里多留一个 cmd.exe（实测过）。
     *
     * 注意：首次构建那一步**可以**用 cmd /c（npm 的输出要看得见），
     * 所以这里只检查「启动服务」那一段，不做全局断言。
     */
    const serverBlock = /preview --port[\s\S]{0,200}/.test(joined);
    expect(serverBlock, '找不到起服务的那一段').toBe(true);
    const launchLine = joined
      .split(/\r?\n/)
      .find((line) => line.includes('preview --port') && line.includes('shell.Run'));
    expect(launchLine, '起服务的那一行不是 shell.Run').toBeDefined();
    expect(launchLine).toMatch(/nodeExe/);
    expect(launchLine).not.toMatch(/cmd\s*\/c/i);
  });

  /**
   * 快捷方式的图标必须是 `.ico`。
   *
   * 用户的第二条反馈：「快捷方式没有UI 白色的很丑」。根因是图标指向 `.png` ——
   * Windows 快捷方式**只接受 .ico / exe / dll 里的图标资源**，给 `.png` 会静默退回
   * 系统默认白图标（实测 `System.Drawing.Icon('...png')` 直接抛
   * "must be a picture that can be used as a Icon"）。
   */
  it('快捷方式图标必须是 .ico（给 .png 会变成默认白图标）', () => {
    const text = readAt(join('scripts', 'create-desktop-shortcut.ps1')).toString('utf8');
    expect(text).toMatch(/\.ico/);

    const icon = /Join-Path\s+\$root\s+'([^']*\.ico)'/.exec(text);
    expect(icon, '脚本里没有拼出 .ico 路径').not.toBeNull();

    /*
     * 脚本里写的是 **Windows 反斜杠路径**（`public\icons\life-manager.ico`），
     * 而 CI 跑在 Ubuntu 上 —— 那里反斜杠是**普通文件名字符**，不是分隔符。
     * 直接把捕获到的字符串喂给 `join()` 会在 Linux 上拼出一个不存在的名字，
     * 于是断言必然失败（这正是 CI 红的原因：本地 2036 全绿、CI 却挂在
     * `expected false to be true`）。
     *
     * 所以这里先把反斜杠统一成正斜杠再拼 —— 两边都能过，
     * 而「脚本里写的确实是一个 .ico 路径」这条语义没有减弱。
     */
    const relative = icon![1].replace(/\\/g, '/');
    expect(existsSync(join(repoRoot, relative)), 'ico 文件不存在，快捷方式会退回白图标').toBe(true);
  });

  it('那个 .ico 真的是多尺寸 ico（Windows 会按显示尺寸挑）', () => {
    const bytes = readAt(join('public', 'icons', 'life-manager.ico'));
    // ICONDIR：reserved(2)=0, type(2)=1(icon), count(2)=档位数
    expect(bytes[0]).toBe(0);
    expect(bytes[1]).toBe(0);
    expect(bytes[2]).toBe(1);
    expect(bytes[3]).toBe(0);
    const count = bytes[4]! | (bytes[5]! << 8);
    expect(count, 'ico 里至少要有 16/32/48/256 这几档').toBeGreaterThanOrEqual(4);
  });

  it('.ps1 把目标、工作目录都设上（缺工作目录会在错的地方找 dist）', () => {
    const text = readAt(join('scripts', 'create-desktop-shortcut.ps1')).toString('utf8');
    expect(text).toMatch(/\.TargetPath\s*=/);
    expect(text).toMatch(/\.WorkingDirectory\s*=/);
  });

  it('PowerShell 语法解析通过（若本机有 PowerShell）', () => {
    const result = parseWithPowerShell(join(repoRoot, 'scripts', 'create-desktop-shortcut.ps1'));
    if (result === null) return; // 跳过（见 parseWithPowerShell 的说明）
    expect(result).toContain('PARSE_OK');
  }, 20_000);
});

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
   * 跳过规则与超时纪律见 `parseWithPowerShell` 的注释（那里记了 CI 踩过的坑）。
   */
  it('PowerShell 语法解析通过（若本机有 PowerShell）', () => {
    const result = parseWithPowerShell(join(serverDir, 'install-autostart.ps1'));
    if (result === null) return;
    expect(result).toContain('PARSE_OK');
  }, 20_000);
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

// @vitest-environment node
/**
 * 运维脚本的编码不变量（工单 07 的实现时踩到过，值得用测试钉住）。
 *
 * 这两个坑都是「测试跑不到、但用户一定会撞上」的类型：
 *
 * 1. `start-sync-server.bat` 必须是**纯 ASCII**。cmd.exe 按控制台代码页（中文 Windows 是
 *    GBK/936）解析 .bat，UTF-8 的中文会让 `if (...)` 块里的括号配对被搞坏，
 *    实测报 `. was unexpected at this time.` —— 服务根本起不来。
 * 2. `install-autostart.ps1` 必须是 **UTF-8 with BOM**。Windows PowerShell 5.1 读无 BOM 的
 *    UTF-8 会按 ANSI(936) 解，中文字符串变乱码、引号配对被破坏，实测报
 *    `Missing closing '}'`。
 *
 * 这些文件平时没人跑，编码一被编辑器改掉就静默坏掉 —— 所以在这里断言。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const serverDir = join(__dirname);
const read = (name: string): Buffer => readFileSync(join(serverDir, name));

describe('start-sync-server.bat', () => {
  it('纯 ASCII：一个非 ASCII 字节都没有', () => {
    const bytes = read('start-sync-server.bat');
    const nonAscii = [...bytes].filter((byte) => byte > 127);
    expect(nonAscii).toEqual([]);
  });

  it('切了代码页（否则 Node 的 UTF-8 中文日志会显示成乱码）', () => {
    const text = read('start-sync-server.bat').toString('ascii');
    expect(text).toContain('chcp 65001');
  });

  it('从不带扩展名地调 node（那是 .ts，要靠类型擦除跑）', () => {
    const text = read('start-sync-server.bat').toString('ascii');
    expect(text).toContain('src\\server\\main.ts');
  });
});

describe('install-autostart.ps1', () => {
  it('以 UTF-8 BOM 开头（PowerShell 5.1 靠它认 UTF-8）', () => {
    const bytes = read('install-autostart.ps1');
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('去掉 BOM 之后内容仍能按 UTF-8 解出中文（不是别的编码）', () => {
    const text = read('install-autostart.ps1').toString('utf8');
    expect(text).toContain('同步服务');
    // 乱码的典型特征：GBK 被当 UTF-8 解出来的替换字符
    expect(text).not.toContain('\uFFFD');
  });

  it('注册计划任务时带崩溃重启策略（spec：含重启）', () => {
    const text = read('install-autostart.ps1').toString('utf8');
    expect(text).toContain('RestartCount');
    expect(text).toContain('Register-ScheduledTask');
  });

  it('有卸载分支', () => {
    const text = read('install-autostart.ps1').toString('utf8');
    expect(text).toContain('Unregister-ScheduledTask');
    expect(text).toContain('-Remove');
  });
});

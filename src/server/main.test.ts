// @vitest-environment node
/**
 * 启动日志：监听地址、令牌只打印一次、mirrorDir 提示。
 *
 * spec 的 Testing 第 9 条要求「同卷告警出现在启动日志里」—— 同卷判断本身归工单 07，
 * 这里测的是本条工单负责的那部分：**放开监听地址时的重复提醒**（ADR 的暴露面红线），
 * 以及「令牌只在首次生成时打印一次」（每次启动都打会把密钥刷进日志文件）。
 */
import { describe, expect, it } from 'vitest';
import { startupMessages } from './main';
import { DEFAULT_HOST } from './config';

const TOKEN = 'a'.repeat(64);

const messagesOf = (host: string, created = false, mirrorDir = '/some/mirror'): string[] =>
  startupMessages(host, 8787, mirrorDir, '/some/data', created, TOKEN).lines.map((l) => l.message);

const warningsOf = (host: string, created = false, mirrorDir = '/some/mirror'): string[] =>
  startupMessages(host, 8787, mirrorDir, '/some/data', created, TOKEN)
    .lines.filter((l) => l.level === 'warn')
    .map((l) => l.message);

describe('启动日志', () => {
  it('默认回环地址不产生暴露面告警', () => {
    const warnings = warningsOf(DEFAULT_HOST);

    expect(warnings.join('\n')).not.toContain('局域网');
  });

  it('localhost 与 ::1 也算回环，同样不告警', () => {
    expect(warningsOf('localhost').join('\n')).not.toContain('局域网');
    expect(warningsOf('::1').join('\n')).not.toContain('局域网');
  });

  it('监听 0.0.0.0 时重复提醒两次（一句容易被滚屏冲掉）', () => {
    const warnings = warningsOf('0.0.0.0');

    const mentions = warnings.filter((line) => line.includes('局域网'));
    expect(mentions.length).toBeGreaterThanOrEqual(2);
    // 要说清后果，而不只是「注意安全」
    expect(warnings.join('\n')).toContain('127.0.0.1');
  });

  it('局域网地址（显式配的网卡 IP）同样告警', () => {
    expect(warningsOf('192.168.1.10').join('\n')).toContain('局域网');
  });

  it('首次生成令牌时打印一次，且是 warn 级（要显眼）', () => {
    const warnings = warningsOf(DEFAULT_HOST, true);

    expect(warnings.join('\n')).toContain(TOKEN);
  });

  it('令牌已存在时不打印令牌本身', () => {
    const all = messagesOf(DEFAULT_HOST, false);

    expect(all.join('\n')).not.toContain(TOKEN);
  });

  it('mirrorDir 未配置时明确提示建议尽早指定', () => {
    const all = messagesOf(DEFAULT_HOST, false, '');

    expect(all.join('\n')).toContain('未配置');
  });

  it('启动日志带上监听地址与数据目录', () => {
    const all = messagesOf(DEFAULT_HOST).join('\n');

    expect(all).toContain('127.0.0.1:8787');
    expect(all).toContain('/some/data');
  });
});

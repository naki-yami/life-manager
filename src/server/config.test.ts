// @vitest-environment node
/**
 * 配置：首次生成、读回、CORS origin 匹配。
 *
 * 只测外部行为：给一个不存在的路径 → 磁盘上出现一份可用配置；给一份配置 → 读回来的值对。
 * 不测内部函数名、不测 JSON 的字段顺序。
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_ALLOWED_ORIGINS,
  DEFAULT_HOST,
  DEFAULT_PORT,
  isOriginAllowed,
  loadOrCreateConfig,
} from './config';

const tempDir = (): string => mkdtempSync(join(tmpdir(), 'lm-sync-config-'));

describe('配置的首次生成与读回', () => {
  it('没有 config.json 时生成一份，并回报 created', () => {
    const dir = tempDir();
    const configPath = join(dir, 'config.json');

    const { config, created } = loadOrCreateConfig(configPath);

    expect(created).toBe(true);
    expect(config.host).toBe(DEFAULT_HOST);
    expect(config.port).toBe(DEFAULT_PORT);
    // 令牌是 32 字节随机数的十六进制串
    expect(config.token).toMatch(/^[0-9a-f]{64}$/);
    // 第二份存储留空，不默认指向本机上的兄弟目录
    expect(config.mirrorDir).toBe('');
    expect(config.allowedOrigins).toEqual(DEFAULT_ALLOWED_ORIGINS);

    // 落盘了，且是合法 JSON
    const onDisk = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(onDisk.token).toBe(config.token);
    expect(onDisk.host).toBe(DEFAULT_HOST);
  });

  it('再次读取不生成新令牌（同一个文件里那份）', () => {
    const dir = tempDir();
    const configPath = join(dir, 'config.json');

    const first = loadOrCreateConfig(configPath);
    const second = loadOrCreateConfig(configPath);

    expect(second.created).toBe(false);
    expect(second.config.token).toBe(first.config.token);
  });

  it('已有配置里的值优先于默认值；畸形字段回退默认', () => {
    const dir = tempDir();
    const configPath = join(dir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        port: 9000,
        host: '127.0.0.1',
        token: 'a'.repeat(64),
        dataDir: join(dir, 'mine'),
        mirrorDir: join(dir, 'mirror'),
        allowedOrigins: ['http://localhost:*'],
      }),
      'utf8',
    );

    const { config, created } = loadOrCreateConfig(configPath);

    expect(created).toBe(false);
    expect(config.port).toBe(9000);
    expect(config.dataDir).toBe(join(dir, 'mine'));
    expect(config.mirrorDir).toBe(join(dir, 'mirror'));
    expect(config.allowedOrigins).toEqual(['http://localhost:*']);
  });

  it('port 写成 0 / 负数 / 非数字时回退默认端口', () => {
    const dir = tempDir();
    for (const bad of [0, -1, 'abc']) {
      const configPath = join(dir, `config-${String(bad)}.json`);
      writeFileSync(configPath, JSON.stringify({ port: bad }), 'utf8');
      expect(loadOrCreateConfig(configPath).config.port).toBe(DEFAULT_PORT);
    }
  });
});

describe('CORS origin 匹配', () => {
  it('默认放行本机的任意端口', () => {
    expect(isOriginAllowed('http://localhost:5173', DEFAULT_ALLOWED_ORIGINS)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:4173', DEFAULT_ALLOWED_ORIGINS)).toBe(true);
    expect(isOriginAllowed('http://localhost:80', DEFAULT_ALLOWED_ORIGINS)).toBe(true);
  });

  it('默认不放行外部 origin，也不放行缺端口的写法', () => {
    expect(isOriginAllowed('https://evil.example.com', DEFAULT_ALLOWED_ORIGINS)).toBe(false);
    expect(isOriginAllowed('http://localhost', DEFAULT_ALLOWED_ORIGINS)).toBe(false);
    // 前缀像但主机不同：`localhost.evil.com` 不能被当成 `localhost:`
    expect(isOriginAllowed('http://localhost.evil.com:80', DEFAULT_ALLOWED_ORIGINS)).toBe(false);
  });

  it('没有 origin 头时不放行', () => {
    expect(isOriginAllowed(undefined, DEFAULT_ALLOWED_ORIGINS)).toBe(false);
    expect(isOriginAllowed('', DEFAULT_ALLOWED_ORIGINS)).toBe(false);
  });

  it('完全匹配的写法照常放行', () => {
    expect(isOriginAllowed('http://192.168.1.10:5173', ['http://192.168.1.10:5173'])).toBe(true);
    expect(isOriginAllowed('http://192.168.1.10:5174', ['http://192.168.1.10:5173'])).toBe(false);
  });
});

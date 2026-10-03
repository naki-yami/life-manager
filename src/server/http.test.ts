// @vitest-environment node
/**
 * HTTP 层的验收：health 免令牌、其余路径 401、CORS 放行规则。
 *
 * 全部走真 `node:http`、真 socket、随机端口（`listen(0)`），不桩 fetch ——
 * 桩掉 fetch 就测不到「头有没有真的发出去」「状态码是不是真的 401」。
 *
 * 断言按「发一个请求 → 看响应」，不测内部函数名。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { connect } from 'node:net';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  DEFAULT_ALLOWED_ORIGINS,
  SYNC_MODULES,
  SERVER_SCHEMA_VERSION,
  type ServerConfig,
} from './config';
import { createLogger, type Logger } from './logger';
import { createRequestHandler } from './http';
import { loadReplica, REPLICA_FILE, type Replica } from './replica';

const TOKEN = 'f'.repeat(64);

interface Harness {
  base: string;
  server: Server;
  logs: string[];
  /** 数据目录，用来断言「磁盘上到底写了什么」 */
  dataDir: string;
  /** 当前副本，用来断言内存状态与注入落盘失败 */
  replica: Replica;
  close: () => Promise<void>;
}

const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

/** 起一个真的服务端，监听 127.0.0.1 的随机端口。 */
async function startHarness(overrides: Partial<ServerConfig> = {}): Promise<Harness> {
  const config: ServerConfig = {
    port: 0,
    host: '127.0.0.1',
    token: TOKEN,
    dataDir: mkdtempSync(join(tmpdir(), 'lm-sync-data-')),
    mirrorDir: '',
    allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
    ...overrides,
  };

  const logs: string[] = [];
  const logger: Logger = createLogger((line) => logs.push(line));
  const { replica } = loadReplica({
    dataDir: config.dataDir,
    now: () => new Date('2026-10-03T00:00:00.000Z'),
  });
  const handler = createRequestHandler({ config, logger, replica });

  const server = createServer(handler);
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    base: `http://127.0.0.1:${port}`,
    server,
    logs,
    dataDir: config.dataDir,
    replica,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('/v1/health', () => {
  it('不需要令牌，返回 ok / seq / schemaVersion / modules', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/health`);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.seq).toBe(0);
    expect(body.schemaVersion).toBe(SERVER_SCHEMA_VERSION);
    // modules 用备份模块名，客户端拿它自查清单一致性
    expect(body.modules).toEqual([...SYNC_MODULES]);
  });

  it('带错令牌也照常返回（它是探针路径，不是受保护路径）', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/health`, {
      headers: { Authorization: `Bearer ${'0'.repeat(64)}` },
    });

    expect(res.status).toBe(200);
  });

  it('GET 以外的方法返回 405', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/health`, { method: 'POST' });

    expect(res.status).toBe(405);
  });
});

describe('鉴权', () => {
  it('缺令牌 → 401', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/push`, { method: 'POST' });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('错令牌 → 401', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${'0'.repeat(64)}` },
    });

    expect(res.status).toBe(401);
  });

  it('格式不对（没有 Bearer 前缀）→ 401', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/push`, {
      method: 'POST',
      headers: { Authorization: TOKEN },
    });

    expect(res.status).toBe(401);
  });

  it('长度不同的令牌 → 401（不能因为长度不等就抛错 500）', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/push`, {
      method: 'POST',
      headers: { Authorization: 'Bearer short' },
    });

    expect(res.status).toBe(401);
  });

  it('对令牌 → 放行到路由（还没实现的路径返回 501，不是 401）', async () => {
    const h = await startHarness();

    // /v1/push 已在工单 03 实现，所以拿还没做的 /v1/snapshot 来验「放行到了路由」
    const res = await fetch(`${h.base}/v1/snapshot`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    expect(res.status).toBe(501);
  });

  it('/v1/push 已实现：对令牌但请求体不合法 → 400（不再是 501）', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    expect(res.status).toBe(400);
  });

  it('鉴权失败时日志记了原因，但响应体不泄露细节', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/push`, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong' },
    });

    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(h.logs.join('\n')).toContain('mismatch');
  });

  it('识别的路径但没实现 → 404（不是 401，避免把未实现误报成鉴权问题）', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/nope`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    expect(res.status).toBe(404);
  });
});

describe('CORS', () => {
  it('放行本机 origin', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('不放行外部 origin', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/health`, {
      headers: { Origin: 'https://evil.example.com' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('预检（OPTIONS）在鉴权之前放行，否则跨源 POST 根本发不出去', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/push`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://127.0.0.1:5173' },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
  });

  it('预检不带令牌也不算未授权', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/push`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:9999' },
    });

    expect(res.status).toBe(204);
  });
});

describe('畸形请求不能让服务端挂掉', () => {
  /**
   * 回归闸：`Host: [` 曾让 `new URL(...)` 抛 ERR_INVALID_URL。那行在鉴权之前执行，
   * 所以一个**不带令牌**的 `/v1/health` 就够打挂整个进程 —— 而服务端按 ADR-0002 是
   * 无人值守跑在用户机器上的，被远程打停等于同步静默失效。
   *
   * 必须用原始 socket：fetch / undici 不允许自定义 `Host`，用它测不到这条路径。
   */
  const rawRequest = (port: number, payload: string): Promise<string> =>
    new Promise((resolve) => {
      const socket = connect(port, '127.0.0.1', () => socket.write(payload));
      let data = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => (data += chunk));
      socket.on('end', () => resolve(data));
      socket.on('error', () => resolve(data));
      setTimeout(() => {
        socket.destroy();
        resolve(data);
      }, 2000);
    });

  it('畸形的 Host 头不会打死进程，之后服务端照常应答', async () => {
    const h = await startHarness();
    const port = (h.server.address() as AddressInfo).port;

    const response = await rawRequest(
      port,
      'GET /v1/health HTTP/1.1\r\nHost: [\r\nConnection: close\r\n\r\n',
    );

    // 关键点：进程还活着 —— 紧接着的正常请求必须照常 200
    const after = await fetch(`${h.base}/v1/health`);
    expect(after.status).toBe(200);
    expect(response).not.toContain('Invalid URL');
  });

  it('主机名带非法方括号的 Host 同样打不挂', async () => {
    const h = await startHarness();
    const port = (h.server.address() as AddressInfo).port;

    await rawRequest(port, 'GET /v1/health HTTP/1.1\r\nHost: ]:99999\r\nConnection: close\r\n\r\n');

    expect((await fetch(`${h.base}/v1/health`)).status).toBe(200);
  });
});

/** POST /v1/push 走真 HTTP —— handlePush 的单测证明不了「路由接对了、落盘了」。 */
describe('POST /v1/push（工单 03 的接口层）', () => {
  const post = (h: Harness, body: unknown, token = TOKEN) =>
    fetch(`${h.base}/v1/push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const change = (over: Record<string, unknown> = {}) => ({
    module: 'tasks',
    key: 't1',
    baseRev: 0,
    op: 'put',
    record: { id: 't1', title: '写周报' },
    ...over,
  });

  it('推一条 → 200 + applied + rev/seq；health 的 seq 跟着变', async () => {
    const h = await startHarness();

    const res = await post(h, { deviceId: 'dev-1', changes: [change()] });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      seq: number;
      results: Array<{ outcome: string; rev: number }>;
    };
    expect(body.results[0]).toMatchObject({ outcome: 'applied', rev: 1 });
    expect(body.seq).toBe(1);

    // seq 是真的写进副本了，不只是响应里的数字
    const health = (await (await fetch(`${h.base}/v1/health`)).json()) as { seq: number };
    expect(health.seq).toBe(1);
  });

  it('同内容重推 → 第二次 noop，且 seq 不变', async () => {
    const h = await startHarness();
    await post(h, { deviceId: 'dev-1', changes: [change()] });

    const res = await post(h, { deviceId: 'dev-1', changes: [change()] });
    const body = (await res.json()) as { seq: number; results: Array<{ outcome: string }> };

    expect(body.results[0]!.outcome).toBe('noop');
    expect(body.seq).toBe(1);
    // 重推不该落盘，所以磁盘上仍是第一次那份
    expect(JSON.parse(readFileSync(join(h.dataDir, REPLICA_FILE), 'utf8'))).toMatchObject({
      sync: { seq: 1 },
    });
  });

  it('两台设备推同一条 → 后到的标 conflict，内容为后到者', async () => {
    const h = await startHarness();
    await post(h, {
      deviceId: 'dev-A',
      changes: [change({ record: { id: 't1', title: 'A 的' } })],
    });

    const res = await post(h, {
      deviceId: 'dev-B',
      changes: [change({ record: { id: 't1', title: 'B 的' } })],
    });
    const body = (await res.json()) as { conflicts: number; results: Array<{ outcome: string }> };

    expect(body.results[0]!.outcome).toBe('conflict');
    expect(body.conflicts).toBe(1);

    // 落盘后磁盘上是后到者的内容
    const onDisk = JSON.parse(readFileSync(join(h.dataDir, REPLICA_FILE), 'utf8')) as {
      data: { tasks: Array<{ title: string }> };
      sync: { devices: Array<{ deviceId: string }> };
    };
    expect(onDisk.data.tasks[0]!.title).toBe('B 的');
    expect(onDisk.sync.devices.map((d) => d.deviceId)).toEqual(['dev-A', 'dev-B']);
  });

  it('一批里混一条坏记录 → 只拒那条，其余照常', async () => {
    const h = await startHarness();

    const res = await post(h, {
      deviceId: 'dev-1',
      changes: [
        change({ key: 'good', record: { id: 'good', title: '好' } }),
        { module: 'settings', key: 's1', baseRev: 0, op: 'put', record: { id: 's1' } },
        { module: 'tasks', key: 't2', baseRev: 0, op: 'put', record: { id: 't2', title: '也好' } },
      ],
    });

    const body = (await res.json()) as { results: Array<{ outcome: string; error?: string }> };
    expect(body.results.map((r) => r.outcome)).toEqual(['applied', 'rejected', 'applied']);
    expect(body.results[1]!.error).toContain('不在册');
  });

  it('请求体不是 JSON → 400；结构不对 → 400 并说清缺什么', async () => {
    const h = await startHarness();

    const bad = await fetch(`${h.base}/v1/push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: '这不是 JSON',
    });
    expect(bad.status).toBe(400);

    const missing = await post(h, { changes: [] });
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { detail: string }).detail).toContain('deviceId');
  });

  it('没令牌 → 401，且一个字节都没写进副本', async () => {
    const h = await startHarness();
    const before = readFileSync(join(h.dataDir, REPLICA_FILE), 'utf8');

    const res = await post(h, { deviceId: 'dev-1', changes: [change()] }, 'wrong-token');

    expect(res.status).toBe(401);
    expect(readFileSync(join(h.dataDir, REPLICA_FILE), 'utf8')).toBe(before);
  });

  it('GET /v1/push → 405', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/push`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    expect(res.status).toBe(405);
  });

  it('客户端版本高于服务端 → 200 但整批 rejected，副本不变', async () => {
    const h = await startHarness();
    const before = readFileSync(join(h.dataDir, REPLICA_FILE), 'utf8');

    const res = await post(h, {
      deviceId: 'dev-1',
      schemaVersion: SERVER_SCHEMA_VERSION + 1,
      changes: [change()],
    });

    const body = (await res.json()) as { results: Array<{ outcome: string; error?: string }> };
    expect(body.results[0]!.outcome).toBe('rejected');
    expect(body.results[0]!.error).toContain('升级服务端');
    expect(readFileSync(join(h.dataDir, REPLICA_FILE), 'utf8')).toBe(before);
  });

  /**
   * 回归闸：落盘失败必须把**内存也退回去**。
   *
   * 否则客户端收到 500 会重试，而它推的内容「已经在内存里了」，重试走幂等分支拿到 `noop` ——
   * 客户端据此以为成功。进程若在下次成功落盘之前挂掉，这次写入既不在磁盘上、也没人知道它丢了。
   */
  it('落盘失败 → 500，且内存改动被回滚（重试能真正重来）', async () => {
    const h = await startHarness();
    // 让副本的写入在 rename 那一刻失败（atomicWrite 的最后一步）
    const replica = h.replica;
    const realSave = replica.save.bind(replica);
    let failNext = true;
    replica.save = () => {
      if (failNext) {
        failNext = false;
        throw new Error('ENOSPC: no space left on device');
      }
      realSave();
    };

    const res = await post(h, { deviceId: 'dev-1', changes: [change()] });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe('replica_write_failed');

    // 关键：内存也被退回去了 —— seq 回到 0、记录不在
    expect(replica.envelope.sync.seq).toBe(0);
    expect(replica.envelope.data.tasks).toEqual([]);

    // 客户端重试：因为内存已回滚，这次重新走真实写入，拿到 applied 而不是 noop
    const retry = await post(h, { deviceId: 'dev-1', changes: [change()] });
    expect(retry.status).toBe(200);
    const body = (await retry.json()) as { results: Array<{ outcome: string }>; seq: number };
    expect(body.results[0]!.outcome).toBe('applied');
    expect(body.seq).toBe(1);
  });
});

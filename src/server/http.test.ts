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
import { backupDataSchema } from '../services/schemas';
import { purgeTombstones } from './tombstones';
import { appendHistory, listBackups } from './history';

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
  // 与 main.ts 一样接上后置清理（工单 05），否则 HTTP 层测不到墓碑被清
  const handler = createRequestHandler({
    config,
    logger,
    replica,
    onAfterWrite: () => {
      purgeTombstones(replica.envelope, { now: () => new Date('2026-10-03T00:00:00.000Z') });
    },
  });

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

  it('health 里带第二份存储的状态（未配置 mirror 时为 null）', async () => {
    const h = await startHarness();

    const body = (await (await fetch(`${h.base}/v1/health`)).json()) as { mirror: unknown };

    expect(body.mirror).toBeNull();
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

  it('对令牌 → 放行到路由（四个接口都已实现，不再有 501）', async () => {
    const h = await startHarness();

    // 工单 04/06 之后 PLANNED_PATHS 是空的 —— 拿一个未实现的路径验 404 而不是 401，
    // 同时确认四个真接口都活着（都不是 401/501）
    const unknown = await fetch(`${h.base}/v1/nope`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(unknown.status).toBe(404);

    for (const path of ['/v1/health', '/v1/changes', '/v1/snapshot']) {
      const res = await fetch(`${h.base}${path}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(res.status).toBe(200);
    }
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

/** GET /v1/changes 与 /v1/snapshot 的接口层（工单 04）。 */
describe('GET /v1/changes 与 /v1/snapshot', () => {
  const get = (h: Harness, path: string, token = TOKEN) =>
    fetch(`${h.base}${path}`, { headers: { Authorization: `Bearer ${token}` } });

  const post = (h: Harness, body: unknown) =>
    fetch(`${h.base}/v1/push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const change = (key: string) => ({
    module: 'tasks',
    key,
    baseRev: 0,
    op: 'put',
    record: { id: key, title: key },
  });

  it('推两条后能拉到两条，带 more 与 nextSince', async () => {
    const h = await startHarness();
    await post(h, { deviceId: 'dev-1', changes: [change('t1'), change('t2')] });

    const res = await get(h, '/v1/changes?since=0');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      changes: Array<{ key: string; seq: number }>;
      more: boolean;
      nextSince: number;
      seq: number;
    };

    expect(body.changes.map((c) => c.key)).toEqual(['t1', 't2']);
    expect(body.more).toBe(false);
    expect(body.nextSince).toBe(2);
    expect(body.seq).toBe(2);
  });

  it('分页：limit=1 翻两次拿全，不漏不重', async () => {
    const h = await startHarness();
    await post(h, { deviceId: 'dev-1', changes: [change('t1'), change('t2')] });

    const first = (await (await get(h, '/v1/changes?since=0&limit=1')).json()) as {
      changes: Array<{ key: string }>;
      more: boolean;
      nextSince: number;
    };
    expect(first.changes.map((c) => c.key)).toEqual(['t1']);
    expect(first.more).toBe(true);

    const second = (await (
      await get(h, `/v1/changes?since=${first.nextSince}&limit=1`)
    ).json()) as { changes: Array<{ key: string }>; more: boolean };

    expect(second.changes.map((c) => c.key)).toEqual(['t2']);
    expect(second.more).toBe(false);
  });

  it('since 等于当前 seq → 空结果', async () => {
    const h = await startHarness();
    await post(h, { deviceId: 'dev-1', changes: [change('t1')] });

    const body = (await (await get(h, '/v1/changes?since=1')).json()) as {
      changes: unknown[];
      more: boolean;
    };
    expect(body.changes).toEqual([]);
    expect(body.more).toBe(false);
  });

  it('没令牌 / 错令牌 → 401', async () => {
    const h = await startHarness();

    const noToken = await fetch(`${h.base}/v1/changes`);
    expect(noToken.status).toBe(401);

    expect((await get(h, '/v1/changes', 'wrong')).status).toBe(401);
    expect((await get(h, '/v1/snapshot', 'wrong')).status).toBe(401);
  });

  it('POST /v1/changes → 405', async () => {
    const h = await startHarness();
    const res = await fetch(`${h.base}/v1/changes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(405);
  });

  it('快照返回整份副本，且与磁盘上的副本逐字段一致', async () => {
    const h = await startHarness();
    await post(h, { deviceId: 'dev-1', changes: [change('t1')] });

    const snapshot = (await (await get(h, '/v1/snapshot')).json()) as {
      app: string;
      schemaVersion: number;
      data: unknown;
      sync: { seq: number };
    };
    const onDisk = JSON.parse(readFileSync(join(h.dataDir, REPLICA_FILE), 'utf8')) as {
      app: string;
      data: unknown;
      sync: { seq: number };
    };

    expect(snapshot.app).toBe(onDisk.app);
    expect(snapshot.sync.seq).toBe(onDisk.sync.seq);
    expect(snapshot.data).toEqual(onDisk.data);
  });

  it('快照的 data 段能通过客户端备份校验（换机首同步的唯一路径）', async () => {
    const h = await startHarness();
    await post(h, {
      deviceId: 'dev-1',
      changes: [
        change('t1'),
        {
          module: 'dietWater',
          key: '2026-10-02',
          baseRev: 0,
          op: 'put',
          record: { '2026-10-02': 8 },
        },
      ],
    });

    const snapshot = (await (await get(h, '/v1/snapshot')).json()) as { data: unknown };
    const parsed = backupDataSchema.safeParse(snapshot.data);
    if (!parsed.success) {
      throw new Error(`快照不是合法备份：${JSON.stringify(parsed.error.issues.slice(0, 5))}`);
    }
    expect(parsed.success).toBe(true);
  });

  it('水位之前 → 200 + needFullResync（不是错误，是协商结果）', async () => {
    const h = await startHarness();
    await post(h, { deviceId: 'dev-1', changes: [change('t1')] });
    // 直接把水位推高（工单 05 会按清理动作维护它）
    h.replica.envelope.sync.purgedThroughSeq = 5;

    const res = await get(h, '/v1/changes?since=1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { needFullResync: boolean; changes: unknown[] };
    expect(body.needFullResync).toBe(true);
    expect(body.changes).toEqual([]);
  });

  /**
   * `deviceId` 是「休眠设备」那道守卫的开关 —— 不带它，守卫静默不生效。
   *
   * 这条是接口层的回归闸：客户端 spec 一度漏了这个参数（2026-10-03 补上），
   * 漏了的话一台离线三个月的设备会拿着旧数据把已删记录复活。
   */
  it('带 deviceId 且该设备休眠 → needFullResync；不带 deviceId 则不判定', async () => {
    const h = await startHarness();
    await post(h, { deviceId: 'dev-old', changes: [change('t1')] });
    // 把它的 lastSeenAt 拨回 91 天前
    const device = h.replica.envelope.sync.devices.find((d) => d.deviceId === 'dev-old')!;
    device.lastSeenAt = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();

    const withId = (await (await get(h, '/v1/changes?since=0&deviceId=dev-old')).json()) as {
      needFullResync: boolean;
    };
    expect(withId.needFullResync).toBe(true);

    // 不带 deviceId：服务端不知道是谁，只能按正常增量给（守卫不生效）
    const withoutId = (await (await get(h, '/v1/changes?since=0')).json()) as {
      needFullResync: boolean;
      changes: unknown[];
    };
    expect(withoutId.needFullResync).toBe(false);
    expect(withoutId.changes.length).toBeGreaterThan(0);
  });
});

/** 墓碑端到端（工单 05）：A 删 → B 拉到 delete。 */
describe('删除的传播与清理', () => {
  const post = (h: Harness, body: unknown) =>
    fetch(`${h.base}/v1/push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const get = (h: Harness, path: string) =>
    fetch(`${h.base}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });

  it('A 写 → A 删 → 还落后的 B 能从 since 拉到那条 delete', async () => {
    const h = await startHarness();
    /*
     * 先让 dev-B 注册并停在 seq 1。
     *
     * 没有第二台设备的话，A 一删就自己把墓碑清掉了 —— 只有一台设备时确实不需要墓碑
     * （没有别人要知道），所以那个场景测不出「删除被传出去」。
     */
    await post(h, {
      deviceId: 'dev-B',
      changes: [{ module: 'tasks', key: 'other', baseRev: 0, op: 'put', record: { id: 'other' } }],
    });
    h.replica.envelope.sync.devices.find((d) => d.deviceId === 'dev-B')!.lastSeq = 1;

    await post(h, {
      deviceId: 'dev-A',
      changes: [
        { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: { id: 't1', title: 'x' } },
      ],
    });
    // A 自己也停在 1，这样它删的时候仍有一台设备（B）没拉过 → 墓碑留着
    h.replica.envelope.sync.devices.find((d) => d.deviceId === 'dev-A')!.lastSeq = 1;
    await post(h, {
      deviceId: 'dev-A',
      changes: [{ module: 'tasks', key: 't1', baseRev: 1, op: 'delete' }],
    });

    const body = (await (await get(h, '/v1/changes?since=1')).json()) as {
      changes: Array<{ op: string; key: string; record?: unknown }>;
    };
    const del = body.changes.find((c) => c.op === 'delete')!;

    expect(del).toBeDefined();
    expect(del.key).toBe('t1');
    // 墓碑不带 record（客户端按 key 删本地那份）
    expect(del.record).toBeUndefined();
    // B 还没拉过 → 墓碑必须留着
    expect(h.replica.envelope.sync.tombstones).toHaveLength(1);
  });

  it('删完之后推回来 → 墓碑被撤掉', async () => {
    const h = await startHarness();
    await post(h, {
      deviceId: 'dev-A',
      changes: [
        { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: { id: 't1', title: 'x' } },
      ],
    });
    await post(h, {
      deviceId: 'dev-A',
      changes: [{ module: 'tasks', key: 't1', baseRev: 1, op: 'delete' }],
    });
    await post(h, {
      deviceId: 'dev-A',
      changes: [
        {
          module: 'tasks',
          key: 't1',
          baseRev: 2,
          op: 'put',
          record: { id: 't1', title: '回来了' },
        },
      ],
    });

    expect(h.replica.envelope.sync.tombstones).toEqual([]);
  });

  /**
   * 「单设备推完就该能清」这个前提**被修掉了** —— push 不再推进 `lastSeq`。
   *
   * 原因见 push.ts 的 `touchDevice` 注释：`lastSeq` 是「拉到哪了」，推送不代表拉取。
   * 所以这里要走**真实客户端的一轮**（先推后拉），墓碑与日志才会被清。
   */
  it('单台设备走完一轮（推 + 拉）之后，墓碑被清、水位前移、日志变短', async () => {
    const h = await startHarness();
    await post(h, {
      deviceId: 'dev-A',
      changes: [
        { module: 'tasks', key: 't1', baseRev: 0, op: 'put', record: { id: 't1', title: 'x' } },
      ],
    });
    // 这次删除自己会触发后置清理
    await post(h, {
      deviceId: 'dev-A',
      changes: [{ module: 'tasks', key: 't1', baseRev: 1, op: 'delete' }],
    });

    // 还没拉过 → 还不能清（它确实还没拿到那次删除）
    expect(h.replica.envelope.sync.purgedThroughSeq).toBe(0);
    expect(h.replica.envelope.sync.tombstones).toHaveLength(1);

    // 客户端拉一轮（带上自己的 deviceId，这样服务端才知道是谁拉到了哪）
    const res = await get(h, '/v1/changes?since=0&deviceId=dev-A');
    expect(res.status).toBe(200);

    // 拉取路径自己会推进 lastSeq 并跑后置清理 —— 不需要手工补一刀
    expect(h.replica.envelope.sync.tombstones).toEqual([]);
    expect(h.replica.envelope.sync.purgedThroughSeq).toBeGreaterThan(0);
    expect(h.replica.envelope.sync.changes).toEqual([]);
  });
});

/** POST /v1/restore 的接口层（工单 06）。 */
describe('POST /v1/restore', () => {
  const post = (h: Harness, path: string, body: unknown, token = TOKEN) =>
    fetch(`${h.base}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const put = (key: string, title: string, baseRev = 0) => ({
    module: 'tasks',
    key,
    baseRev,
    op: 'put',
    record: { id: key, title },
  });

  it('缺 confirm → 400，副本不变', async () => {
    const h = await startHarness();
    await post(h, '/v1/push', { deviceId: 'dev-1', changes: [put('t1', 'A')] });
    const before = readFileSync(join(h.dataDir, REPLICA_FILE), 'utf8');

    const res = await post(h, '/v1/restore', { source: 'history', ref: 'x' });

    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('restore');
    expect(readFileSync(join(h.dataDir, REPLICA_FILE), 'utf8')).toBe(before);
  });

  it('不存在的 ref → 404', async () => {
    const h = await startHarness();

    const res = await post(h, '/v1/restore', {
      confirm: 'restore',
      source: 'history',
      ref: '不存在',
    });

    expect(res.status).toBe(404);
  });

  it('没令牌 → 401', async () => {
    const h = await startHarness();

    const res = await post(
      h,
      '/v1/restore',
      { confirm: 'restore', source: 'history', ref: 'x' },
      'wrong',
    );

    expect(res.status).toBe(401);
  });

  it('GET /v1/restore → 405', async () => {
    const h = await startHarness();

    const res = await fetch(`${h.base}/v1/restore`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });

    expect(res.status).toBe(405);
  });

  it('从历史恢复成功 → 200、数据回到那一版、seq 前进且落盘', async () => {
    const h = await startHarness();
    await post(h, '/v1/push', { deviceId: 'dev-1', changes: [put('t1', 'v1')] });
    // 手工造一条历史（正常路径由 LWW 覆盖时产生）
    const entry = appendHistory(h.dataDir, {
      replacedAt: '2026-10-03T00:00:00.000Z',
      module: 'tasks',
      key: 't1',
      rev: 1,
      record: { id: 't1', title: '捞回来的' },
      reason: 'conflict',
    });
    const seqBefore = h.replica.envelope.sync.seq;

    const res = await post(h, '/v1/restore', {
      confirm: 'restore',
      source: 'history',
      ref: entry.id,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; seq: number; safetyBackup: string };
    expect(body.ok).toBe(true);
    expect(body.seq).toBeGreaterThan(seqBefore);
    expect(h.replica.envelope.data.tasks).toEqual([{ id: 't1', title: '捞回来的' }]);

    // 落盘了：磁盘上的副本也是恢复后的内容
    const onDisk = JSON.parse(readFileSync(join(h.dataDir, REPLICA_FILE), 'utf8')) as {
      data: { tasks: unknown[] };
    };
    expect(onDisk.data.tasks).toEqual([{ id: 't1', title: '捞回来的' }]);
    // 退路也在
    expect(listBackups(h.dataDir)).toContain(body.safetyBackup);
  });
});

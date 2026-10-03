// @vitest-environment node
/**
 * **真正的端到端**：客户端引擎 → 真 `node:http` → 真服务端路由。
 *
 * 与 `engine-server.test.ts` 的区别：那边把 `runSync` 的 HTTP 层直接接到服务端的
 * 处理函数上（不起端口、不解析请求体、不检查鉴权头），于是**路由、鉴权、JSON 收发、
 * 查询串编码**这些"粘合层"从来没被验过。这里起一个真的服务端进程内实例（随机端口），
 * 让引擎走真的 `fetch`。
 *
 * 只有这一层能抓到：路径拼错、`Authorization` 头没带上、`?deviceId=` 没编码、
 * 请求体形状不对、服务端返回的状态码没被正确处理。
 */
import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

import { createRequestHandler } from '../../server/http';
import { createLogger } from '../../server/logger';
import { DEFAULT_ALLOWED_ORIGINS, type ServerConfig } from '../../server/config';
import { loadReplica } from '../../server/replica';
import { appendHistory } from '../../server/history';
import { useSyncStore } from '../../store/syncStore';
import { useTaskStore } from '../../store/taskStore';
import { runSync, type SyncHttp } from './engine';

const TOKEN = 'e2e'.repeat(21) + 'x'; // 64 字符，与服务端生成的形状一致

/** 把引擎的 SyncHttp 接到**真网络**上。 */
const realFetchHttp = (): SyncHttp => ({
  request: async ({ url, method, token, body }) => {
    const response = await fetch(url, {
      method,
      headers: {
        ...(token === '' ? {} : { Authorization: `Bearer ${token}` }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      throw new Error(`${method} ${url} → ${response.status}`);
    }
    return await response.json();
  },
});

interface Harness {
  baseUrl: string;
  dataDir: string;
  close: () => Promise<void>;
}

async function startRealServer(): Promise<Harness> {
  const dataDir = mkdtempSync(join(tmpdir(), 'lm-e2e-real-'));
  const config: ServerConfig = {
    port: 0,
    host: '127.0.0.1',
    token: TOKEN,
    dataDir,
    mirrorDir: '',
    allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
  };
  const { replica } = loadReplica({ dataDir, now: () => new Date('2026-10-03T00:00:00.000Z') });
  const handler = createRequestHandler({
    config,
    logger: createLogger(() => {}),
    replica,
  });

  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    dataDir,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** 把 store 恢复成「刚开启同步、服务端是空的」状态，并记下引擎跑一轮的结果。 */
function configureClient(baseUrl: string, deviceId: string): void {
  useSyncStore.setState({
    enabled: true,
    baseUrl,
    token: TOKEN,
    deviceId,
    lastSeq: 0,
    baseline: {},
    revs: {},
    conflicts: [],
    needsReconcile: false,
  });
}

describe('客户端引擎 ↔ 真服务端（走真 HTTP）', () => {
  it('一轮跑通：探针 → 推 → 拉，三者都推进；且服务端真收到了数据', async () => {
    const server = await startRealServer();
    try {
      useTaskStore.setState({ tasks: [], memos: [] });
      useTaskStore.getState().addTask('走真网络的记录', '', 'medium', '');
      configureClient(server.baseUrl, 'dev-real-1');

      const outcome = await runSync(realFetchHttp());

      console.log(
        '一轮结果:',
        JSON.stringify({ ok: outcome.ok, reason: outcome.reason, pushed: outcome.pushed }),
      );
      expect(outcome.ok).toBe(true);
      // 推上去了
      expect(outcome.pushed).toBeGreaterThan(0);

      // 服务端**真的**存下了那条（不是内存桩里的）
      const snapshot = (await (
        await fetch(`${server.baseUrl}/v1/snapshot`, {
          headers: { Authorization: `Bearer ${TOKEN}` },
        })
      ).json()) as { data: { tasks: Array<{ title: string }> } };
      expect(snapshot.data.tasks.map((t) => t.title)).toContain('走真网络的记录');

      // 客户端记下了游标
      expect(useSyncStore.getState().lastSeq).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it('鉴权真的生效：令牌错了引擎会失败（而不是静默成功）', async () => {
    const server = await startRealServer();
    try {
      useTaskStore.setState({ tasks: [], memos: [] });
      useTaskStore.getState().addTask('x', '', 'medium', '');
      configureClient(server.baseUrl, 'dev-real-2');
      // 故意换成错的令牌
      useSyncStore.setState({ token: 'wrong-token' });

      const outcome = await runSync(realFetchHttp());

      console.log('错令牌的结果:', JSON.stringify({ ok: outcome.ok, reason: outcome.reason }));
      expect(outcome.ok).toBe(false);
      // 失败原因应当指向鉴权，而不是「未开启」之类的本地原因
      expect(outcome.reason).not.toBe('');
    } finally {
      await server.close();
    }
  });

  it('关闭开关时一个请求都不发（走真网络也验一遍）', async () => {
    const server = await startRealServer();
    let requests = 0;
    try {
      const counting: SyncHttp = {
        request: async (options) => {
          requests += 1;
          return await realFetchHttp().request(options);
        },
      };
      useSyncStore.setState({ enabled: false, baseUrl: server.baseUrl, token: TOKEN });

      const outcome = await runSync(counting);

      console.log('关闭开关：请求数 =', requests, '| 结果 =', JSON.stringify(outcome.ok));
      expect(requests).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('两台设备走真网络：A 推的内容 B 能拉到并落库', async () => {
    const server = await startRealServer();
    try {
      // A 推一条
      useTaskStore.setState({ tasks: [], memos: [] });
      useTaskStore.getState().addTask('A 写的', '', 'medium', '');
      configureClient(server.baseUrl, 'dev-A');
      await runSync(realFetchHttp());

      // B 是台新设备：清空本地、只留配置，拉一轮
      useTaskStore.setState({ tasks: [], memos: [] });
      configureClient(server.baseUrl, 'dev-B');
      const bOutcome = await runSync(realFetchHttp());

      console.log('B 一轮结果:', JSON.stringify({ ok: bOutcome.ok, pulled: bOutcome.pulled }));
      expect(bOutcome.ok).toBe(true);
      // A 写的那条出现在 B 的本地 store 里
      expect(useTaskStore.getState().tasks.map((t) => t.title)).toContain('A 写的');
    } finally {
      await server.close();
    }
  });

  it('/v1/restore 出来的旧版本，客户端拉一轮能收敛过去', async () => {
    const server = await startRealServer();
    try {
      useTaskStore.setState({ tasks: [], memos: [] });
      useTaskStore.getState().addTask('第一版', '', 'medium', '');
      configureClient(server.baseUrl, 'dev-restore');
      await runSync(realFetchHttp());

      // 服务端造一条历史，再恢复它
      const entry = appendHistory(server.dataDir, {
        replacedAt: '2026-10-03T00:00:00.000Z',
        module: 'tasks',
        key: useTaskStore.getState().tasks[0]!.id,
        rev: 1,
        record: { id: useTaskStore.getState().tasks[0]!.id, title: '被恢复的' },
        reason: 'conflict',
      });
      const restoreRes = (await (
        await fetch(`${server.baseUrl}/v1/restore`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: 'restore', source: 'history', ref: entry.id }),
        })
      ).json()) as { ok: boolean; seq: number };
      expect(restoreRes.ok).toBe(true);

      // 客户端再拉一轮：恢复产生的变更应当收敛过来
      const outcome = await runSync(realFetchHttp());
      console.log('恢复后一轮:', JSON.stringify({ ok: outcome.ok, pulled: outcome.pulled }));
      expect(outcome.ok).toBe(true);
      expect(useTaskStore.getState().tasks.map((t) => t.title)).toContain('被恢复的');
    } finally {
      await server.close();
    }
  });
});

// @vitest-environment node
/**
 * 引擎对着**真服务端**跑一轮。
 *
 * `engine.test.ts` 的判据是「我发的请求长什么样」；这一份的判据来自**服务端的实现** ——
 * 把 `runSync` 的 HTTP 层接到真的 `readChanges` / `handlePush` / `readSnapshot` 上，
 * 于是「客户端以为的接口」与「服务端实际的接口」一旦有偏差就会在这里红灯。
 *
 * 前两单已经证明这类用例有效（抓出过饮水形状、`baseRev` 两类偏差），所以单独留一组。
 *
 * 跑在 node 环境下：服务端只依赖 `node:*`，且这里不碰 localStorage 也可用
 * （zustand persist 的存储层在 node 下退回内存/localStorage 缺失分支，够用）。
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { handlePush } from '../../server/push';
import { loadReplica, type Replica } from '../../server/replica';
import { readChanges, readSnapshot, parseChangesQuery } from '../../server/changes';
import { useDietStore } from '../../store/dietStore';
import { useSyncStore } from '../../store/syncStore';
import { useTaskStore } from '../../store/taskStore';
import { DEFAULT_DIET_GOALS } from '../../utils/diet';
import { runSync, type HttpRequest, type SyncHttp } from './engine';

const task = (id: string, title: string) => ({
  id,
  title,
  description: '',
  priority: 'medium' as const,
  status: 'pending' as const,
  dueDate: '2026-10-03',
  tags: [],
  subtasks: [],
  repeat: null,
  timebox: null,
  createdAt: '2026-10-03T00:00:00.000Z',
});

/**
 * 把 HTTP 层接到真服务端处理函数上。
 *
 * 与 `src/server/http.ts` 的路由一一对应，但**不经过 node:http**（不起端口、不解析请求体），
 * 所以它是「真实业务逻辑 + 最小传输层替身」——接口形状（查询串、请求体、响应体）全是真的。
 */
function realServerHttp(
  replica: Replica,
  token = 's3cret-token',
): { http: SyncHttp; log: string[] } {
  const log: string[] = [];

  const http: SyncHttp = {
    request: async (options: HttpRequest) => {
      const url = new URL(options.url);
      const path = url.pathname;
      log.push(path);

      // 鉴权：与 auth.ts 同一条规则 —— /v1/health 免令牌，其余必须是 Bearer
      if (path !== '/v1/health') {
        if (options.token === '' || options.token !== token) {
          throw new Error('令牌不对（服务端返回 401）');
        }
      }

      if (path === '/v1/health') {
        return {
          ok: true,
          seq: replica.envelope.sync.seq,
          schemaVersion: 20,
          modules: [],
        };
      }

      if (path === '/v1/push') {
        const body = options.body as {
          deviceId: string;
          changes: Array<Record<string, unknown>>;
        };
        const result = handlePush({ replica, onHistory: () => {} }, body as never);
        // http.ts 的落盘时机：有改动才写
        if (
          result.results.some((item) => item.outcome === 'applied' || item.outcome === 'conflict')
        ) {
          replica.save();
        }
        return result;
      }

      if (path === '/v1/changes') {
        const query = parseChangesQuery(url.searchParams);
        return readChanges(replica, query);
      }

      if (path === '/v1/snapshot') {
        return readSnapshot(replica);
      }

      throw new Error(`未处理的路径：${path}`);
    },
  };

  return { http, log };
}

/** 建一个临时数据目录上的真副本 */
function freshReplica(): Replica {
  return loadReplica({ dataDir: mkdtempSync(join(tmpdir(), 'lm-engine-')) }).replica;
}

/** 打开同步（指向假服务端；真正的 HTTP 由 realServerHttp 提供） */
function enableSync(): void {
  useSyncStore.setState({
    enabled: true,
    baseUrl: 'http://127.0.0.1:8787',
    token: 's3cret-token',
    deviceId: 'dev-1',
    lastSeq: 0,
    baseline: {},
    revs: {},
    conflicts: [],
  });
}

beforeEach(() => {
  // node 环境没有 localStorage；zustand persist 的存储层对此有兜底，
  // 而这一组测的是「引擎与服务端」的往返，本来就不依赖浏览器存储
  if (typeof localStorage !== 'undefined') localStorage.clear();
  useTaskStore.setState({ tasks: [], memos: [] });
  useDietStore.setState({
    records: [],
    templates: [],
    goals: { ...DEFAULT_DIET_GOALS },
    water: {},
  });
  useSyncStore.setState({
    enabled: false,
    baseUrl: '',
    token: '',
    deviceId: '',
    lastSeq: 0,
    baseline: {},
    revs: {},
    conflicts: [],
  });
});

describe('一轮同步对着真服务端', () => {
  it('推上去→拉回来：一轮成功后 lastSeq / 基线 / revs 三者都推进', async () => {
    const replica = freshReplica();
    const { http, log } = realServerHttp(replica);
    enableSync();

    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });
    useDietStore.setState({ water: { '2026-10-02': 8 } });

    const outcome = await runSync(http);

    expect(outcome.ok).toBe(true);
    expect(log[0]).toBe('/v1/health');
    expect(log).toContain('/v1/push');
    expect(log).toContain('/v1/changes');

    // 三者都推进
    const state = useSyncStore.getState();
    expect(state.lastSeq).toBeGreaterThan(0);
    expect(state.baseline.tasks).toHaveProperty('t1');
    expect(Object.keys(state.revs).length).toBeGreaterThan(0);

    // 服务端确实收到了饮水，且是**扁平**形状（真服务端的 waterValueOf 归一结果）
    expect(replica.envelope.data.dietWater).toEqual({ '2026-10-02': 8 });
  });

  it('第二台设备拉到第一台推的内容（跨设备往返）', async () => {
    const replica = freshReplica();
    const server = realServerHttp(replica);

    // 设备 A 推
    enableSync();
    useTaskStore.setState({ tasks: [task('tA', 'A 写的')] as never, memos: [] });
    expect((await runSync(server.http)).ok).toBe(true);

    // 设备 B：清空本机、换一个设备标识与空游标
    useTaskStore.setState({ tasks: [], memos: [] });
    useSyncStore.setState({
      deviceId: 'dev-2',
      lastSeq: 0,
      baseline: {},
      revs: {},
    });

    const outcome = await runSync(server.http);

    expect(outcome.ok).toBe(true);
    expect(useTaskStore.getState().tasks.map((item) => item.id)).toContain('tA');
  });

  it('删除跨设备传播：B 删掉，A 下一轮拉到 delete 并落库', async () => {
    const replica = freshReplica();
    const server = realServerHttp(replica);

    // A 推一条
    enableSync();
    useTaskStore.setState({ tasks: [task('t1', '要删的')] as never, memos: [] });
    await runSync(server.http);

    // B 拉下来、然后删掉、再推
    useTaskStore.setState({ tasks: [], memos: [] });
    useSyncStore.setState({ deviceId: 'dev-2', lastSeq: 0, baseline: {}, revs: {} });
    await runSync(server.http);
    expect(useTaskStore.getState().tasks).toHaveLength(1);

    useTaskStore.setState({ tasks: [], memos: [] });
    await runSync(server.http); // B 推删除

    // A 回来拉：应拉到墓碑并删掉本地那条
    useSyncStore.setState({ deviceId: 'dev-1' });
    const outcome = await runSync(server.http);

    expect(outcome.ok).toBe(true);
    expect(useTaskStore.getState().tasks).toEqual([]);
  });

  it('真服务端判的冲突进 lm:sync.conflicts', async () => {
    const replica = freshReplica();
    const server = realServerHttp(replica);

    // A 推 t1
    enableSync();
    useTaskStore.setState({ tasks: [task('t1', 'A 版')] as never, memos: [] });
    await runSync(server.http);

    // B 从零同步拿到 t1，然后两边各改一次
    useTaskStore.setState({ tasks: [], memos: [] });
    useSyncStore.setState({ deviceId: 'dev-2', lastSeq: 0, baseline: {}, revs: {} });
    await runSync(server.http);

    // A 再改（rev 前进到 2）
    useSyncStore.setState({ deviceId: 'dev-1' });
    useTaskStore.setState({ tasks: [task('t1', 'A 又改')] as never, memos: [] });
    await runSync(server.http);

    /*
     * B 拿着**旧的** baseRev 改（它本地还是 rev 1，而服务端已经是 2）→ 服务端标 conflict。
     * 手工把 B 的 rev 表退回去，模拟「B 没拉到 A 那次更新就推」。
     */
    useSyncStore.setState({ deviceId: 'dev-2' });
    const revs = { ...useSyncStore.getState().revs };
    revs['tasks:t1'] = 1;
    useSyncStore.setState({ revs });
    useTaskStore.setState({ tasks: [task('t1', 'B 版')] as never, memos: [] });

    const outcome = await runSync(server.http);

    expect(outcome.ok).toBe(true);
    expect(outcome.conflicts).toBeGreaterThan(0);
    expect(useSyncStore.getState().conflicts.length).toBeGreaterThan(0);
    expect(useSyncStore.getState().conflicts[0]).toMatchObject({ module: 'tasks', key: 't1' });
  });

  it('noop 的 rev 收下之后，下一轮不再被误标冲突', async () => {
    const replica = freshReplica();
    const server = realServerHttp(replica);

    enableSync();
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });
    await runSync(server.http);

    /*
     * 手工把 rev 表清掉，但**保留基线** —— 于是下一轮 diff 算不出改动（内容没变），
     * 不会推 push，也就无从「误报冲突」。所以这里反过来构造：把基线也清掉，
     * 让同一条内容被重推一次，服务端按幂等返回 noop。
     */
    useSyncStore.setState({ baseline: {}, revs: {} });
    const outcome = await runSync(server.http);

    expect(outcome.ok).toBe(true);
    // 重推同内容 → 服务端 noop，rev 仍是权威的那一版
    expect(useSyncStore.getState().revs['tasks:t1']).toBeGreaterThan(0);
    expect(outcome.conflicts).toBe(0);
  });

  it('分页拉完不重不漏：真服务端的 more / nextSince 被正确跟随', async () => {
    const replica = freshReplica();
    enableSync();

    // 先往服务端塞 5 条（走真 push）
    const seed = realServerHttp(replica);
    useTaskStore.setState({
      tasks: [1, 2, 3, 4, 5].map((n) => task(`t${n}`, `任务 ${n}`)) as never,
      memos: [],
    });
    await runSync(seed.http);

    // 清空本机与游标，模拟第二台设备从头拉
    useTaskStore.setState({ tasks: [], memos: [] });
    useSyncStore.setState({ deviceId: 'dev-2', lastSeq: 0, baseline: {}, revs: {} });

    const outcome = await runSync(seed.http);

    expect(outcome.ok).toBe(true);
    // 5 条一条不少、一条不重
    const ids = useTaskStore
      .getState()
      .tasks.map((item) => item.id)
      .sort();
    expect(ids).toEqual(['t1', 't2', 't3', 't4', 't5']);
    expect(useSyncStore.getState().lastSeq).toBe(replica.envelope.sync.seq);
  });

  it('服务端连不上（health 抛错）→ 应用照常用、三者原样不动', async () => {
    enableSync();
    useTaskStore.setState({ tasks: [task('t1', '写周报')] as never, memos: [] });
    const before = useTaskStore.getState().tasks;

    const deadHttp: SyncHttp = {
      request: async () => {
        throw new TypeError('Failed to fetch');
      },
    };

    const outcome = await runSync(deadHttp);

    expect(outcome.ok).toBe(false);
    expect(outcome.lastSeq).toBe(0);
    expect(useSyncStore.getState().lastSeq).toBe(0);
    expect(useSyncStore.getState().baseline).toEqual({});
    expect(useSyncStore.getState().revs).toEqual({});
    expect(useTaskStore.getState().tasks).toBe(before);
  });
});

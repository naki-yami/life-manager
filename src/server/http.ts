/**
 * HTTP 层：路由、JSON 收发、CORS。
 *
 * 这一层只管「把请求翻译成一次处理」，业务状态在副本里。已注册但还没实现的路径返回 501
 * 而不是 404 —— 让客户端能看到「服务在、但这条路还没做」，而不是以为连错了地址。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseChangesQuery, readChanges, readSnapshot } from './changes.ts';
import { checkAuth, isPublicPath } from './auth.ts';
import {
  isOriginAllowed,
  SERVER_SCHEMA_VERSION,
  SYNC_MODULES,
  type ServerConfig,
} from './config.ts';
import type { Logger } from './logger.ts';
import { handlePush, type HistorySink, type PushRequest } from './push.ts';
import type { Replica } from './replica.ts';
import { restoreReplica, type RestoreRequest } from './restore.ts';
import { mirrorHealth, type Mirror } from './mirror.ts';

/** 还没实现的路径。做一个删一个 —— 删到空就说明接口齐了。 */
const PLANNED_PATHS: readonly string[] = [];

/** 请求体上限：本机服务，正常批次是几十 KB 量级；给足余量但别让人一POST打满内存。 */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

export interface RequestContext {
  config: ServerConfig;
  logger: Logger;
  /** 副本（工单 02 起有）。`/v1/health` 与 `/v1/push` 都从它读实时状态。 */
  replica: Replica;
  /**
   * 一次成功落盘之后的钩子。工单 05 用它清墓碑（清理只在有新写入时才可能有效果）。
   * 失败了不影响这次写入的结果，所以调用方要自己把它包进 try/catch。
   */
  onAfterWrite?: () => void;
  /**
   * 历史落点（工单 06）：被 LWW 覆盖或删除的旧版本。默认什么都不做 —— 测试里可以不接。
   */
  onHistory?: HistorySink;
  /**
   * 第二份存储（工单 07）。给了就在 `/v1/health` 里报它的状态 ——
   * 「副本写不进去」是 ADR 记下的回滚信号之一，设置页要能看见。
   */
  mirror?: Mirror;
}

/** 读请求体，超过上限就中止。 */
function readBody(req: IncomingMessage, limit = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error(`请求体超过 ${limit} 字节`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** CORS：只有被放行的 origin 才拿到放行头；其它 origin 不带，浏览器自然会拦。 */
function applyCors(req: IncomingMessage, res: ServerResponse, config: ServerConfig): void {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && isOriginAllowed(origin, config.allowedOrigins)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    // 这是一个本机服务，别让任何中间层缓存鉴权结果
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

/**
 * 处理一个请求。
 *
 * 写操作（POST）在工单 01 里一律不落地 —— 这是验收里「错令牌 → 401 且不写任何数据」
 * 能成立的前提：鉴权失败时在**任何**副作用之前就返回。
 */
/**
 * 解析请求 URL。
 *
 * `Host` 完全由客户端控制，畸形的值（实测 `Host: [`）会让 `new URL` 抛 `ERR_INVALID_URL`。
 * 不接住它，这一个异常就会**打挂整个进程** —— 而且是在鉴权之前，所以一个不带令牌的
 * `/v1/health` 就够 —— 服务端按 ADR-0002 是无人值守跑在用户机器上的，被远程打停等于同步静默失效。
 *
 * 解析不出时退回只用 `req.url`（相对解析，不碰 Host）：路径本身照常路由，
 * 我们并不依赖 base URL 里的 host 做任何判断。
 */
function parseRequestUrl(rawUrl: string | undefined): URL | null {
  const path = rawUrl && rawUrl.trim() !== '' ? rawUrl : '/';
  try {
    return new URL(path, 'http://127.0.0.1');
  } catch {
    return null;
  }
}

export function createRequestHandler(context: RequestContext) {
  const { config, logger, replica, onAfterWrite, onHistory, mirror } = context;

  return function handle(req: IncomingMessage, res: ServerResponse): void {
    const url = parseRequestUrl(req.url);
    if (url === null) {
      // 连路径都解析不出来：记一行日志（排查用），回 400，绝不让异常冒出去
      logger.warn(`${req.method} 收到无法解析的请求行，已拒绝`);
      sendJson(res, 400, { error: 'bad_request' });
      return;
    }
    const pathname = url.pathname;

    applyCors(req, res, config);

    // 预检：浏览器发 OPTIONS 时不带 Authorization，必须在鉴权之前放行，
    // 否则每个跨源 POST 都会因为预检 401 而根本发不出去。
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!isPublicPath(pathname)) {
      const auth = checkAuth(req.headers.authorization, config.token);
      if (!auth.ok) {
        // 日志记原因（排查用），响应体不回显细节（不给爆破者信号）
        logger.warn(`${req.method} ${pathname} 拒绝：令牌 ${auth.reason}`);
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
    }

    if (pathname === '/v1/health') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        seq: replica.envelope.sync.seq,
        schemaVersion: SERVER_SCHEMA_VERSION,
        modules: [...SYNC_MODULES],
        // 第二份存储的状态（ADR 的回滚信号之一）：设置页要能看出「副本写不进去」
        mirror: mirror ? mirrorHealth(mirror) : null,
      });
      return;
    }

    if (pathname === '/v1/changes') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
      }
      const page = readChanges(replica, parseChangesQuery(url.searchParams));
      if (page.needFullResync) {
        // 不是错误，是「你得走全量对账」—— 客户端据此去拉 /v1/snapshot。
        // 用 200 而不是 4xx：它是一次**成功**的协商结果，客户端要靠它做正常分支。
        logger.warn(
          `changes：since=${url.searchParams.get('since') ?? '0'} 不再可用` +
            `（设备 ${url.searchParams.get('deviceId') ?? '(未报)'}），要求全量对账`,
        );
      }
      sendJson(res, 200, page);
      return;
    }

    if (pathname === '/v1/snapshot') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
      }
      sendJson(res, 200, readSnapshot(replica));
      return;
    }

    if (pathname === '/v1/restore') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
      }
      void readBody(req)
        .then((raw) => {
          let body: unknown;
          try {
            body = JSON.parse(raw);
          } catch {
            sendJson(res, 400, { error: 'bad_json' });
            return;
          }
          const result = restoreReplica(replica, (body ?? {}) as RestoreRequest, config.dataDir);
          if (!result.ok) {
            logger.warn(`restore 被拒：${result.error}`);
            sendJson(res, result.status, { error: result.error });
            return;
          }
          try {
            replica.save();
            onAfterWrite?.();
          } catch (error) {
            replica.rollback();
            logger.error(
              `restore 落盘失败，已回滚：${error instanceof Error ? error.message : String(error)}`,
            );
            sendJson(res, 500, { error: 'replica_write_failed' });
            return;
          }
          logger.info(
            `restore 完成：来源 ${String((body as RestoreRequest).source)}，` +
              `ref=${String((body as RestoreRequest).ref)}，seq=${result.seq}`,
          );
          sendJson(res, 200, result);
        })
        .catch((error: unknown) => {
          logger.warn(`读请求体失败：${error instanceof Error ? error.message : String(error)}`);
          if (!res.headersSent) sendJson(res, 400, { error: 'bad_request' });
        });
      return;
    }

    if (pathname === '/v1/push') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
      }
      // 「耗时」从收到请求算起（spec 要求每次同步记一行含耗时）
      const startedAt = Date.now();
      // 读体 + 处理是异步的（要等数据到齐），所以这一支单独走 promise 链。
      // 任何异常都在这里收住并回 400/500 —— 不能让一个坏请求打死进程（工单 01 的教训）。
      void readBody(req)
        .then((raw) => {
          let body: unknown;
          try {
            body = JSON.parse(raw);
          } catch {
            sendJson(res, 400, { error: 'bad_json' });
            return;
          }
          const problem = validatePushRequest(body);
          if (problem !== null) {
            sendJson(res, 400, { error: 'bad_request', detail: problem });
            return;
          }
          const result = handlePush({ replica, logger, onHistory }, body as PushRequest);
          // 有改动就落盘。noop / rejected 不该产生写盘 —— 那会让「幂等不写历史」这条
          // 在磁盘层面也不成立（每次重推都改 exportedAt）。
          if (
            result.results.some((item) => item.outcome === 'applied' || item.outcome === 'conflict')
          ) {
            try {
              replica.save();
            } catch (error) {
              /*
               * 落盘失败必须**把内存也退回去**。
               *
               * 不然：客户端收到 500 会重试，而它推的内容「已经在内存里了」，重试走幂等分支
               * 拿到 `noop` —— 客户端据此以为成功。若进程在下次成功落盘之前挂掉，
               * 这次写入就既不在磁盘上、也没人知道它丢了。
               * 回滚之后重试会重新走一遍真实写入，这个 500 才是诚实的。
               */
              replica.rollback();
              logger.error(
                `副本落盘失败，已回滚内存改动：${error instanceof Error ? error.message : String(error)}`,
              );
              sendJson(res, 500, { error: 'replica_write_failed' });
              return;
            }
            // 落盘成功之后才做后置动作（例如清墓碑）—— 顺序反了会把没存下来的改动算进去
            onAfterWrite?.();
          }
          // 每次同步记一行：设备、推了多少条、冲突数、耗时（spec「可观测与运维」）
          logger.info(
            `push from ${(body as PushRequest).deviceId}：${result.results.length} 条，` +
              `${result.conflicts} 冲突，seq=${result.seq}，耗时 ${Date.now() - startedAt}ms`,
          );
          sendJson(res, 200, result);
        })
        .catch((error: unknown) => {
          logger.warn(`读请求体失败：${error instanceof Error ? error.message : String(error)}`);
          if (!res.headersSent) sendJson(res, 400, { error: 'bad_request' });
        });
      return;
    }

    if ((PLANNED_PATHS as readonly string[]).includes(pathname)) {
      sendJson(res, 501, { error: 'not_implemented', path: pathname });
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  };
}

/** 请求体形状检查。缺字段是客户端 bug，回 400 并说清缺什么，别让它变成 500 或静默无操作。 */
function validatePushRequest(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return '请求体应为对象';
  const root = body as Record<string, unknown>;
  if (typeof root.deviceId !== 'string' || root.deviceId.trim() === '') {
    return 'deviceId 应为非空字符串';
  }
  if (!Array.isArray(root.changes)) return 'changes 应为数组';
  for (const change of root.changes) {
    if (typeof change !== 'object' || change === null || Array.isArray(change)) {
      return 'changes 里的每一项应为对象';
    }
    const item = change as Record<string, unknown>;
    if (typeof item.module !== 'string' || item.module === '')
      return 'change.module 应为非空字符串';
    if (typeof item.key !== 'string' || item.key === '') return 'change.key 应为非空字符串';
    if (item.op !== 'put' && item.op !== 'delete') return "change.op 应为 'put' 或 'delete'";
    if (typeof item.baseRev !== 'number' || !Number.isFinite(item.baseRev)) {
      return 'change.baseRev 应为数字';
    }
  }
  return null;
}

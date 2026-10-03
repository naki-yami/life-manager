/**
 * HTTP 层：路由、JSON 收发、CORS。
 *
 * 这一层只管「把请求翻译成一次处理」，业务状态（副本、seq、墓碑）在工单 02 之后才有，
 * 所以工单 01 只实现 `/v1/health`，其余已注册路径返回「尚未实现」而不是 404 ——
 * 让客户端能看到「服务在、但这条路还没做」，而不是以为连错了地址。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkAuth, isPublicPath } from './auth.ts';
import { isOriginAllowed, type ServerConfig } from './config.ts';
import type { Logger } from './logger.ts';

/** 工单 02 会实现它们；现在先如实报「未实现」。 */
const PLANNED_PATHS = ['/v1/changes', '/v1/push', '/v1/snapshot', '/v1/restore'] as const;

export interface RequestContext {
  config: ServerConfig;
  logger: Logger;
  /** 当前全局 seq。工单 02 起由副本提供；工单 01 恒为 0。 */
  seq: number;
  /** 副本结构版本，进 health 让客户端判断要不要升级服务端。 */
  schemaVersion: number;
  /** 备份模块名，进 health 让客户端自查清单是否与服务端一致。 */
  modules: readonly string[];
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
  const { config, logger, seq, schemaVersion, modules } = context;

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
      sendJson(res, 200, { ok: true, seq, schemaVersion, modules: [...modules] });
      return;
    }

    if ((PLANNED_PATHS as readonly string[]).includes(pathname)) {
      sendJson(res, 501, { error: 'not_implemented', path: pathname });
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  };
}

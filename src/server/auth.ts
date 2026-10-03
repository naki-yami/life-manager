/**
 * 鉴权：单一预共享令牌（ADR-0002「鉴权与暴露面」）。
 *
 * 不做账号体系、不做注册、不做分享 —— 令牌回答的是「你能不能连」，
 * 与「这条改动是哪台设备写的」（客户端生成的设备标识）是两件事。
 *
 * `/v1/health` 是唯一免令牌的路径：它给探针与设置页「服务在不在」用，
 * 不含任何用户数据。其余路径一律要令牌。
 */
import { timingSafeEqual } from 'node:crypto';

/** 免鉴权路径。只有 health —— 别往里加东西，加之前先问「它泄不泄用户数据」。 */
export const PUBLIC_PATHS = ['/v1/health'] as const;

export interface AuthResult {
  ok: boolean;
  /** 失败原因，只用于日志；响应体里不回显细节（不给爆破者任何信号）。 */
  reason?: 'missing' | 'malformed' | 'mismatch';
}

/**
 * 校验 `Authorization: Bearer <token>`。
 *
 * 用 `timingSafeEqual` 而不是 `===`：后者短路比较，能通过响应时间逐字符猜出令牌。
 * 长度不同时 `timingSafeEqual` 会抛错，所以先比长度 —— 长度本身不是秘密
 * （令牌固定 64 个十六进制字符），这一步不泄露有用信息。
 */
export function checkAuth(
  header: string | string[] | undefined,
  expectedToken: string,
): AuthResult {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || raw.trim() === '') return { ok: false, reason: 'missing' };

  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!match) return { ok: false, reason: 'malformed' };

  const presented = match[1]!.trim();
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expectedToken, 'utf8');
  if (a.length !== b.length) return { ok: false, reason: 'mismatch' };

  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: 'mismatch' };
}

/** 这个路径是否免鉴权（比较时忽略查询串）。 */
export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname);
}

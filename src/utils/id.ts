/**
 * 统一的 ID 生成器。
 * 优先使用 crypto.randomUUID（localhost 属于安全上下文，浏览器均支持），
 * 不可用时退回到时间戳 + 随机串，保证导入/合并场景下不产生碰撞。
 */
export function createId(): string {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

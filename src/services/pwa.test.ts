import { describe, expect, it, vi } from 'vitest';
import { registerOfflineShell, type ServiceWorkerLike } from './pwa';

const makeHost = (overrides: Partial<Parameters<typeof registerOfflineShell>[0]> = {}) => {
  const register = vi.fn(() => Promise.resolve());
  const serviceWorker: ServiceWorkerLike = { register };
  return { register, host: { isProduction: true, serviceWorker, ...overrides } };
};

describe('registerOfflineShell', () => {
  it('生产构建下注册 /sw.js', async () => {
    const { register, host } = makeHost();

    await registerOfflineShell(host);

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('开发构建下不注册（否则 HMR 请求会被 SW 拦下）', async () => {
    const { register, host } = makeHost({ isProduction: false });

    await registerOfflineShell(host);

    expect(register).not.toHaveBeenCalled();
  });

  it('浏览器不支持 Service Worker 时安静跳过', async () => {
    const { register, host } = makeHost({ serviceWorker: undefined });

    await expect(registerOfflineShell(host)).resolves.toBeUndefined();
    expect(register).not.toHaveBeenCalled();
  });

  it('注册失败不向外抛错，也不影响任何功能', async () => {
    const register = vi.fn(() => Promise.reject(new Error('ScopeError')));

    await expect(
      registerOfflineShell({ isProduction: true, serviceWorker: { register } }),
    ).resolves.toBeUndefined();
  });
});

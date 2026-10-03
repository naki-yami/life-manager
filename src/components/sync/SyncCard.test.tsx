import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../ui';
import { useSyncStore } from '../../store/syncStore';
import { SyncCardWithNote, ZERO_REQUEST_NOTE } from './SyncCard';

/*
 * 同步卡的外部行为：开关、地址、令牌、按钮、冲突那行提示。
 * 不测渲染细节以外的东西；引擎行为在 services/sync/** 的测试里。
 */

const emptySync = {
  enabled: false,
  baseUrl: '',
  token: '',
  deviceId: '',
  lastSeq: 0,
  baseline: {},
  revs: {},
  conflicts: [],
  needsReconcile: false,
};

const renderCard = (): ReturnType<typeof render> =>
  render(
    <ToastProvider>
      <SyncCardWithNote />
    </ToastProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  useSyncStore.setState({ ...emptySync });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('开关与零网络请求', () => {
  it('默认关闭，并写明关闭时是纯本地', () => {
    renderCard();

    const toggle = screen.getByRole('switch', { name: /开启跨设备同步/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('纯本地')).toBeInTheDocument();
    expect(screen.getByText(ZERO_REQUEST_NOTE)).toBeInTheDocument();
  });

  it('打开开关会写进 lm:sync', async () => {
    renderCard();

    await userEvent.click(screen.getByRole('switch', { name: /开启跨设备同步/ }));

    expect(useSyncStore.getState().enabled).toBe(true);
    // 设备标识在开启时生成一次
    expect(useSyncStore.getState().deviceId).not.toBe('');
  });

  it('关闭状态下点「立即同步」不发任何请求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: '立即同步' }));

    // 零请求：fetch 一次都没被调用
    expect(fetchSpy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId('sync-last-run')).toHaveTextContent('同步未开启');
    });
  });
});

describe('地址与令牌', () => {
  it('地址能完整打出来（含 `http://` 的双斜杠），失焦后落进 lm:sync', async () => {
    renderCard();

    const input = screen.getByLabelText('服务地址');
    await userEvent.type(input, 'http://127.0.0.1:8787');

    // 编辑期间不回写 store：否则 store 的「去结尾斜杠」会在打到 `http://` 时吃掉那两个斜杠
    expect(input).toHaveValue('http://127.0.0.1:8787');

    await userEvent.tab();

    expect(useSyncStore.getState().baseUrl).toBe('http://127.0.0.1:8787');
  });

  it('失焦时才去掉结尾的斜杠（免得拼出 //v1/health）', async () => {
    renderCard();

    const input = screen.getByLabelText('服务地址');
    await userEvent.type(input, 'http://127.0.0.1:8787/');
    await userEvent.tab();

    expect(useSyncStore.getState().baseUrl).toBe('http://127.0.0.1:8787');
  });

  it('令牌是打码输入，且说明它不进备份', () => {
    renderCard();

    const input = screen.getByLabelText('令牌');
    expect(input).toHaveAttribute('type', 'password');
    expect(screen.getByText(/绝不进备份、绝不导出/)).toBeInTheDocument();
  });

  it('「清除」按钮清掉令牌', async () => {
    useSyncStore.setState({ token: 's3cret-token' });
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: '清除' }));

    expect(useSyncStore.getState().token).toBe('');
  });

  it('没填令牌时「清除」不可点', () => {
    renderCard();

    expect(screen.getByRole('button', { name: '清除' })).toBeDisabled();
  });
});

describe('按钮', () => {
  it('「立即同步」在开着开关时真的发请求', async () => {
    const fetchSpy = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({ ok: true, seq: 0, schemaVersion: 20, modules: [] }),
    }));
    vi.stubGlobal('fetch', fetchSpy);
    useSyncStore.setState({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8787',
      token: 's3cret-token',
      deviceId: 'dev-1',
    });
    renderCard();

    await userEvent.click(screen.getByRole('button', { name: '立即同步' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    // 第一发一定是 health（先探活）
    expect(String(fetchSpy.mock.calls[0]![0])).toContain('/v1/health');
    await waitFor(() => {
      expect(screen.getByTestId('sync-last-run')).toHaveTextContent('同步成功');
    });
  });

  it('「重新对账」按钮存在且可点', () => {
    renderCard();

    expect(screen.getByRole('button', { name: '重新对账' })).toBeEnabled();
  });

  it('需要重新对账时给出一行说明，且不自动推送', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    useSyncStore.setState({ needsReconcile: true, enabled: true });

    renderCard();

    expect(screen.getByText(/需要重新对账/)).toBeInTheDocument();
    // 只是渲染了一行说明，没有任何请求被发出去
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('冲突提示', () => {
  it('有冲突时给一行提示，点开能看到明细', async () => {
    useSyncStore.setState({
      conflicts: [
        {
          module: 'tasks',
          key: 't1',
          title: '写周报',
          serverUpdatedAt: '2026-10-03T09:00:00.000Z',
        },
      ],
    });
    renderCard();

    // 默认不展开：明细还看不到
    expect(screen.queryByText(/写周报/)).not.toBeInTheDocument();

    const line = screen.getByRole('button', { name: /1 条改动与另一台设备冲突/ });
    await userEvent.click(line);

    // 展开后：模块 + 条目标题 + 服务端那份的时间
    expect(screen.getByText(/tasks · 写周报 · 2026-10-03T09:00:00.000Z/)).toBeInTheDocument();
  });

  it('没有冲突时不显示那行提示', () => {
    renderCard();

    expect(screen.queryByText(/与另一台设备冲突/)).not.toBeInTheDocument();
  });
});

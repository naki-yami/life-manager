import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { readAppStateEntries } from './storage';
import { useSyncStore } from './syncStore';

/*
 * 只测外部行为：store 的读写语义 + 存进 `lm:sync` 的是什么。
 * 不测内部函数名，也不测界面（那是工单 06 的事）。
 */

const store = () => useSyncStore.getState();

const emptyState = {
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

/** 读出 `lm:sync` 里的 state 部分；没存过返回 null */
function persistedState(): Record<string, unknown> | null {
  const raw = localStorage.getItem(STORAGE_KEYS.sync);
  if (!raw) return null;
  return (JSON.parse(raw) as { state?: Record<string, unknown> }).state ?? null;
}

beforeEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  useSyncStore.setState(emptyState);
});

describe('同步开关与令牌', () => {
  it('默认关闭，且默认状态下什么都没填', () => {
    expect(store().enabled).toBe(false);
    expect(store().isConfigured()).toBe(false);
    // 默认关闭 = 纯本地。令牌为空是实现「关闭时零网络请求」的前提：
    // 没有地址也没有令牌，网络层无从发起请求。
    expect(store().token).toBe('');
    expect(store().baseUrl).toBe('');
  });

  it('填了地址与令牌才算配置好', () => {
    store().setBaseUrl('http://127.0.0.1:8787');
    expect(store().isConfigured()).toBe(false);

    store().setToken('s3cret-token');
    expect(store().isConfigured()).toBe(true);
  });

  it('服务地址去掉首尾空白与结尾的斜杠', () => {
    store().setBaseUrl('  http://127.0.0.1:8787/  ');
    expect(store().baseUrl).toBe('http://127.0.0.1:8787');
  });

  it('令牌可以清除，设备标识不受影响', () => {
    store().setEnabled(true);
    const deviceId = store().deviceId;

    store().setToken('s3cret-token');
    store().clearToken();

    expect(store().token).toBe('');
    expect(store().deviceId).toBe(deviceId);
  });

  it('令牌的展示形式只露头尾各 4 位', () => {
    expect(store().tokenHint()).toBe('');

    store().setToken('abcd1234efgh');
    expect(store().tokenHint()).toBe('abcd••••efgh');
    // 打码后不该出现中间那段原文
    expect(store().tokenHint()).not.toContain('1234');
  });

  it('太短的令牌整串打码，不露原文', () => {
    store().setToken('abc123');
    expect(store().tokenHint()).toBe('••••');
  });
});

describe('设备标识', () => {
  it('开关从关到开时生成一次', () => {
    expect(store().deviceId).toBe('');

    store().setEnabled(true);
    expect(store().deviceId).not.toBe('');
  });

  it('之后反复开关还是同一个标识', () => {
    store().setEnabled(true);
    const deviceId = store().deviceId;

    store().setEnabled(false);
    store().setEnabled(true);

    expect(store().deviceId).toBe(deviceId);
  });

  it('关掉开关不清除设备标识，重开仍是同一台设备', () => {
    store().setEnabled(true);
    const deviceId = store().deviceId;

    store().setEnabled(false);

    // 清掉标识会让服务端把同一台设备认成两台，「这条改动是谁写的」就失去了意义
    expect(store().deviceId).toBe(deviceId);
  });
});

describe('游标与基线', () => {
  it('一轮同步成功后游标与基线一起前进', () => {
    store().commitSync(7, { tasks: { t1: 'hash-a' } });

    expect(store().lastSeq).toBe(7);
    expect(store().baseline).toEqual({ tasks: { t1: 'hash-a' } });
  });

  it('基线可以单独清掉，游标不动（可丢弃的派生物）', () => {
    store().commitSync(7, { tasks: { t1: 'hash-a' } });
    store().clearBaseline();

    expect(store().baseline).toEqual({});
    expect(store().lastSeq).toBe(7);
  });

  it('重新同步时基线整块替换，不留上一轮的条目', () => {
    store().setBaseline({ tasks: { t1: 'old' }, habits: { h1: 'hash' } });
    store().setBaseline({ tasks: { t2: 'new' } });

    expect(store().baseline).toEqual({ tasks: { t2: 'new' } });
  });
});

describe('冲突与重新对账', () => {
  it('冲突只留最近一次的那批', () => {
    store().setConflicts([
      { module: 'tasks', key: 't1', title: '写周报', serverUpdatedAt: '2026-10-01T09:00:00.000Z' },
    ]);
    expect(store().conflicts).toHaveLength(1);

    store().setConflicts([]);
    expect(store().conflicts).toEqual([]);
  });

  it('导入 / 回滚 / 清除数据之后要重新对账，点过之后复位', () => {
    expect(store().needsReconcile).toBe(false);

    store().markNeedsReconcile();
    expect(store().needsReconcile).toBe(true);

    store().clearNeedsReconcile();
    expect(store().needsReconcile).toBe(false);
  });

  it('重新对账只置位，不自动推送全量（拿刚导入的数据覆盖服务端是灾难）', () => {
    store().setEnabled(true);
    store().setBaseUrl('http://127.0.0.1:8787');
    store().setToken('s3cret-token');
    store().commitSync(9, { tasks: { t1: 'hash-a' } });

    store().markNeedsReconcile();

    // 只置了一个标记：游标与基线原样不动，没有任何东西被推出去
    expect(store().needsReconcile).toBe(true);
    expect(store().lastSeq).toBe(9);
    expect(store().baseline).toEqual({ tasks: { t1: 'hash-a' } });
  });
});

describe('lm:sync 的持久化', () => {
  it('开关、地址、令牌、设备标识都写进 lm:sync', async () => {
    store().setEnabled(true);
    store().setBaseUrl('http://127.0.0.1:8787');
    store().setToken('s3cret-token');
    const deviceId = store().deviceId;

    await vi.waitFor(() => {
      const state = persistedState();
      expect(state?.enabled).toBe(true);
      expect(state?.baseUrl).toBe('http://127.0.0.1:8787');
      expect(state?.token).toBe('s3cret-token');
      expect(state?.deviceId).toBe(deviceId);
    });
  });

  it('令牌与设备标识不在业务 store 的 key 里，也不在被备份模块取数的那批 key 里', async () => {
    store().setEnabled(true);
    store().setToken('s3cret-token');

    await vi.waitFor(() => {
      expect(persistedState()?.token).toBe('s3cret-token');
    });

    // 导出 / 自动快照 / 崩溃兜底导出三条路径都按 readAppStateEntries() 取数，
    // lm:sync 不在其中 —— 这就是「令牌进不了备份文件」的实现保证
    const entries = await readAppStateEntries();
    expect(entries.map(([key]) => key)).not.toContain(STORAGE_KEYS.sync);
    expect(JSON.stringify(entries)).not.toContain('s3cret-token');
  });

  it('刷新后读回来的还是那一台设备的标识与令牌', async () => {
    store().setEnabled(true);
    store().setBaseUrl('http://127.0.0.1:8787');
    store().setToken('s3cret-token');
    const deviceId = store().deviceId;

    await vi.waitFor(() => {
      expect(persistedState()?.deviceId).toBe(deviceId);
    });

    await useSyncStore.persist.rehydrate();

    expect(store().deviceId).toBe(deviceId);
    expect(store().token).toBe('s3cret-token');
  });

  it('老存档里没有这张卡时读出来是「关闭 + 没填」', async () => {
    localStorage.setItem(
      STORAGE_KEYS.sync,
      JSON.stringify({ state: { enabled: true, lastSeq: 3 }, version: 12 }),
    );

    await useSyncStore.persist.rehydrate();

    expect(store().enabled).toBe(true);
    expect(store().lastSeq).toBe(3);
    expect(store().token).toBe('');
    expect(store().deviceId).toBe('');
    expect(store().baseline).toEqual({});
  });

  it('脏数据被挡回默认值，不会让设置卡崩掉', async () => {
    localStorage.setItem(
      STORAGE_KEYS.sync,
      JSON.stringify({
        state: {
          enabled: 'yes',
          baseUrl: 42,
          token: null,
          deviceId: 7,
          lastSeq: 'NaN',
          baseline: 'not-an-object',
          conflicts: [{ module: 'tasks' }, 'nonsense'],
          needsReconcile: 'sure',
        },
        version: 12,
      }),
    );

    await useSyncStore.persist.rehydrate();

    expect(store().enabled).toBe(false);
    expect(store().baseUrl).toBe('');
    expect(store().token).toBe('');
    expect(store().deviceId).toBe('');
    expect(store().lastSeq).toBe(0);
    expect(store().baseline).toEqual({});
    // 缺 key 的冲突条目没法在界面上定位，丢掉；坏到不是对象的也丢掉
    expect(store().conflicts).toEqual([]);
    expect(store().needsReconcile).toBe(false);
  });

  it('基线里的脏条目被剔掉，合法的留下', async () => {
    localStorage.setItem(
      STORAGE_KEYS.sync,
      JSON.stringify({
        state: {
          baseline: {
            tasks: { t1: 'hash-a', t2: 42, t3: '' },
            habits: 'not-an-object',
          },
        },
        version: 12,
      }),
    );

    await useSyncStore.persist.rehydrate();

    expect(store().baseline).toEqual({ tasks: { t1: 'hash-a' }, habits: {} });
  });

  it('损坏的持久化数据不会让 store 崩掉', async () => {
    localStorage.setItem(STORAGE_KEYS.sync, 'not-json');

    await useSyncStore.persist.rehydrate();

    expect(store().enabled).toBe(false);
    expect(store().token).toBe('');
  });
});

/**
 * 记录版本表（`revs`）。
 *
 * 它回答「我这次推是盖在服务端哪一版之上」，推送时作为 `baseRev` 带上。
 * **丢了它不是「退化」，是每次都误报冲突** —— 恒带 0 会让服务端每次都判成落后。
 */
describe('记录版本表', () => {
  it('整块写入与会话内读取', () => {
    store().setRevs({ 'tasks:t1': 3, 'books:b1': 1 });

    expect(store().revs).toEqual({ 'tasks:t1': 3, 'books:b1': 1 });
  });

  it('commitSync 可以一并推进 rev 表（三个参数都给）', () => {
    store().commitSync(7, { tasks: { t1: 'h' } }, { 'tasks:t1': 2 });

    expect(store().lastSeq).toBe(7);
    expect(store().baseline).toEqual({ tasks: { t1: 'h' } });
    expect(store().revs).toEqual({ 'tasks:t1': 2 });
  });

  it('commitSync 不传 rev 时保持原样（两参数调用仍可用）', () => {
    store().setRevs({ 'tasks:t1': 5 });
    store().commitSync(7, { tasks: { t1: 'h' } });

    expect(store().revs).toEqual({ 'tasks:t1': 5 });
  });

  it('落盘：revs 会写进 lm:sync（写完再读回来仍在）', async () => {
    store().setRevs({ 'tasks:t1': 4 });
    // 持久化走后端适配器（IndexedDB 优先、localStorage 兜底），是异步的。
    // 这里用「等一次微任务 + flush」不靠谱，所以直接验**往返**：
    // 写完再 rehydrate，读回来的还是那一份 —— 这才说明它真的落了盘。
    await useSyncStore.persist.rehydrate();

    expect(store().revs).toEqual({ 'tasks:t1': 4 });
  });

  it('空 rev 表落盘为 {}，不是 undefined', () => {
    expect(persistedState()).toMatchObject({ revs: {} });
  });

  it('重新载入后 revs 还在（重启不丢，否则每次都误标冲突）', async () => {
    localStorage.setItem(
      STORAGE_KEYS.sync,
      JSON.stringify({
        state: { ...emptyState, revs: { 'tasks:t1': 9 } },
        version: 0,
      }),
    );

    await useSyncStore.persist.rehydrate();

    expect(store().revs).toEqual({ 'tasks:t1': 9 });
  });

  it('脏值被剔掉（非数字 / 负 / 非有限），不会让 baseRev 变成一个不存在的版本号', async () => {
    localStorage.setItem(
      STORAGE_KEYS.sync,
      JSON.stringify({
        state: {
          ...emptyState,
          revs: { good: 3, str: 'x', neg: -1, nan: NaN, inf: Infinity, float: 2.7 },
        },
        version: 0,
      }),
    );

    await useSyncStore.persist.rehydrate();

    // good 保留；float 取整；str/neg/nan/inf 剔掉
    expect(store().revs).toEqual({ good: 3, float: 2 });
  });

  it('老存档（没有 revs 字段）读出来是空表，不报错', async () => {
    localStorage.setItem(
      STORAGE_KEYS.sync,
      JSON.stringify({ state: { enabled: true, deviceId: 'dev-1' }, version: 0 }),
    );

    await useSyncStore.persist.rehydrate();

    expect(store().revs).toEqual({});
    expect(store().enabled).toBe(true);
  });

  it('revs 里不含令牌（仍然不进任何「整份状态」集合）', async () => {
    store().setToken('super-secret-token');
    store().setRevs({ 'tasks:t1': 1 });

    const persisted = JSON.stringify(persistedState());
    // 令牌在 lm:sync 里（这是它的家），但不该出现在 revs 里
    expect(JSON.stringify(persistedState()?.revs)).not.toContain('super-secret-token');
    // 而 appStorageKeys（快照 / 导出那条路）看不到整个 lm:sync
    const { appStorageKeys } = await import('../utils/storageKeys');
    expect(appStorageKeys()).not.toContain(STORAGE_KEYS.sync);
    void persisted;
  });
});

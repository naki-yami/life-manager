import React, { useState } from 'react';
import { Alert, Badge, Button, Input, Switch } from '../ui';
import { useSyncStore, type SyncConflict } from '../../store/syncStore';
import { formatNumber } from '../../utils/date';

/**
 * 「跨设备同步」卡：开关、服务地址、令牌、状态与两个按钮。
 *
 * ## 这一层刻意薄
 *
 * 所有同步逻辑都在 `services/sync/**`（01–05 已交付），这里只做三件事：
 * 把 `lm:sync` 的字段绑到表单件、把两个按钮接到动态 import 来的引擎、
 * 把冲突渲染成可点开的一行。**不在这里发明任何同步语义。**
 *
 * ## 动态 import 是硬要求
 *
 * 引擎会拉进 HTTP 与哈希代码。设置页本身是懒加载的路由 chunk，但同步卡一被静态 import
 * 就会把它拽进设置页 chunk；用 `await import(...)` 让它在**用户真的点按钮时**才加载。
 * 首屏预算 300 KB —— 见工单 06 的验收。
 *
 * ## 关闭时零网络请求
 *
 * 这条是 ADR-0002 对用户的产品承诺，落点是「关掉开关时**不调用**引擎」：
 * `runSync` 自己也会先看开关并直接返回，但界面这一层不该依赖那个兜底 ——
 * 不发起调用才是真正可验证的「零请求」。
 */

/** 最近一次同步的结果；只在卡片里显示，不落盘（`lm:sync` 没有这个字段，也不该有） */
interface LastRun {
  at: Date;
  ok: boolean;
  reason: string;
  pushed: number;
  pulled: number;
  conflicts: number;
}

/** 把引擎结果转成卡片要显示的一行摘要 */
function summarize(run: LastRun): string {
  if (!run.ok) return run.reason === '' ? '失败' : run.reason;
  const parts = [`推送 ${formatNumber(run.pushed)} 条`, `拉取 ${formatNumber(run.pulled)} 条`];
  if (run.conflicts > 0) parts.push(`冲突 ${formatNumber(run.conflicts)} 条`);
  return parts.join(' · ');
}

/** 冲突明细里那行「模块 + 条目标题 + 服务端那份的时间」 */
function conflictLine(conflict: SyncConflict): string {
  const title = conflict.title === '' ? conflict.key : conflict.title;
  return conflict.serverUpdatedAt === ''
    ? `${conflict.module} · ${title}`
    : `${conflict.module} · ${title} · ${conflict.serverUpdatedAt}`;
}

export const SyncCard: React.FC = () => {
  const enabled = useSyncStore((state) => state.enabled);
  const baseUrl = useSyncStore((state) => state.baseUrl);
  const token = useSyncStore((state) => state.token);
  const conflicts = useSyncStore((state) => state.conflicts);
  const needsReconcile = useSyncStore((state) => state.needsReconcile);

  const setEnabled = useSyncStore((state) => state.setEnabled);
  const setBaseUrl = useSyncStore((state) => state.setBaseUrl);
  const setToken = useSyncStore((state) => state.setToken);
  const clearToken = useSyncStore((state) => state.clearToken);

  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  /** 冲突那行是否展开（点开看明细）—— 不弹模态、不阻塞 */
  const [showConflicts, setShowConflicts] = useState(false);
  /*
   * 地址输入框的**编辑中**草稿。
   *
   * 为什么不能直接把输入绑到 store：`setBaseUrl` 会去掉结尾的 `/`（避免拼出
   * `//v1/health`），而它在**每次按键**时都跑一遍 —— 用户打到 `http://` 时那两个斜杠
   * 正好在结尾，会被吃掉，于是永远打不出一个合法地址（`http:` + `127.0.0.1:8787`）。
   *
   * 所以输入期间留草稿，**失焦时**才规范化落库。字段为空表示「没在编辑」，跟 store 走。
   */
  const [baseUrlDraft, setBaseUrlDraft] = useState<string | null>(null);
  const baseUrlValue = baseUrlDraft ?? baseUrl;

  /*
   * 两个按钮共用的一条路径。
   *
   * `run` 由调用方给：**动态 import** 引擎，于是同步代码只在真的点按钮时才下载。
   * 开关关着时直接返回 —— 零请求。
   */
  const withEngine = async (
    run: (engine: typeof import('../../services/sync/engine')) => Promise<{
      ok: boolean;
      reason: string;
      pushed: number;
      pulled: number;
      conflicts: number;
    }>,
  ): Promise<void> => {
    if (!useSyncStore.getState().enabled) {
      // 关闭 = 纯本地。**一个请求都不发**，连引擎都不加载
      setLastRun({
        at: new Date(),
        ok: false,
        reason: '同步未开启（当前为纯本地，不发任何请求）',
        pushed: 0,
        pulled: 0,
        conflicts: 0,
      });
      return;
    }

    setBusy(true);
    try {
      const engine = await import('../../services/sync/engine');
      const outcome = await run(engine);
      setLastRun({ at: new Date(), ...outcome });
    } catch (error) {
      // 动态 import 本身失败（离线、chunk 拉不下来）也要有结果，不能卡在「同步中」
      setLastRun({
        at: new Date(),
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        pushed: 0,
        pulled: 0,
        conflicts: 0,
      });
    } finally {
      setBusy(false);
    }
  };

  /** 「立即同步」。显式传 `engine.defaultHttp`（全局 fetch），与本文件的 reconsile 一致 */
  const syncNow = (): Promise<void> => withEngine((engine) => engine.runSync(engine.defaultHttp));

  /**
   * 「重新对账」：对齐语义（先看服务端有什么，再推本机独有的）。
   *
   * 显式传 `engine.defaultHttp`（全局 fetch），不用别的入口 —— 这一层不该自己造 HTTP 层。
   */
  const reconcileNow = (): Promise<void> =>
    withEngine((engine) =>
      import('../../services/sync/firstEnable').then((m) => m.reconcile(engine.defaultHttp)),
    );

  return (
    <section aria-labelledby="sync-card-title" className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <Switch
          checked={enabled}
          onChange={setEnabled}
          label="开启跨设备同步"
          description="默认关闭。关闭时应用保持纯本地，不发任何网络请求"
        />
        {enabled ? <Badge tone="success">已开启</Badge> : <Badge tone="default">纯本地</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="服务地址"
          value={baseUrlValue}
          placeholder="http://127.0.0.1:8787"
          hint="本机同步服务的地址"
          onChange={(event) => setBaseUrlDraft(event.target.value)}
          // 失焦时才把规范化交给 store：输入期间留着草稿，否则 `http://` 的斜杠会被吃掉
          onBlur={() => {
            if (baseUrlDraft === null) return;
            setBaseUrl(baseUrlDraft);
            setBaseUrlDraft(null);
          }}
        />
        {/* 令牌：打码显示，旁边给一个清除按钮 */}
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              label="令牌"
              type="password"
              value={token}
              placeholder="在服务端首次启动时生成"
              hint="只存在本机，绝不进备份、绝不导出"
              onChange={(event) => setToken(event.target.value)}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={token === ''}
            onClick={clearToken}
            className="mb-6"
          >
            清除
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void syncNow()}>
          {busy ? '同步中…' : '立即同步'}
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void reconcileNow()}>
          重新对账
        </Button>
        {needsReconcile && (
          <span className="text-xs text-warning">
            导入 / 回滚 / 清除数据之后需要重新对账（不会自动推送）
          </span>
        )}
      </div>

      <p className="text-xs text-content-tertiary" data-testid="sync-last-run">
        {lastRun === null
          ? '还没有同步过'
          : `${lastRun.ok ? '同步成功' : '同步失败'}：${summarize(lastRun)}（${lastRun.at.toLocaleTimeString()}）`}
      </p>

      {/* 冲突：一行提示，可点开明细。不弹模态、不阻塞 */}
      {conflicts.length > 0 && (
        <button
          type="button"
          onClick={() => setShowConflicts((open) => !open)}
          aria-expanded={showConflicts}
          className="w-full text-left text-xs text-warning underline-offset-2 hover:underline"
        >
          {formatNumber(conflicts.length)}{' '}
          条改动与另一台设备冲突，服务端保留了更新的那一份（点开明细）
        </button>
      )}
      {showConflicts && conflicts.length > 0 && (
        <ul className="space-y-1 text-xs text-content-tertiary">
          {conflicts.map((conflict) => (
            <li key={`${conflict.module}:${conflict.key}`}>{conflictLine(conflict)}</li>
          ))}
        </ul>
      )}
    </section>
  );
};

/** 开关关着时那句说明 —— 单独导出，测试与页面都用它，避免两处文案漂移 */
export const ZERO_REQUEST_NOTE = '关闭时应用仍是零网络请求：同步代码不会被调用，也不会加载。';

export const SyncCardWithNote: React.FC = () => (
  <div className="space-y-4">
    <SyncCard />
    <Alert tone="info">{ZERO_REQUEST_NOTE}</Alert>
  </div>
);

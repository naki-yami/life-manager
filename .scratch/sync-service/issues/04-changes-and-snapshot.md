# 04 拉取：增量 `/v1/changes` 与 `/v1/snapshot`

Status: resolved
实现：`853ea26`（2026-10-03。`src/server/changes.ts` + `changes.test.ts`（16 条）+
HTTP 层的端点组（7 条）+ `push.ts` 里的 `recordChange` 与 `sync.changes` 变更日志）。
核心用例：分页「不漏不重」（limit=2 反复翻页比对全序列）、快照的 data 段通过客户端
`backupDataSchema`（换机首同步的唯一路径必须能直接落库）、watermark 分支返回
`needFullResync` 而不是空数组。
Type: task
Part of: `.scratch/sync-service/spec.md`
Blocked by: 03

## 目标

把「拉到哪了」变成可续传的游标：`GET /v1/changes?since=&limit=` 按 seq 返回增量并带 `more`，
`GET /v1/snapshot` 返回整份副本供换机与全量对账。

## 改动点

- 每个被接受的变更（含后续的墓碑）记一条：`{ seq, module, key, rev, op, record? }`。
  **存哪已定**（spec「数据模型」的「变更日志」一条）：放 `sync` 段里的 `changes` 数组，
  按 `seq` 升序，不另开文件 —— 一次原子写覆盖全部状态，不必管两个文件的崩溃一致性。
  `/v1/changes` 就是读它。
- `/v1/changes`：返回 `seq` 严格大于 `since` 的变更，按 seq 升序；`limit` 缺省给一个合理值
  （如 500）；结果带 `more: true` 表示还有下一页；`since` 缺省视为 0。
- `/v1/snapshot`：返回整份副本（信封 + `sync` 段）。
- 两个接口都走令牌鉴权。

## 验收

- 连推若干条后，从 `since = 0` 分页拉到 `more = false`，不漏不重
  （id 集合与顺序都等于服务端的 seq 顺序）。
- `since` 恰好等于当前 seq → 空结果、`more = false`。
- 快照与副本文件逐字段一致。
- **快照的 `data` 段能通过客户端的 `backupDataSchema`**（与 `schemas-parity.test.ts` 同一判据）：
  `/v1/snapshot` 是客户端「换机首同步」的唯一路径，它必须是一份**能被直接落库的合法备份**。
  两个 keyed 模块（`dietWater` 映射、`dietGoals` 单值）是最容易写成数组的地方 —— 写成数组
  客户端会当「模块不在文件里」，新设备上的饮水与目标**静默变空**。

## 测试

对应 spec 的 Testing Decisions 第 3 条。

## 不做

墓碑的生成与清理（工单 05，本工单只保证它能被传出去）。

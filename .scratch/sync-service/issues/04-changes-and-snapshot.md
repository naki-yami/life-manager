# 04 拉取：增量 `/v1/changes` 与 `/v1/snapshot`

Status: needs-triage
Type: task
Part of: `.scratch/sync-service/spec.md`
Blocked by: 03

## 目标

把「拉到哪了」变成可续传的游标：`GET /v1/changes?since=&limit=` 按 seq 返回增量并带 `more`，
`GET /v1/snapshot` 返回整份副本供换机与全量对账。

## 改动点

- 每个被接受的变更（含后续的墓碑）记一条：`{ seq, module, key, rev, op, record? }`。
- `/v1/changes`：返回 `seq` 严格大于 `since` 的变更，按 seq 升序；`limit` 缺省给一个合理值
  （如 500）；结果带 `more: true` 表示还有下一页；`since` 缺省视为 0。
- `/v1/snapshot`：返回整份副本（信封 + `sync` 段）。
- 两个接口都走令牌鉴权。

## 验收

- 连推若干条后，从 `since = 0` 分页拉到 `more = false`，不漏不重
  （id 集合与顺序都等于服务端的 seq 顺序）。
- `since` 恰好等于当前 seq → 空结果、`more = false`。
- 快照与副本文件逐字段一致。

## 测试

对应 spec 的 Testing Decisions 第 3 条。

## 不做

墓碑的生成与清理（工单 05，本工单只保证它能被传出去）。

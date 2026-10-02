# 04 同步引擎：先推后拉

Status: ready-for-agent
Type: task
Part of: `.scratch/sync-client/spec.md`
Blocked by: 01, 03

## 目标

把一轮同步编排起来，顺序固定「先推后拉」，并且任何一步失败都不推进游标。

## 改动点

- `src/services/sync/engine.ts`：`runSync()` 按 spec 的五步走 ——
  1. `GET /v1/health`（连不上就到此为止，离线是正常状态，不是错误）；
  2. 算 diff → `POST /v1/push`（每条带 `baseRev` 与 `deviceId`）；
  3. 记下 `status: 'conflict'` 的条目（进 `lm:sync.conflicts`，只留最近一次）；
  4. `GET /v1/changes?since=<lastSeq>` 分页拉完 → 逐条落库（`put` / `delete`）；
  5. **全部成功之后**才更新 `lastSeq` 与基线表。
- 失败语义：不改 `lastSeq`、不动基线（已落库的保持已落库）—— 幂等，下一轮重来即可。
- 网络层可注入（测试在 `fetch` 层打桩），HTTP 与哈希代码用动态 import，不进首屏包。

## 验收

- 一轮成功后：`lastSeq` 前进、基线更新、store 与 `lm:sync` 都对。
- 第 4 步中途抛错 → `lastSeq` 没前进、基线没更新；立刻重跑不产生重复条目。
- `fetch` 直接 reject → 应用照常用、状态显示失败、store 一字未改、`lastSeq` 不动。
- 服务端返回 `conflict` → `lm:sync.conflicts` 里有一条。

## 测试

对应 client spec 的 Testing Decisions 第 3、6、7 条。

## 不做

首次开启的对账 UI（工单 05）、设置卡（工单 06）。

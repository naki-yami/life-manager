# 03 push：rev、幂等与 LWW 冲突

Status: needs-triage
Type: task
Part of: `.scratch/sync-service/spec.md`
Blocked by: 02

## 目标

`POST /v1/push` 成为唯一的写入口：服务端给每条记录赋 rev、给每次接受的写入加 seq，
同内容重推返回 `noop`，`baseRev` 落后仍接受但标 `conflict` 并留下被覆盖的历史。

## 改动点

- 请求体 `{ deviceId, baseSeq, changes: [{ module, key, baseRev, op, record? }] }`。
- 逐条返回 `applied` / `noop` / `conflict`，并回新的 `rev` 与全局 `seq`。
- **rev 只在服务端赋值**；客户端时钟永远不参与比较。
- 幂等：`op: 'put'` 且内容与现存记录完全一致 → `noop`，**不产生新 rev、不写历史、seq 不变**。
- 冲突：`baseRev < 服务端当前 rev` → 仍然接受（后到者赢，拿到更大的新 rev），结果标 `conflict`，
  被覆盖的那一份进 `history.jsonl`（落盘在工单 06，这里先留接口与内存队列）。
- 每个 `deviceId` 更新 `devices` 表：`lastSeenAt`、`lastSeq`。
- 结构守卫沿用工单 02；守卫不过的条目整条拒绝，不影响同批其它条目。

## 验收

- 同 `baseRev` + 同内容连推两次 → 第二次 `noop`，`seq` 不变、历史不增。
- 两台设备先后推同一条 → 后到的 rev 更大、内容为后到者；先到的那份进了历史。
- 一批里混一条坏记录 → 坏的那条被拒，其余照常。

## 测试

对应 spec 的 Testing Decisions 第 1、2 条。

## 不做

墓碑与休眠设备（工单 05）；历史 / 备份的保留策略与 restore（工单 06）。

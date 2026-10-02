# 06 自带备份、历史与 `/v1/restore`

Status: ready-for-agent
Type: task
Part of: `.scratch/sync-service/spec.md`
Blocked by: 05

## 目标

ADR 要求「不能只依赖客户端的自动快照」：服务端自己留每日备份与覆盖历史，并有一条人工取回路径。

## 改动点

- `backups/`：每日一份副本快照，保留 10 份（与客户端 `MAX_AUTO_BACKUPS` 同量级）。
- `history.jsonl`：被 LWW 覆盖或被删除的旧版本，保留 30 天。
- `POST /v1/restore`：body `{ confirm: 'restore', source: 'backup' | 'history', ref }`
  （`ref` = 备份文件名或历史条目 id；`confirm` 必须逐字等于 `'restore'`，否则 400）。
  落回前把当前副本先写进 `backups/`。
- **恢复不倒退 `seq`、不改已有 rev**（定案 2026-10-02）：把那一版数据当作**一次新的写入集**
  写回 —— 每条记录拿新 rev、分配新 seq。这样所有在线设备的增量拉取自然收敛到恢复后的状态，
  不需要「游标失效」的额外约定，`purgedThroughSeq` 也不受影响。恢复自身照样进 `history`。
- 清理策略启动时跑一次，之后每天一次。

## 验收

- 用 `history` 里的旧版本 restore → 数据等于那一版，且此前那份副本出现在 `backups/` 里；
  恢复后 `seq` **大于**恢复前（不倒退），接着来拉增量的设备能拿到恢复后的那批变更。
- 第 11 天的每日快照会把最旧的一份清掉，始终 ≤ 10 份。
- 缺确认参数 → 拒绝，副本不变。

## 测试

对应 spec 的 Testing Decisions 第 10 条。

## 不做

客户端侧的自动快照（已有）；把备份做成可下载的界面。

# 07 mirrorDir、可观测与运维

Status: needs-triage
Type: task
Part of: `.scratch/sync-service/spec.md`
Blocked by: 06

## 目标

补上 ADR-0002 里那条「第二份存储」的代价与最基本的可观测性。

## 改动点

- `mirrorDir`：每隔 5 分钟与每次写入后（去抖 30 秒）把副本写到该目录下的
  `life-manager-server-replica.json`；文件名与客户端 `folderSync` 的
  `life-manager-auto-backup.json` 分开，同目录互不覆盖。
- 启动校验：`mirrorDir` 与数据目录**不在同一卷**，否则明确告警（同卷等于第二份与第一份同生共死，
  这条代价就白付了）。卷判断做成可注入的函数，测试用假的。
- 写失败不改变同步行为：只记日志，并计入 `/v1/health`（这是 ADR 记下的回滚信号之一）。
- 可观测：每次同步记一行（设备、推 / 拉条数、冲突数、耗时）；错误单独记，不吞。

## 验收

- 注入「同卷」判断 → 启动日志出现告警；注入「异卷」→ 无告警。
- 写入后 30 秒内（去抖）镜子文件出现；写失败时 `/v1/health` 能看出来，且 push 仍成功。
- 日志按行、每行一条同步记录。

## 测试

对应 spec 的 Testing Decisions 第 9 条。

## 不做

把镜子目录当同步源（它只是第二份存储）；镜像文件的自动清理。

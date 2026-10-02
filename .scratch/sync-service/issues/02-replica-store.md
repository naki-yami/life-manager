# 02 副本存储：形状、结构守卫与原子写

Status: needs-triage
Type: task
Part of: `.scratch/sync-service/spec.md`
Blocked by: 01

## 目标

副本文件 `replica.json` 落成「备份信封 + `sync` 段」，能原子写入、能从半写文件恢复、
能按 `schemaVersion` 拒绝更新的客户端。完成之后服务端有持久状态，但还没有任何接口去改它。

## 改动点

- `src/server/replica.ts`：内存模型 + 载入 / 落盘。
  - 信封沿用备份：`{ schemaVersion, exportedAt, data, ... }`，`data` 用备份的模块名
    （`tasks` / `books` / … / `dietGoals` / `dietWater`）。**前置**：模块表要与
    `.scratch/backup-diet-targets` 落地后的 `BACKUP_MODULES` 对齐（schema 20）。
  - 另加 `sync` 段：`{ seq, rev, tombstones, devices }`。
  - 多出来的 `sync` 键会被客户端导入路径忽略，所以副本文件同时是一份合法备份。
- 结构守卫（**不校验业务字段**）：模块名在册、`id` 是非空字符串、记录是对象；其余字段原样存。
- 原子写：临时文件 + `fsync` + `rename`。
- 载入时发现半写文件 → 用 `backups/` 里最近一份好备份顶上并告警。
- 版本兼容：客户端声明 `schemaVersion` 高于服务端支持值 → 拒绝写入并返回明确错误，
  副本**逐字节不变**；`STORE_VERSION` 不出现在副本里。

## 验收

- 空目录启动 → 生成一份 `seq = 0` 的合法副本。
- 注入一个在 `rename` 前抛错的 fs 适配器 → 副本仍是上一个好版本。
- 半写文件 + 一份好备份 → 启动后副本等于那份备份，日志有告警。
- 高于支持值的 `schemaVersion` 写入被拒，副本逐字节不变。

## 测试

对应 spec 的 Testing Decisions 第 7、8 条。

## 不做

push / changes / snapshot / restore；mirrorDir（工单 07）。

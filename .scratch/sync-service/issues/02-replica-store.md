# 02 副本存储：形状、结构守卫与原子写

Status: resolved
实现：`a11b66a`（2026-10-03。`src/server/replica.ts` + `replica.test.ts`（33 条）+
`test-memory-fs.ts`；验收用例：空目录生成 seq=0、`data` 键集合 == `BACKUP_MODULES`（23 条，
逐元素 + 顺序 + 数量）且不含 `settings`、`settings` 进守卫被拒、注入 rename 前抛错的 fs
→ 副本仍是上一版（内存替身 + 真 fs 各一条）、半写文件 + 好备份 → 顶替且告警（并写回磁盘）、
高 `schemaVersion` 被拒且**逐字节不变**（含不留 .tmp）。
另：`isDirty` 的脏判定有独立用例 —— 它是工单 07 去抖镜像的前提。
Type: task
Part of: `.scratch/sync-service/spec.md`
Blocked by: 01

## 目标

副本文件 `replica.json` 落成「备份信封 + `sync` 段」，能原子写入、能从半写文件恢复、
能按 `schemaVersion` 拒绝更新的客户端。完成之后服务端有持久状态，但还没有任何接口去改它。

## 改动点

- `src/server/replica.ts`：内存模型 + 载入 / 落盘。
  - 信封沿用备份：`{ schemaVersion, exportedAt, data, ... }`，`data` 用备份的模块名
    （`tasks` / `books` / … / `dietGoals` / `dietWater`）。**前置已落地**（`4aa45da`）：
    `BACKUP_MODULES` 现为 23 条，schema 20 —— `data` 段与它**严格一一对应**，一个不多一个不少。
  - **`settings` 不在册**（定案 2026-10-02）：它是每台设备各自的 UI 状态，共享副本装谁的都是
    随机的，所以既不进副本、也不当同步单元。结构守卫里它不在册 → 收到就按「模块名不在册」拒绝。
  - 另加 `sync` 段：`{ seq, purgedThroughSeq, rev, tombstones, devices }`
    （`purgedThroughSeq` 由工单 05 维护，形状在这里一次定好）。
  - 多出来的 `sync` 键会被客户端导入路径忽略，所以副本文件**可以当备份导入**；
    `settings` 不在其中，导入时按「缺失即保持本机」处理（见 spec 的定案一节）。
- 结构守卫（**不校验业务字段**）：模块名在册、`id` 是非空字符串、记录是对象；其余字段原样存。
- 原子写：临时文件 + `fsync` + `rename`。
- 载入时发现半写文件 → 用 `backups/` 里最近一份好备份顶上并告警。
- 版本兼容：客户端声明 `schemaVersion` 高于服务端支持值 → 拒绝写入并返回明确错误，
  副本**逐字节不变**；`STORE_VERSION` 不出现在副本里。

## 验收

- 空目录启动 → 生成一份 `seq = 0` 的合法副本。
- 副本 `data` 段的键集合逐字等于 `BACKUP_MODULES`（23 条），不含 `settings`；
  拿一条 `module: 'settings'` 去推 → 按「模块名不在册」拒绝，副本不变。
- 注入一个在 `rename` 前抛错的 fs 适配器 → 副本仍是上一个好版本。
- 半写文件 + 一份好备份 → 启动后副本等于那份备份，日志有告警。
- 高于支持值的 `schemaVersion` 写入被拒，副本逐字节不变。

## 测试

对应 spec 的 Testing Decisions 第 7、8 条。

## 不做

push / changes / snapshot / restore；mirrorDir（工单 07）。

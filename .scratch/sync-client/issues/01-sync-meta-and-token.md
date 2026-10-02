# 01 `lm:sync` 元数据、令牌与设备标识

Status: ready-for-agent
Type: task
Part of: `.scratch/sync-client/spec.md`
Blocked by: 无

## 目标

新增一个与业务 store 平行的 `lm:sync` 持久化单元，存同步的元数据，并保证它**绝不进备份、绝不进导出**。

## 改动点

- `src/services/sync/meta.ts`（或同等位置）：持久化
  `{ enabled, baseUrl, token, deviceId, lastSeq, baseline, conflicts, needsReconcile }`。
- 设备标识首次开启时用 `utils/id.ts` 的 `createId` 生成一次，之后固定。
- **不进 `readAllData()`**：`lm:sync` 不是备份模块，导出、自动快照、崩溃兜底导出三条路径都看不到它。
- 开关默认关闭；默认状态下应用不发任何请求。

## 验收

- `serializeBackup(readAllData())` 的结果里搜不到令牌字符串，也搜不到 `lm:sync` 的键。
- 关闭开关即零网络请求。
- 令牌存储只被设置页读写，业务 store 不接触它。

## 测试

对应 client spec 的 Testing Decisions 第 4 条。

## 不做

同步引擎与界面（工单 04 / 06）。

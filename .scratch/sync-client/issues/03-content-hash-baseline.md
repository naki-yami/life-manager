# 03 内容哈希基线与 diff

Status: resolved
实现：`e745ae9`、`5b77cd3`（2026-10-03。验收用例：`src/services/sync/baseline.test.ts`
的「两种键序同哈希」「四种判定」「空基线零 delete」「rev 表填 baseRev」，
`src/services/sync/integration.test.ts` 对着真服务端验证载荷不被拒、rev 往返后不误标冲突）
Type: task
Part of: `.scratch/sync-client/spec.md`
Blocked by: 02

## 目标

在没有 `updatedAt` 可用的前提下回答「哪些条目改过」：用内容哈希基线比出
新增 / 改过 / 删了 / 没动。

## 改动点

- 规范化：递归按键名排序后再 `JSON.stringify`（`JSON.stringify` 的键序取决于对象构造顺序，
  直接哈希会让同一条记录算出两个值）。
- 哈希 = `crypto.subtle.digest('SHA-256', 规范化 JSON)` 取前 16 个十六进制字符。
- 基线表 = 「模块 → 条目 id → 内容哈希」，写进 `lm:sync.baseline`。
- 判定与动作：

  | 基线 | 当前         | 判定 | 动作        |
  | ---- | ------------ | ---- | ----------- |
  | 无   | 有           | 新增 | 推 `put`    |
  | 有   | 有且哈希不同 | 改过 | 推 `put`    |
  | 有   | 无           | 删了 | 推 `delete` |
  | 有   | 有且哈希相同 | 没动 | 什么都不做  |

- **基线是可丢弃的派生物**：删掉 `lm:sync` 只让下次同步退化成全量比对，且因为「基线里没有的 id
  不产生 `delete`」，不会误删任何东西。

## 验收

- 新增一条、改一条、删一条 → 推送载荷的 `module` / `key` / `op` / `baseRev` 正确，
  没动的一个都不推。
- 同一条记录用两种键序构造 → 同一个哈希。
- 删掉 `lm:sync` 后重跑 → 全量比对，且**不产生任何 `delete`**。

## 测试

对应 client spec 的 Testing Decisions 第 1、9、10 条。

## 不做

与服务端通信（工单 04）。

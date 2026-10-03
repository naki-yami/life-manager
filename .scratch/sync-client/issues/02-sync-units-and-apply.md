# 02 同步单元表与落库

Status: resolved
实现：`ad0aac3`（2026-10-03。验收用例：`src/services/sync/apply.test.ts` 的
「只变那一条」与「逐字段等于服务端那一份」，`src/services/sync/units.test.ts` 的
「覆盖服务端每一个模块」「不同步项一个都不在表里」，
`src/services/sync/integration.test.ts` 对着真服务端验证三种单元都不被结构守卫拒）
Type: task
Part of: `.scratch/sync-client/spec.md`
Blocked by: 无

## 目标

把服务端那份「同步单位表」落到客户端，并给出把远端整条记录写回 store 的唯一入口。

## 改动点

- `src/services/sync/units.ts`：每个单元记三件事 —— 怎么读（从哪个 store 取）、怎么按 key 写
  （upsert / delete）、模块名（用备份的模块名）。表来自 `.scratch/sync-service/spec.md` 的
  「同步单位」一张表，**两份要一致**；key 的取法也与那份一致：记录集合用记录 `id`，
  `dietWater` 用日期串，`dietGoals` 用模块名（整块替换、不产生 `delete`）。
- 表里的「不同步项」（`lm:theme` / `lm:ui`、`focus.active`、`recent*Names`）在本文件以注释列出来，
  写明为什么不同步 —— 免得后来者以为漏了。
- `src/services/sync/apply.ts`：`setState` + 按 key 的 upsert / delete 纯函数。**不碰 16 个 store
  的内部**，不调用各模块的 `updateRecord`（那会把派生字段按本机逻辑重算，两端可能算出不同结果）。
- 落库走 `useXStore.setState`，zustand 的 persist 中间件照常写进 IndexedDB。

## 验收

- 拉到 `put` 与 `delete` → store 里确实变了，且**只变那一条**（另一条逐字段不变）。
- 落库后该条记录**逐字段等于服务端那一份**（含合计数等派生字段）。
- 单元表覆盖服务端 spec 表里的每一个单元；「不同步项」一个都不在表里。

## 测试

对应 client spec 的 Testing Decisions 第 2 条。

## 不做

diff、推拉编排、界面。

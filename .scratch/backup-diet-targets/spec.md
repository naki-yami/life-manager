# 备份补齐：饮食的每日目标与饮水打卡

Status: resolved
实现：`4aa45da`（2026-10-02，`BACKUP_SCHEMA_VERSION` 19 → 20；`dietGoals` / `dietWater` 进
`BackupData`、导入计划、单模块导出与崩溃兜底导出）。
Type: spec
来源：`/to-spec`（2026-10-02），从 `.scratch/sync-service/spec.md` 的「前置依赖」拆出来的阻塞项。
关联：`CONTEXT.md` 的备份 / 数据模块 / 自动快照三个词条。

## Problem Statement

`lm:diet` 里持久化了四样东西：`records`、`templates`、`goals`（每日热量与蛋白质目标）、
`water`（日期 → 杯数）。前两样进了 `BackupData`，后两样没有 —— `readAllData()` 不读它们，
导入路径也不回写；`water` 全仓只出现在 `dietStore.ts` 与 `DietPage.tsx` 两处，
从来没有任何一条导出/导入路径碰过它。

后果：用户设了每日热量目标、记了一个月的饮水，导出 JSON 再导入（换设备、清缓存后恢复），
这两样**静默消失**，没有任何提示。这与「不丢数据」这条硬约束直接冲突 —— 它跟同步无关，
同步只是让这个缺口更容易被撞上（副本与备份模块对不上）。

## Solution

把 `goals` 与 `water` 提升为 `BackupData` 的两个模块，`BACKUP_SCHEMA_VERSION` 19 → 20。
旧备份里没有它们 → 按「缺失」处理，不清空用户现有的值（与 v12 加习惯、v13 加身体指标同一套办法）。

**这两个模块不是记录数组** —— 这是与现有 21 个模块唯一不同的地方，所以导入的三种模式要各自定死：

| 模式        | `dietGoals`（模块单值）              | `dietWater`（日期 → 杯数，逐键）       |
| ----------- | ------------------------------------ | -------------------------------------- |
| `merge`     | 本机是默认值（从没设过）才采用备份的 | 本机没有的日期键补上，已有的键保持本机 |
| `overwrite` | 用备份的；模块缺失则保持本机现状     | 整块换成备份的                         |
| `append`    | 与 `merge` 相同                      | 与 `merge` 相同                        |

理由：`merge` 的既有语义就是「从不覆盖本机已有的东西」（`mergeById` 纯按 id 存在性跳过），
对单值与映射沿用同一条原则最不容易出意外；`append` 的「冲突就重新分配 id」对没有 id 的东西没有
意义，所以等同 `merge`，并在导入预览里如实写成「补充 N 天」而不是「新增 N 条」。

另外，备份文件里**整个模块缺失**时一律保持本机现状（`planImport` 里 `merge()` 那条既有规则：
缺失 ≠ 清空），`overwrite` 也不例外 —— 拿一份旧文件导入，不该因为模式选「覆盖」就把
本机已经设好的目标、已经记下的饮水抹掉。

## 落地清单（实现时对着改）

- `src/services/schemas.ts`：加 `dietGoalsSchema`（复用 `dietStore` 的 `DietGoals` 形状：
  热量与蛋白质，0 表示未设置）与 `dietWaterSchema`（`Record<日期, 杯数>`，复用 `pickNumberMap`
  那套清洗，0–99 截断）；两个都进 `backupDataSchema` 与 `BACKUP_MODULES`；`MODULE_LABELS` 补中文名；
  版本注释块加一行 `20：`。
- `src/services/appData.ts` 的 `readAllData()`：补上这两个字段（**这是本次修的核心**）。
- `src/services/backup.ts`：`planImport` 里这两个模块不走 `mergeById`，按上表的模式单独处理；
  `ImportPlanStats` 是 `Record<BackupModule, ModulePlan>`，加模块后编译器会指出所有要补的地方。
- `src/services/moduleExport.ts`：`MODULE_EXPORTS` 是 `{ [K in BackupModule]: … }` 的映射，
  加模块会直接报错 —— 饮水按「每个日期一行」、目标按「一行（或两行）」导出，
  `moduleRecords()` 的「模块 → 行数组」这条契约保持不破。
- `src/components/ErrorBoundary.tsx` 的兜底导出：也要带上这两样，否则崩溃时导出的救援文件缺一块。
- 导入预览文案：这两个模块的统计口径是「天」与「项」，不是「条」。

## User Stories

1. 作为一个记饮水的用户，我想导出的备份里带着我的饮水记录，这样换设备后不用重新记。
2. 作为一个设了每日热量目标的用户，我想这个目标跟着备份走，这样重装后不用再设一遍。
3. 作为一个拿旧备份导入的用户，我想旧文件（没有这两样）不会把我现在的目标与饮水清空。
4. 作为一个合并两台设备数据的用户，我想饮水按天合并而不是整块覆盖，这样两边的记录都留得住。
5. 作为一个用单模块导出的用户，我想饮水能导出成看得懂的表格（一天一行）。

## Testing Decisions

**什么算好测试。** 只断言可观察的结果：`readAllData()` 里有什么、导入之后 store 里是什么。不测内部函数名，
不为「有没有调用某个 helper」写断言。

1. **往返**：设目标 + 记 3 天饮水 → `readAllData()` → `serializeBackup` → `parseBackup` →
   导入 `overwrite` → 值逐字段相等。
2. **旧文件不清空**：拿一份没有这两个模块的 v19 备份导入 `merge` → 本机现有的目标与饮水**原样保留**，不报错。
3. **逐键合并**：本机 2 天、备份另外 3 天 → 合并后 5 天；重合的键保持本机值。
4. **`append` 等同 `merge`**：同上，不产生重复或覆盖。
5. **版本兼容**：v19 的文件仍能读（`parseBackup` 不因版本低而拒绝），导出的新文件 `schemaVersion` 是 20。
6. **单模块导出**：饮水模块导出的 CSV 一天一行、有内容；目标模块不报错。
7. **兜底导出**：ErrorBoundary 那条路径产出的备份里也含这两样。
8. **自动快照**：每日自动快照与手动快照同样带上它们（快照走同一份 `readAllData()`）。

**怎么跑。** `npm run test` 全绿（当前基线 1579 条 / 93 文件），新增用例不能靠放宽既有断言通过；
交付前另跑 `npm run typecheck && npm run lint && npm run format:check`。

## Out of Scope

- **同步**：服务端与客户端接入另见 `.scratch/sync-service/spec.md` 与 `.scratch/sync-client/spec.md`。
  本次只把备份补齐，改完副本与备份模块就对得上了。
- **新增「每天喝几杯」的目标字段**：`DietGoals` 现在只有热量与蛋白质，饮水只有一个流水（喝了多少）。
  要不要给饮水加目标，是另一条需求。
- **把 `recentFoodNames` / `recentExerciseNames` 补进备份**：它们是使用过程里重新长出来的，
  丢了会在下一次使用时重建，不属于「不丢数据」要守的东西。

## Further Notes

**为什么现在才发现。** 每个模块加字段时的检查项是「有没有进 `BackupData`」，但 `water` 与 `goals`
不是「记录上的字段」，而是 `lm:diet` 这个 store 分片里的**另一块状态**；它们从来不在任何一条
「加字段」的改动里，也就没人问过它们进没进备份。这条经验值得记：**新增 store 分片里的非记录状态时，
同样要过一遍备份清单**。

**词表。** 「数据模块」指的是备份里的一个集合（`BACKUP_MODULES` 的一条），与「导航模块」无关。

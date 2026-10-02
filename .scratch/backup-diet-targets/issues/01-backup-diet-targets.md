# 01 把饮食目标与饮水打卡补进备份

Status: resolved
实现：`4aa45da`（2026-10-02。验收用例：`src/services/backup.test.ts` 的往返 / 旧文件不清空 /
逐键合并，`src/components/ErrorBoundary.test.tsx` 的兜底导出）。
Type: task
Part of: `.scratch/backup-diet-targets/spec.md`
Blocked by: 无

## 目标

`readAllData()` 里补上 `dietGoals` / `dietWater`，让导出、导入、自动快照、崩溃兜底导出四条路径
都带上饮食的每日目标与饮水打卡；旧备份（无这两项）导入时不覆盖本机现有值。

## 改动点

- `src/services/schemas.ts`：两个新 schema + 进 `backupDataSchema` / `BACKUP_MODULES` / `MODULE_LABELS`；
  版本注释加 `20：` 一行；`BACKUP_SCHEMA_VERSION` → 20。
- `src/services/appData.ts`：`readAllData()` 补两个字段。
- `src/services/backup.ts`：`planImport` 按 spec 那张表处理两个非数组模块（`merge` 逐键补缺、
  `overwrite` 整块换、`append` 等同 `merge`）。
- `src/services/moduleExport.ts`：`MODULE_EXPORTS` 补两个条目（饮水一天一行），`moduleRecords()` 契约不变。
- `src/components/ErrorBoundary.tsx`：兜底导出带上这两项。
- `src/pages/SettingsPage.tsx`：导入预览的计数文案按「天 / 项」而非「条」。

## 验收

- 设目标 + 记 3 天饮水 → 导出 → 导入（`overwrite`）→ 逐字段相等。
- 用一份 v19 的旧备份导入 `merge` → 本机目标与饮水原样保留。
- 本机 2 天 + 备份 3 天（另有重合键）导入 `merge` → 5 天，重合键保持本机值。
- `npm run typecheck && npm run lint && npm run format:check && npm run test` 全绿。

## 不做

同步相关的一切；饮水目标的字段设计；把 `recent*Names` 也塞进备份。

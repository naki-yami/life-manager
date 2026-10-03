// @vitest-environment node
/**
 * 防漂移闸：`src/server/config.ts` 里的模块清单必须与 `src/services/schemas.ts` 的
 * `BACKUP_MODULES` 逐字相等。
 *
 * 为什么需要它：服务端目录不能 import 仓库模块（仓库的相对 import 不带扩展名，
 * Node 的 ESM 解析器不认），所以那份清单是**手抄的第二份**。手抄就会漂移 ——
 * 将来给备份加一个模块、忘了同步服务端，副本的 `data` 段就与备份对不上，
 * 而「副本可以当备份导入」这条性质会静默失效。这个测试把那一刻变成一次红灯。
 *
 * 这个文件跑在 vitest 里，所以可以正常 import 仓库模块（Vite 会解析无扩展名 import）。
 */
import { describe, expect, it } from 'vitest';
import { BACKUP_MODULES, BACKUP_SCHEMA_VERSION } from '../services/schemas';
import { SYNC_MODULES, SERVER_SCHEMA_VERSION } from './config';

describe('服务端与仓库 schema 的一致性', () => {
  it('模块清单逐字相等，且顺序一致', () => {
    expect([...SYNC_MODULES]).toEqual([...BACKUP_MODULES]);
  });

  it('模块数是 23 条，且不含 settings', () => {
    expect(SYNC_MODULES).toHaveLength(23);
    // settings 是每台设备各自的 UI 状态，不进副本（spec 的定案）
    expect([...SYNC_MODULES]).not.toContain('settings');
  });

  it('副本结构版本与备份 schema 版本一致', () => {
    expect(SERVER_SCHEMA_VERSION).toBe(BACKUP_SCHEMA_VERSION);
  });
});

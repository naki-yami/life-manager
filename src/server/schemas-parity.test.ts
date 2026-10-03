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
import { BACKUP_MODULES, BACKUP_SCHEMA_VERSION, backupDataSchema } from '../services/schemas';
import { DEFAULT_DIET_GOALS } from '../utils/diet';
import { SYNC_MODULES, SERVER_SCHEMA_VERSION } from './config';
import { DEFAULT_DIET_GOALS as SERVER_DIET_GOALS, emptyReplica } from './replica';

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

  it('服务端手抄的每日目标默认值与客户端一致', () => {
    // 服务端不能 import 客户端模块，所以这个值是手抄的 —— 抄错了「空副本」就不是合法备份
    expect(SERVER_DIET_GOALS).toEqual(DEFAULT_DIET_GOALS);
  });

  /**
   * 最要紧的一条：**空副本必须通过客户端的备份校验**。
   *
   * 这是「副本可以当备份导入」这句自述的可执行版本。工单 03 一度把饮水与目标存成
   * 「带 key 的单元数组」，那时这条会红 —— 客户端 schema 期望的是映射与单值对象，
   * 数组会被当成「这个模块不在文件里」，导入时静默变空。
   */
  it('空副本的 data 段能通过客户端 backupDataSchema（副本确实是合法备份）', () => {
    const parsed = backupDataSchema.safeParse(emptyReplica().data);
    if (!parsed.success) {
      throw new Error(`空副本不是合法备份：${JSON.stringify(parsed.error.issues.slice(0, 5))}`);
    }
    expect(parsed.success).toBe(true);
  });

  it('带数据的副本（含 keyed 模块）同样能通过客户端校验', () => {
    const envelope = emptyReplica();
    envelope.data.tasks = [{ id: 't1', title: '写周报' }];
    envelope.data.dietWater = { '2026-10-02': { glasses: 8 } };
    envelope.data.dietGoals = { calories: 2100, protein: 120 };

    const parsed = backupDataSchema.safeParse(envelope.data);
    if (!parsed.success) {
      throw new Error(`副本不是合法备份：${JSON.stringify(parsed.error.issues.slice(0, 5))}`);
    }
    expect(parsed.success).toBe(true);
  });
});

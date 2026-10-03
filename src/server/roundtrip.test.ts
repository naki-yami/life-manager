// @vitest-environment node
/**
 * 端到端验证：服务端副本 → 客户端导入路径，两个 keyed 模块不丢。
 *
 * 这是「副本可以当备份导入」这句话的可执行版本，走的是客户端真正的 parseBackup。
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadReplica } from './replica';
import { handlePush } from './push';
import { serializeBackup, parseBackup, planImport } from '../services/backup';

describe('副本 → 客户端备份导入（往返）', () => {
  it('推过饮水与目标之后，副本当备份导入仍能读回这两样', () => {
    const { replica } = loadReplica({ dataDir: mkdtempSync(join(tmpdir(), 'lm-rt-')) });
    const ctx = { replica, onHistory: () => {} };
    handlePush(
      ctx as never,
      {
        deviceId: 'dev-1',
        changes: [
          { module: 'dietWater', key: '2026-10-02', baseRev: 0, op: 'put', record: { glasses: 8 } },
          {
            module: 'dietGoals',
            key: 'dietGoals',
            baseRev: 0,
            op: 'put',
            record: { calories: 2100, protein: 120 },
          },
          {
            module: 'tasks',
            key: 't1',
            baseRev: 0,
            op: 'put',
            record: { id: 't1', title: '写周报' },
          },
        ],
      } as never,
    );

    // 副本的 data 段直接当成备份数据序列化（信封形状一致）
    const replicaAsBackup = serializeBackup(replica.envelope.data as never);
    const parsed = parseBackup(replicaAsBackup);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    /*
     * **把 spec 里写的示例形状钉住。**
     *
     * spec 的「两个 keyed 模块在副本里的形状」一节给的是可复制的示例，早先那版误写成
     * `{ '2026-10-02': { glasses: 8 } }` —— 而那是**静默清空饮水**的形状。
     * 这里直接断言落盘形状是扁平数字，示例一旦被改回错的，这条会红。
     */
    expect(replica.envelope.data.dietWater).toEqual({ '2026-10-02': 8 });
    expect(replica.envelope.data.dietGoals).toEqual({ calories: 2100, protein: 120 });
    // 明确排除那个会静默出错的形状
    expect(replica.envelope.data.dietWater).not.toEqual({ '2026-10-02': { glasses: 8 } });

    // 关键：两个 keyed 模块按客户端形状读回来了，没有变成「模块不在文件里」。
    // 饮水的客户端形状是**扁平的 date -> 数字**（dietStore.water 就是 Record<string, number>），
    // 不是 { date: { glasses } } —— 包一层对象会被 sanitizeWater 当脏值剔掉、静默变空。
    expect(parsed.backup.modules.dietWater).toEqual({ '2026-10-02': 8 });
    expect(parsed.backup.modules.dietGoals).toEqual({ calories: 2100, protein: 120 });
    // 记录类模块照常读回（客户端 schema 会补齐它自己的默认字段，那是归一化层该做的事，
    // 所以这里只断言我们推上去的内容还在）
    expect(parsed.backup.modules.tasks).toHaveLength(1);
    expect(parsed.backup.modules.tasks![0]).toMatchObject({ id: 't1', title: '写周报' });

    // 再走一遍导入计划，确认能真的落库（而不是只在解析层看着对）
    const plan = planImport({} as never, parsed.backup.modules, 'overwrite');
    expect(plan.data.dietWater).toEqual({ '2026-10-02': 8 });
    expect(plan.data.dietGoals).toEqual({ calories: 2100, protein: 120 });
  });
});

// @vitest-environment node
/**
 * 客户端同步单位表与服务端模块清单的一致性。
 *
 * 为什么需要这条：单位表是**手写的第二份**清单（客户端要按 store 分组以便阅读，
 * 服务端要按备份模块名列出），两边各自演化就会漂移。漂移的后果是某个模块
 * **同步不到** —— 而它不会报错，只是那类数据在另一端永远不变。
 *
 * **断言的是集合相等，不是顺序相等**：两份清单的分组方式不同（客户端按 store 分组、
 * 服务端按备份模块名顺序），而模块顺序在两边都不承重 —— 没有任何地方按下标取模块、
 * 也没有逐字节比对 `data` 段的键序（服务端只做 `includes` 与按名取值）。
 * 早先 `units.ts` 的注释写着「顺序与服务端一致」，那是**不实的**，已改。
 */
import { describe, expect, it } from 'vitest';
import { SYNC_MODULES as SERVER_MODULES } from '../../server/config';
import { BACKUP_MODULES } from '../schemas';
import { syncUnitModules } from './units';

const clientModules = (): string[] => syncUnitModules();
const sorted = (list: readonly string[]): string[] => [...list].sort();

describe('同步单位表 vs 服务端清单', () => {
  it('模块集合与服务端 SYNC_MODULES 完全相同（一个不多、一个不少）', () => {
    expect(sorted(clientModules())).toEqual(sorted(SERVER_MODULES));
  });

  it('也等于客户端的 BACKUP_MODULES', () => {
    expect(sorted(clientModules())).toEqual(sorted(BACKUP_MODULES));
  });

  it('数量是 23，且不含 settings（它不进副本）', () => {
    expect(clientModules()).toHaveLength(23);
    expect(clientModules()).not.toContain('settings');
  });

  it('没有重复登记同一个模块', () => {
    const modules = clientModules();
    expect(new Set(modules).size).toBe(modules.length);
  });
});

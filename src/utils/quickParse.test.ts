import { describe, expect, it } from 'vitest';
import { parseQuickTask } from './quickParse';

describe('parseQuickTask', () => {
  it('解析优先级与日期标记', () => {
    expect(parseQuickTask('写周报 !高 @今天', '2026-09-28')).toEqual({
      title: '写周报',
      priority: 'high',
      dueDate: '2026-09-28',
    });
    expect(parseQuickTask('买菜 !低 @明天', '2026-09-28')).toEqual({
      title: '买菜',
      priority: 'low',
      dueDate: '2026-09-29',
    });
    expect(parseQuickTask('复盘 !中 @2026-10-01', '2026-09-28')).toEqual({
      title: '复盘',
      priority: 'medium',
      dueDate: '2026-10-01',
    });
  });

  it('没有标记时默认中等优先级、无截止日期', () => {
    expect(parseQuickTask('随手记一笔', '2026-09-28')).toEqual({
      title: '随手记一笔',
      priority: 'medium',
      dueDate: '',
    });
  });

  it('无法识别的标记原样保留在标题里，不报错', () => {
    expect(parseQuickTask('读 !超 @昨天', '2026-09-28')).toEqual({
      title: '读 !超 @昨天',
      priority: 'medium',
      dueDate: '',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { parseCapture, parseQuickTask } from './quickParse';

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

describe('parseCapture 模块前缀', () => {
  it('没有前缀时默认按任务处理', () => {
    const parsed = parseCapture('写周报 !高 @明天', '2026-09-28');
    expect(parsed).toMatchObject({
      kind: 'task',
      explicit: false,
      text: '写周报',
      priority: 'high',
      dueDate: '2026-09-29',
    });
  });

  it('识别中文与英文模块前缀，并去掉前缀本身', () => {
    expect(parseCapture('读书 置身事内', '2026-09-28')).toMatchObject({
      kind: 'book',
      explicit: true,
      text: '置身事内',
    });
    expect(parseCapture('健身：跑步', '2026-09-28')).toMatchObject({
      kind: 'fitness',
      explicit: true,
      text: '跑步',
    });
    expect(parseCapture('TODO 交周报', '2026-09-28')).toMatchObject({
      kind: 'task',
      explicit: true,
      text: '交周报',
    });
    expect(parseCapture('game 星露谷', '2026-09-28')).toMatchObject({
      kind: 'game',
      explicit: true,
      text: '星露谷',
    });
  });

  it('前缀必须单独成词，不能吞掉正常的标题', () => {
    expect(parseCapture('任务分解会', '2026-09-28')).toMatchObject({
      kind: 'task',
      explicit: false,
      text: '任务分解会',
    });
    expect(parseCapture('健身后拉伸', '2026-09-28')).toMatchObject({
      kind: 'task',
      explicit: false,
      text: '健身后拉伸',
    });
  });

  it('只写了模块名时正文为空，交给调用方决定不落库', () => {
    expect(parseCapture('读书', '2026-09-28').text).toBe('');
  });

  it('备忘是自由文本，不解析标记', () => {
    const parsed = parseCapture('备忘 明天记得买票 @今天 !高', '2026-09-28');
    expect(parsed.kind).toBe('memo');
    expect(parsed.text).toBe('明天记得买票 @今天 !高');
    expect(parsed.dueDate).toBe('');
  });
});

describe('parseCapture 信号推断', () => {
  it('书名号推断成读书，并拆出书名与补充词', () => {
    const parsed = parseCapture('《置身事内》读到 120 页', '2026-09-28');
    expect(parsed).toMatchObject({ kind: 'book', explicit: false, text: '置身事内' });
    expect(parsed.amount).toEqual({ value: 120, unit: 'page' });
  });

  it('时长推断成健身，小时会换算', () => {
    expect(parseCapture('跑步 30min', '2026-09-28')).toMatchObject({
      kind: 'fitness',
      text: '跑步',
      amount: { value: 30, unit: 'minute' },
    });
    expect(parseCapture('游泳 1.5h', '2026-09-28')).toMatchObject({
      kind: 'fitness',
      text: '游泳',
      amount: { value: 1.5, unit: 'hour' },
    });
  });

  it('热量推断成饮食', () => {
    expect(parseCapture('鸡胸肉 200kcal', '2026-09-28')).toMatchObject({
      kind: 'diet',
      text: '鸡胸肉',
      amount: { value: 200, unit: 'kcal' },
    });
  });

  it('显式前缀优先于信号推断', () => {
    expect(parseCapture('任务 跑步 30min', '2026-09-28')).toMatchObject({
      kind: 'task',
      text: '跑步',
      amount: { value: 30, unit: 'minute' },
    });
  });

  it('认不出来的标记原样留在正文里（包含数值以外的词）', () => {
    const parsed = parseCapture('读 !超 @昨天 3kg', '2026-09-28');
    expect(parsed.kind).toBe('task');
    expect(parsed.text).toBe('读 !超 @昨天 3kg');
    expect(parsed.amount).toBeNull();
  });

  it('body 保留去前缀后的原文，供兜底存备忘使用', () => {
    expect(parseCapture('读书《置身事内》30min', '2026-09-28').body).toBe('《置身事内》30min');
  });
});

describe('parseCapture 日期', () => {
  const today = '2026-09-28'; // 周一

  it('@今天 / @明天 / @后天', () => {
    expect(parseCapture('A @今天', today).dueDate).toBe('2026-09-28');
    expect(parseCapture('A @明天', today).dueDate).toBe('2026-09-29');
    expect(parseCapture('A @后天', today).dueDate).toBe('2026-09-30');
  });

  it('@周X 取最近一次，包括今天', () => {
    expect(parseCapture('A @周一', today).dueDate).toBe('2026-09-28');
    expect(parseCapture('A @周三', today).dueDate).toBe('2026-09-30');
    expect(parseCapture('A @周日', today).dueDate).toBe('2026-10-04');
  });

  it('@下周三 落在下周，周五写也不会滑到下下周', () => {
    expect(parseCapture('A @下周三', today).dueDate).toBe('2026-10-07');
    expect(parseCapture('A @下周三', '2026-10-02').dueDate).toBe('2026-10-07');
  });

  it('@星期X 与 @YYYY-MM-DD', () => {
    expect(parseCapture('A @星期五', today).dueDate).toBe('2026-10-02');
    expect(parseCapture('A @2026-12-31', today).dueDate).toBe('2026-12-31');
  });
});

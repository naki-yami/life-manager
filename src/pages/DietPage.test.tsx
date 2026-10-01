import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { DietPage } from './DietPage';
import { useDietStore } from '../store/dietStore';
import { useLibraryStore } from '../store/libraryStore';
import { addDays, formatDayLabel, todayKey } from '../utils/date';
import { FoodItem, MealType } from '../types';

beforeEach(() => {
  useDietStore.setState({
    records: [],
    goals: { calories: 2000, protein: 80 },
    water: {},
    templates: [],
  });
  useLibraryStore.setState({ customFoods: [], customExercises: [], recentFoodNames: [], recentExerciseNames: [] });
});

const today = todayKey();
const yesterday = addDays(today, -1);

/** 统计卡片的整块文本，避免多个卡片出现相同数字时选择器歧义 */
const statText = (label: string): string =>
  screen.getByText(label).closest('div.rounded-lg')?.textContent ?? '';

const addMeal = (date: string, type: MealType, items: FoodItem[]): void => {
  useDietStore.getState().addRecord(date, type, items);
};

const openAddModal = async (): Promise<HTMLElement> => {
  await userEvent.click(screen.getAllByRole('button', { name: '记录饮食' })[0]!);
  return screen.getByRole('dialog', { name: '记录饮食' });
};

describe('DietPage', () => {
  it('默认展示今天，没有记录时给出空态与引导', async () => {
    render(<DietPage />);

    expect(screen.getByText(/这天还是空的/)).toBeInTheDocument();
    expect(screen.getByText('早餐 · 0 kcal')).toBeInTheDocument();
    expect(statText('当日摄入')).toContain('0');
    expect(statText('当日餐次')).toContain('0');

    const dialog = await openAddModal();
    expect(within(dialog).getByLabelText('日期')).toHaveValue(today);
  });

  it('记录饮食后进入对应餐次并计入当日摄入', async () => {
    render(<DietPage />);
    const dialog = await openAddModal();

    await userEvent.selectOptions(within(dialog).getByLabelText('餐次'), 'lunch');
    await userEvent.type(within(dialog).getByLabelText('第 1 个食物名称'), '鸡胸肉');
    const calories = within(dialog).getByRole('spinbutton', { name: '第 1 个食物的热量' });
    await userEvent.clear(calories);
    await userEvent.type(calories, '200');
    await userEvent.selectOptions(within(dialog).getByLabelText('第 1 个食物的分类'), '蛋白质');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    const records = useDietStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]!.date).toBe(today);
    expect(records[0]!.type).toBe('lunch');
    expect(records[0]!.totalCalories).toBe(200);
    expect(records[0]!.items[0]!.category).toBe('蛋白质');

    expect(screen.getByText('鸡胸肉 · 200 kcal')).toBeInTheDocument();
    expect(screen.getByText('午餐 · 200 kcal')).toBeInTheDocument();
    expect(statText('当日摄入')).toContain('200');
  });

  it('食物名为空时不能保存，添加多个食物会累加热量', async () => {
    render(<DietPage />);
    const dialog = await openAddModal();

    expect(within(dialog).getByRole('button', { name: '保存' })).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText('第 1 个食物名称'), '全麦面包');
    await userEvent.click(within(dialog).getByRole('button', { name: '添加食物' }));
    await userEvent.type(within(dialog).getByLabelText('第 2 个食物名称'), '牛奶');
    const calories = within(dialog).getByRole('spinbutton', { name: '第 2 个食物的热量' });
    await userEvent.clear(calories);
    await userEvent.type(calories, '150');

    expect(within(dialog).getByText(/合计/)).toHaveTextContent('150');

    await userEvent.click(within(dialog).getByRole('button', { name: '移除第 2 个食物' }));
    expect(within(dialog).queryByLabelText('第 2 个食物名称')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '移除第 1 个食物' })).toBeDisabled();
  });

  it('餐次卡片的「添加」会预设对应餐次', async () => {
    render(<DietPage />);

    const dinnerCard = screen.getByText(/^晚餐 ·/).closest('div.rounded-lg')!;
    await userEvent.click(within(dinnerCard as HTMLElement).getByRole('button', { name: '添加' }));

    const dialog = screen.getByRole('dialog', { name: '记录饮食' });
    expect(within(dialog).getByLabelText('餐次')).toHaveValue('dinner');
  });

  it('可以切换日期，今天之后不能往后翻', async () => {
    addMeal(yesterday, 'dinner', [{ name: '番茄牛腩', category: '蛋白质', calories: 700 }]);

    render(<DietPage />);
    expect(screen.getByText(/这天还是空的/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '后一天' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: '前一天' }));
    expect(screen.getByText('番茄牛腩 · 700 kcal')).toBeInTheDocument();
    expect(screen.getByText('晚餐 · 700 kcal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '后一天' })).toBeEnabled();
    expect(statText('当日摄入')).toContain('700');
    expect(statText('当日摄入')).toContain(formatDayLabel(yesterday));

    await userEvent.click(screen.getByRole('button', { name: '回到今天' }));
    expect(screen.getByText(/这天还是空的/)).toBeInTheDocument();
  });

  it('统计卡片汇总当日摄入、餐次、近 7 天日均与累计记录', () => {
    addMeal(today, 'breakfast', [{ name: '鸡蛋', category: '蛋白质', calories: 300 }]);
    addMeal(today, 'lunch', [{ name: '鸡胸肉', category: '蛋白质', calories: 500 }]);
    addMeal(yesterday, 'dinner', [{ name: '番茄牛腩', category: '蛋白质', calories: 700 }]);

    render(<DietPage />);

    expect(statText('当日摄入')).toContain('800');
    expect(statText('当日餐次')).toContain('2');
    expect(statText('近 7 天日均')).toContain('750');
    expect(statText('累计记录')).toContain('3');
  });

  it('按日视图可以搜索食物名', async () => {
    addMeal(today, 'breakfast', [{ name: '鸡蛋', category: '蛋白质', calories: 100 }]);
    addMeal(today, 'lunch', [{ name: '鸡胸肉', category: '蛋白质', calories: 200 }]);

    render(<DietPage />);
    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), '鸡胸');

    expect(screen.getByText('鸡胸肉 · 200 kcal')).toBeInTheDocument();
    expect(screen.queryByText('鸡蛋 · 100 kcal')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole('textbox', { name: '搜索' }));
    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), 'zzz');
    expect(screen.getByText('没有匹配的食物')).toBeInTheDocument();
  });

  it('全部记录视图按日期分组，并按关键词过滤', async () => {
    addMeal(today, 'lunch', [{ name: '鸡胸肉', category: '蛋白质', calories: 200 }]);
    addMeal(yesterday, 'dinner', [{ name: '番茄牛腩', category: '蛋白质', calories: 700 }]);

    render(<DietPage />);
    await userEvent.click(screen.getByRole('button', { name: /^全部记录/ }));

    expect(screen.getByText(formatDayLabel(today))).toBeInTheDocument();
    expect(screen.getByText(formatDayLabel(yesterday))).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), '牛腩');
    expect(screen.getByText('番茄牛腩 · 700 kcal')).toBeInTheDocument();
    expect(screen.queryByText('鸡胸肉 · 200 kcal')).not.toBeInTheDocument();
    expect(screen.queryByText(formatDayLabel(today))).not.toBeInTheDocument();
  });

  it('删除记录要二次确认', async () => {
    addMeal(today, 'lunch', [{ name: '鸡胸肉', category: '蛋白质', calories: 200 }]);

    render(<DietPage />);
    await userEvent.click(screen.getByRole('button', { name: '删除「鸡胸肉」这条记录' }));

    const dialog = screen.getByRole('dialog', { name: '删除饮食记录' });
    expect(within(dialog).getByText(/200 kcal/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(useDietStore.getState().records).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: '删除「鸡胸肉」这条记录' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: '删除饮食记录' })).getByRole('button', {
        name: '删除',
      }),
    );
    expect(useDietStore.getState().records).toHaveLength(0);
    expect(screen.getByText(/这天还是空的/)).toBeInTheDocument();
  });
  it('没有记录时不渲染热量趋势卡片', () => {
    render(<DietPage />);

    expect(screen.queryByRole('img', { name: /热量趋势/ })).not.toBeInTheDocument();
  });

  it('热量趋势可以在近 7 天 / 近 4 周 / 近 6 月之间切换', async () => {
    addMeal(today, 'lunch', [{ name: '鸡胸肉', category: 'protein', calories: 600 }]);
    addMeal(yesterday, 'dinner', [{ name: '米饭', category: 'carb', calories: 400 }]);

    render(<DietPage />);

    expect(
      screen.getByRole('img', { name: '热量趋势（近 7 天）：合计 1,000 kcal，单日最高 600 kcal' }),
    ).toBeInTheDocument();
    expect(screen.getByText('合计 1,000 kcal')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '近 4 周' }));
    expect(
      screen.getByRole('img', { name: /热量趋势（近 4 周）：合计 1,000 kcal/ }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '近 6 月' }));
    expect(
      screen.getByRole('img', { name: /热量趋势（近 6 月）：合计 1,000 kcal/ }),
    ).toBeInTheDocument();
    // 按月聚合时刻度换成月份，而不是具体日期
    expect(screen.getByText(`${new Date().getMonth() + 1} 月`)).toBeInTheDocument();
  });

  it('近 7 天日均卡片里带一条迷你趋势线', () => {
    addMeal(today, 'lunch', [{ name: '鸡胸肉', category: 'protein', calories: 600 }]);

    render(<DietPage />);

    expect(screen.getByRole('img', { name: '近 7 天每日摄入热量趋势' })).toBeInTheDocument();
  });

  it('营养目标卡显示剩余额度，超过目标提示已超出', () => {
    addMeal(today, 'lunch', [{ name: '牛肉面', category: '主食', calories: 1600 }]);

    render(<DietPage />);
    expect(screen.getByText('还剩 400 kcal 额度')).toBeInTheDocument();

    addMeal(today, 'dinner', [{ name: '炸鸡', category: '零食', calories: 800 }]);
    render(<DietPage />);
    expect(screen.getAllByText(/已超出 400 kcal/).length).toBeGreaterThan(0);
  });

  it('记录行与卡片汇总显示三大营养素', () => {
    addMeal(today, 'lunch', [
      { name: '鸡胸肉', category: '蛋白质', calories: 220, protein: 40, carbs: 0, fat: 5 },
    ]);

    render(<DietPage />);

    expect(screen.getByText(/共 220 kcal · 蛋白 40g · 脂肪 5g/)).toBeInTheDocument();
    expect(screen.getByText('蛋白 40g')).toBeInTheDocument();
    expect(screen.getByText('碳水 0g')).toBeInTheDocument();
  });

  it('饮水打卡可以点选与取消', async () => {
    render(<DietPage />);

    await userEvent.click(screen.getByRole('button', { name: '第 3 杯水' }));
    expect(useDietStore.getState().water[today]).toBe(3);
    expect(screen.getByText('饮水 3/8 杯')).toBeInTheDocument();

    // 再点一次第 3 杯回到 2 杯
    await userEvent.click(screen.getByRole('button', { name: '第 3 杯水' }));
    expect(useDietStore.getState().water[today]).toBe(2);
  });

  it('复制昨天把昨天的记录搬到今天', async () => {
    addMeal(yesterday, 'breakfast', [{ name: '燕麦', category: '主食', calories: 300 }]);

    render(<DietPage />);
    await userEvent.click(screen.getByRole('button', { name: '复制昨天' }));

    const todays = useDietStore.getState().records.filter((record) => record.date === today);
    expect(todays).toHaveLength(1);
    expect(todays[0]!.type).toBe('breakfast');
    expect(todays[0]!.items[0]!.name).toBe('燕麦');
  });

  it('饮食日历可以切换日期', async () => {
    addMeal(today, 'lunch', [{ name: '牛肉面', category: '主食', calories: 620 }]);
    render(<DietPage />);

    expect(screen.getByText('饮食日历')).toBeInTheDocument();
    // 点昨天：如果昨天跨月（今天是 1 号），日历的点格会带出上月的日期键，
    // 所以断言只针对「切走之后当天没记录」这个行为，不钉死具体日期
    const yesterday = addDays(today, -1);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(yesterday) }));

    expect(screen.getByText(/这天还是空的/)).toBeInTheDocument();
  });

  it('从食物库选择：搜索、填入表单', async () => {
    render(<DietPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '记录饮食' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '记录饮食' });
    await userEvent.click(within(dialog).getByRole('button', { name: '从食物库选择' }));

    const picker = screen.getByRole('dialog', { name: '从食物库选择' });
    await userEvent.type(within(picker).getByLabelText('搜索'), '鸡胸');
    await userEvent.click(within(picker).getByRole('button', { name: '把「鸡胸肉」填入表单' }));

    // 原地填进了空着的第一个条目
    expect(within(dialog).getByLabelText('第 1 个食物名称')).toHaveValue('鸡胸肉');
    expect(within(dialog).getByLabelText('第 1 个食物的热量')).toHaveValue(133);
    expect(useLibraryStore.getState().customFoods).toHaveLength(0);
  });

  it('餐次模板：把一餐存成模板，再从「常吃组合」一键预填', async () => {
    addMeal(today, 'lunch', [{ name: '鸡胸肉', category: '蛋白质', calories: 200 }]);
    render(<DietPage />);

    // 一条模板都没有时整块不渲染
    expect(screen.queryByText('常吃组合')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '把「鸡胸肉」存成模板' }));

    const templates = useDietStore.getState().templates;
    expect(templates).toHaveLength(1);
    expect(templates[0]!.name).toBe('午餐 · 鸡胸肉');
    expect(templates[0]!.type).toBe('lunch');
    // 模板与来源记录各自持有条目，id 不能撞
    const record = useDietStore.getState().records[0]!;
    expect(templates[0]!.items[0]!.id).not.toBe(record.items[0]!.id);

    expect(screen.getByText('常吃组合')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: `用模板「午餐 · 鸡胸肉」记录到 ${today}` }),
    );

    const dialog = screen.getByRole('dialog', { name: '记录饮食' });
    expect(within(dialog).getByLabelText('日期')).toHaveValue(today);
    expect(within(dialog).getByLabelText('餐次')).toHaveValue('lunch');
    expect(within(dialog).getByLabelText('第 1 个食物名称')).toHaveValue('鸡胸肉');
    expect(within(dialog).getByRole('spinbutton', { name: '第 1 个食物的热量' })).toHaveValue(200);
  });

  it('套用模板保存后，记录里的条目 id 与模板不同', async () => {
    addMeal(today, 'breakfast', [{ name: '燕麦', category: '主食', calories: 300 }]);
    render(<DietPage />);
    await userEvent.click(screen.getByRole('button', { name: '把「燕麦」存成模板' }));

    await userEvent.click(screen.getByRole('button', { name: `用模板「早餐 · 燕麦」记录到 ${today}` }));
    const dialog = screen.getByRole('dialog', { name: '记录饮食' });
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    const template = useDietStore.getState().templates[0]!;
    const seeded = useDietStore
      .getState()
      .records.find((item) => item.id !== useDietStore.getState().records[0]!.id)!;
    expect(seeded.items[0]!.id).not.toBe(template.items[0]!.id);
  });

  it('重名模板自动加序号，删除模板不影响已经记录的饮食', async () => {
    addMeal(today, 'lunch', [{ name: '鸡胸肉', category: '蛋白质', calories: 200 }]);
    render(<DietPage />);

    await userEvent.click(screen.getByRole('button', { name: '把「鸡胸肉」存成模板' }));
    await userEvent.click(screen.getByRole('button', { name: '把「鸡胸肉」存成模板' }));

    const names = useDietStore.getState().templates.map((template) => template.name);
    expect(names).toEqual(['午餐 · 鸡胸肉', '午餐 · 鸡胸肉 (2)']);

    await userEvent.click(screen.getByRole('button', { name: '删除模板「午餐 · 鸡胸肉 (2)」' }));
    const dialog = screen.getByRole('dialog', { name: '删除餐次模板' });
    expect(within(dialog).getByText(/已经记录下来的饮食不受影响/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '删除' }));

    expect(useDietStore.getState().templates.map((template) => template.name)).toEqual([
      '午餐 · 鸡胸肉',
    ]);
    expect(useDietStore.getState().records).toHaveLength(1);
  });

  it('库里没有的可以存为自建，并立刻能选', async () => {
    render(<DietPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '记录饮食' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '记录饮食' });
    await userEvent.click(within(dialog).getByRole('button', { name: '从食物库选择' }));

    const picker = screen.getByRole('dialog', { name: '从食物库选择' });
    await userEvent.type(within(picker).getByLabelText('名称'), '妈妈牌红烧肉');
    await userEvent.click(within(picker).getByRole('button', { name: '存入食物库' }));

    expect(useLibraryStore.getState().customFoods[0]!.name).toBe('妈妈牌红烧肉');
    expect(within(picker).getByText('妈妈牌红烧肉')).toBeInTheDocument();
    expect(within(picker).getByText('自建')).toBeInTheDocument();

    // 自建条目也能删
    await userEvent.click(
      within(picker).getByRole('button', { name: '删除自建食物「妈妈牌红烧肉」' }),
    );
    expect(useLibraryStore.getState().customFoods).toHaveLength(0);
  });

  it('食物选择器记住最近使用（U4）：填入一次后顶部出现快捷 chips', async () => {
    render(<DietPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '记录饮食' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '记录饮食' });
    await userEvent.click(within(dialog).getByRole('button', { name: '从食物库选择' }));
    const picker = screen.getByRole('dialog', { name: '从食物库选择' });

    // 首次打开没有最近使用区
    expect(within(picker).queryByText('最近使用')).not.toBeInTheDocument();

    await userEvent.click(within(picker).getByRole('button', { name: '把「鸡胸肉」填入表单' }));

    // 关掉重开：最近使用区出现鸡胸肉
    await userEvent.click(within(picker).getByRole('button', { name: '关闭' }));
    await userEvent.click(within(dialog).getByRole('button', { name: '从食物库选择' }));
    const pickerAgain = screen.getByRole('dialog', { name: '从食物库选择' });
    const recentSection = within(pickerAgain).getByText('最近使用').closest('div')!;
    expect(within(recentSection).getByRole('button', { name: /鸡胸肉/ })).toBeInTheDocument();

    // 点快捷 chip 直接再填一行
    await userEvent.click(within(recentSection).getByRole('button', { name: /鸡胸肉/ }));
    expect(useLibraryStore.getState().recentFoodNames[0]).toBe('鸡胸肉');
  });
});

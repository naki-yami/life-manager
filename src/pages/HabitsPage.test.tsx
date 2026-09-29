import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { HabitsPage } from './HabitsPage';
import { useHabitStore } from '../store/habitStore';
import { addDays, todayKey } from '../utils/date';

const TODAY = todayKey();
const store = () => useHabitStore.getState();

beforeEach(() => {
  localStorage.clear();
  useHabitStore.setState({ habits: [] });
});

/** 行内 7 天格子：最后一格是今天，offset 越大越早 */
const cellFor = (habitName: string, offsetFromToday = 0): HTMLElement => {
  const strip = screen.getByRole('group', { name: `「${habitName}」最近 7 天打卡` });
  const cells = within(strip).getAllByRole('button');
  return cells[cells.length - 1 - offsetFromToday]!;
};

const openCreate = async (): Promise<HTMLElement> => {
  await userEvent.click(screen.getByRole('button', { name: '新建习惯' }));
  return screen.getByRole('dialog', { name: '新建习惯' });
};

describe('HabitsPage 新建与编辑', () => {
  it('没有习惯时给出空态与引导', () => {
    render(<HabitsPage />);

    expect(screen.getByText('还没有习惯')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建第一个习惯' })).toBeInTheDocument();
  });

  it('新建一个「做到即可」的习惯', async () => {
    render(<HabitsPage />);
    const dialog = await openCreate();

    await userEvent.type(within(dialog).getByLabelText(/习惯名称/), '晨跑');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(store().habits).toHaveLength(1);
    expect(store().habits[0]).toMatchObject({
      name: '晨跑',
      kind: 'binary',
      schedule: { kind: 'daily', timesPerWeek: 1, everyDays: 1 },
    });
    expect(screen.getByRole('group', { name: '「晨跑」最近 7 天打卡' })).toBeInTheDocument();
  });

  it('新建量化习惯：目标与单位都会落库', async () => {
    render(<HabitsPage />);
    const dialog = await openCreate();

    await userEvent.type(within(dialog).getByLabelText(/习惯名称/), '喝水');
    await userEvent.click(within(dialog).getByRole('button', { name: '计数量' }));
    fireEvent.change(within(dialog).getByLabelText('目标数量'), { target: { value: '8' } });
    await userEvent.type(within(dialog).getByLabelText('单位'), '杯');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(store().habits[0]).toMatchObject({ name: '喝水', kind: 'count', target: 8, unit: '杯' });
    expect(screen.getByText('8 杯')).toBeInTheDocument();
  });

  it('「每周 N 次」「每 N 天」都能建出来', async () => {
    render(<HabitsPage />);
    let dialog = await openCreate();
    await userEvent.type(within(dialog).getByLabelText(/习惯名称/), '健身');
    await userEvent.click(within(dialog).getByRole('button', { name: '每周 N 次' }));
    fireEvent.change(within(dialog).getByLabelText('每周次数'), { target: { value: '3' } });
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(store().habits[0]!.schedule).toEqual({
      kind: 'weekly',
      timesPerWeek: 3,
      everyDays: 1,
    });
    expect(screen.getByText('每周 3 次')).toBeInTheDocument();
  });

  it('名称为空时拒绝保存并给出提示', async () => {
    render(<HabitsPage />);
    const dialog = await openCreate();

    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(store().habits).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent('给习惯起个名字吧');
  });

  it('编辑会预填当前设置，保存后更新', async () => {
    store().addHabit({ name: '喝水', kind: 'count', target: 8, unit: '杯' });
    render(<HabitsPage />);

    await userEvent.click(screen.getByRole('button', { name: '编辑「喝水」' }));
    const dialog = screen.getByRole('dialog', { name: '编辑习惯' });
    const name = within(dialog).getByLabelText(/习惯名称/);
    expect(name).toHaveValue('喝水');
    expect(within(dialog).getByLabelText('目标数量')).toHaveValue(8);

    await userEvent.clear(name);
    await userEvent.type(name, '多喝水');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(store().habits).toHaveLength(1);
    expect(store().habits[0]!.name).toBe('多喝水');
  });

  it('删除习惯，且没有 ToastProvider 也不会抛错', async () => {
    store().addHabit({ name: '晨跑' });
    render(<HabitsPage />);

    await userEvent.click(screen.getByRole('button', { name: '删除「晨跑」' }));

    expect(store().habits).toHaveLength(0);
    expect(screen.getByText('还没有习惯')).toBeInTheDocument();
  });

  it('n 快捷键会打开新建对话框', async () => {
    render(<HabitsPage />);

    act(() => {
      window.dispatchEvent(new CustomEvent('lm:new-entry'));
    });

    expect(screen.getByRole('dialog', { name: '新建习惯' })).toBeInTheDocument();
  });
});

describe('HabitsPage 打卡', () => {
  it('点格子就是打卡，再点一下撤销', async () => {
    store().addHabit({ name: '晨跑' });
    render(<HabitsPage />);

    expect(cellFor('晨跑')).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(cellFor('晨跑'));
    expect(store().habits[0]!.logs[TODAY]).toBe(1);
    expect(cellFor('晨跑')).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(cellFor('晨跑'));
    expect(store().habits[0]!.logs[TODAY]).toBeUndefined();
    expect(cellFor('晨跑')).toHaveAttribute('aria-pressed', 'false');
  });

  it('量化习惯每点一次 +1，达到目标后再点清零', async () => {
    store().addHabit({ name: '喝水', kind: 'count', target: 3 });
    render(<HabitsPage />);

    await userEvent.click(cellFor('喝水'));
    await userEvent.click(cellFor('喝水'));
    expect(store().habits[0]!.logs[TODAY]).toBe(2);

    await userEvent.click(cellFor('喝水'));
    expect(store().habits[0]!.logs[TODAY]).toBe(3);

    await userEvent.click(cellFor('喝水'));
    expect(store().habits[0]!.logs[TODAY]).toBeUndefined();
  });

  it('可以补打之前的某一天，不影响今天', async () => {
    store().addHabit({ name: '晨跑' });
    render(<HabitsPage />);

    await userEvent.click(cellFor('晨跑', 2));

    expect(store().habits[0]!.logs[addDays(TODAY, -2)]).toBe(1);
    expect(store().habits[0]!.logs[TODAY]).toBeUndefined();
  });

  it('顶部「今天还没打卡」点一下即完成，卡片随之消失', async () => {
    store().addHabit({ name: '晨跑' });
    render(<HabitsPage />);

    expect(screen.getByText('今天还没打卡')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '打卡「晨跑」' }));

    expect(store().habits[0]!.logs[TODAY]).toBe(1);
    expect(screen.queryByText('今天还没打卡')).not.toBeInTheDocument();
  });

  it('量化习惯的快捷按钮会显示当前进度', async () => {
    store().addHabit({ name: '喝水', kind: 'count', target: 8 });
    store().toggleHabitLog(store().habits[0]!.id, TODAY);
    render(<HabitsPage />);

    const chip = screen.getByRole('button', { name: '给「喝水」记一次，当前 1/8' });
    await userEvent.click(chip);

    expect(store().habits[0]!.logs[TODAY]).toBe(2);
  });
});

describe('HabitsPage 概览', () => {
  it('统计卡片反映今日完成、平均强度与近 7 天打卡数', () => {
    store().addHabit({ name: '晨跑' });
    store().addHabit({ name: '读书' });
    store().toggleHabitLog(store().habits[0]!.id, TODAY);

    render(<HabitsPage />);

    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('平均强度')).toBeInTheDocument();
    expect(screen.getByText('最长连续')).toBeInTheDocument();
    expect(screen.getByText('近 7 天打卡')).toBeInTheDocument();
  });

  it('每周型习惯会显示本周进度', () => {
    store().addHabit({ name: '健身', schedule: { kind: 'weekly', timesPerWeek: 3, everyDays: 1 } });
    store().toggleHabitLog(store().habits[0]!.id, TODAY);

    render(<HabitsPage />);

    expect(screen.getByText('本周 1/3')).toBeInTheDocument();
  });

  it('断签不清零：昨天打过、今天没打也会显示非零强度', () => {
    store().addHabit({ name: '晨跑' });
    const created = store().habits[0]!;
    // 把建立日推到 3 天前，昨天的打卡才会落在强度分的观察窗口里
    useHabitStore.setState({
      habits: [{ ...created, createdAt: `${addDays(TODAY, -3)}T09:00:00` }],
    });
    store().toggleHabitLog(created.id, addDays(TODAY, -1));

    render(<HabitsPage />);

    expect(screen.getByText('今天还没打卡')).toBeInTheDocument();
    expect(screen.queryByText(/待开始/)).not.toBeInTheDocument();
    expect(screen.getByText(/· 起步/)).toBeInTheDocument();
  });
});

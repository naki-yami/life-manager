import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FitnessPage } from './FitnessPage';
import { ToastProvider } from '../components/ui';
import { useFitnessStore } from '../store/fitnessStore';
import { useLibraryStore } from '../store/libraryStore';
import { useBodyStore } from '../store/bodyStore';
import { addDays, formatShortDate, todayKey } from '../utils/date';

beforeEach(() => {
  useFitnessStore.setState({ plans: [], records: [] });
  useLibraryStore.setState({ customFoods: [], customExercises: [] });
  useBodyStore.setState({ records: [] });
});

/** 统计卡片的整块文本，避免多个卡片出现相同数字时选择器歧义 */
const statText = (label: string): string =>
  screen.getByText(label).closest('div.rounded-lg')?.textContent ?? '';

const addPlan = (name: string, description = ''): void => {
  useFitnessStore.getState().addPlan(name, description);
};

const addRecord = (planName: string, date: string, weight = 60): void => {
  useFitnessStore
    .getState()
    .addRecord(planName, date, [{ name: '杠铃卧推', sets: 5, reps: 5, weight }], '状态不错');
};

const addBody = (
  date: string,
  weight?: number,
  measurements: Record<string, number> = {},
): void => {
  useBodyStore.getState().saveRecord({ date, weight, measurements });
};

describe('FitnessPage', () => {
  it('计划视图空态引导新建第一个计划', async () => {
    render(<FitnessPage />);
    expect(screen.getByText('还没有训练计划')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: '新建计划' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '新建训练计划' });

    expect(within(dialog).getByRole('button', { name: '创建' })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/^计划名称/), '推日');
    await userEvent.type(within(dialog).getByLabelText(/^说明/), '胸肩三头');
    await userEvent.click(within(dialog).getByRole('button', { name: '创建' }));

    expect(useFitnessStore.getState().plans).toHaveLength(1);
    expect(useFitnessStore.getState().plans[0]!.name).toBe('推日');
    expect(screen.getByText('胸肩三头')).toBeInTheDocument();
  });

  it('新建计划弹窗里在计划名称按回车直接创建（U7 尾巴）', async () => {
    render(<FitnessPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '新建计划' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '新建训练计划' });

    await userEvent.type(within(dialog).getByLabelText(/^计划名称/), '推日{Enter}');

    expect(useFitnessStore.getState().plans[0]!.name).toBe('推日');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('记录身体数据弹窗里在体重框按回车直接保存（U7 尾巴）', async () => {
    render(<FitnessPage />);

    await userEvent.click(screen.getByRole('button', { name: /^身体指标/ }));
    await userEvent.click(screen.getAllByRole('button', { name: '记录身体数据' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '记录身体数据' });

    await userEvent.type(within(dialog).getByLabelText(/^体重/), '70.5{Enter}');

    expect(useBodyStore.getState().records[0]!.weight).toBe(70.5);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('统计卡片汇总计划、记录、本周次数与累计容量', () => {
    addPlan('推日');
    addPlan('腿日');
    addRecord('推日', todayKey(), 60);
    addRecord('腿日', '2020-01-01', 100);

    render(<FitnessPage />);

    expect(statText('训练计划数')).toContain('2');
    expect(statText('训练记录数')).toContain('2');
    expect(statText('本周训练')).toContain('1');
    expect(statText('累计容量')).toContain('4,000');
  });

  it('可以切到训练记录视图，空态引导记录', async () => {
    render(<FitnessPage />);
    await userEvent.click(screen.getByRole('button', { name: /^训练记录/ }));

    expect(screen.getByText('还没有训练记录')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: '记录训练' })[0]!);
    expect(screen.getByRole('dialog', { name: '记录训练' })).toBeInTheDocument();
  });

  it('记录训练会写入动作明细、备注与日期', async () => {
    addPlan('推日');
    render(<FitnessPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '记录训练' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '记录训练' });

    await userEvent.selectOptions(within(dialog).getByLabelText('训练计划'), '推日');
    await userEvent.type(within(dialog).getByLabelText('第 1 个动作名称'), '杠铃卧推');
    await userEvent.click(within(dialog).getByRole('button', { name: '添加动作' }));
    await userEvent.type(within(dialog).getByLabelText('第 2 个动作名称'), '绳索下压');
    const setsInput = within(dialog).getByRole('spinbutton', { name: '第 2 个动作的组数' });
    await userEvent.clear(setsInput);
    await userEvent.type(setsInput, '4');
    await userEvent.type(within(dialog).getByLabelText('备注'), '最后一组力竭');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存记录' }));

    const records = useFitnessStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]!.planName).toBe('推日');
    expect(records[0]!.date).toBe(todayKey());
    expect(records[0]!.notes).toBe('最后一组力竭');
    expect(records[0]!.exercises.map((exercise) => exercise.name)).toEqual([
      '杠铃卧推',
      '绳索下压',
    ]);
    expect(records[0]!.exercises[1]!.sets).toBe(4);
    expect(records[0]!.exercises.every((exercise) => Boolean(exercise.id))).toBe(true);
  });

  it('没有填动作名时不能保存', async () => {
    render(<FitnessPage />);
    await userEvent.click(screen.getAllByRole('button', { name: '记录训练' })[0]!);

    const dialog = screen.getByRole('dialog', { name: '记录训练' });
    expect(within(dialog).getByRole('button', { name: '保存记录' })).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText('第 1 个动作名称'), '深蹲');
    expect(within(dialog).getByRole('button', { name: '保存记录' })).toBeEnabled();
  });

  it('动作行可以添加与移除，只剩一行时不能移除', async () => {
    render(<FitnessPage />);
    await userEvent.click(screen.getAllByRole('button', { name: '记录训练' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '记录训练' });

    expect(within(dialog).getByRole('button', { name: '移除第 1 个动作' })).toBeDisabled();

    await userEvent.click(within(dialog).getByRole('button', { name: '添加动作' }));
    expect(within(dialog).getByLabelText('第 2 个动作名称')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '移除第 2 个动作' }));
    expect(within(dialog).queryByLabelText('第 2 个动作名称')).not.toBeInTheDocument();
  });

  it('计划卡片可以直接带出计划名记录训练', async () => {
    addPlan('腿日', '深蹲为主');
    render(<FitnessPage />);

    await userEvent.click(screen.getByRole('button', { name: '用它记录训练' }));
    const dialog = screen.getByRole('dialog', { name: '记录训练' });

    expect(within(dialog).getByLabelText('训练计划')).toHaveValue('腿日');
  });

  it('训练记录可以按动作名搜索，并按日期分组', async () => {
    addRecord('推日', todayKey());
    addRecord('腿日', '2020-01-01');

    render(<FitnessPage />);
    await userEvent.click(screen.getByRole('button', { name: /^训练记录/ }));

    expect(screen.getByText('推日')).toBeInTheDocument();
    expect(screen.getByText('腿日')).toBeInTheDocument();
    // 两条记录的动作行 + 「个人最佳」卡里的一行
    expect(screen.getAllByText('杠铃卧推')).toHaveLength(3);

    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), '推日');
    expect(screen.getByText('推日')).toBeInTheDocument();
    expect(screen.queryByText('腿日')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole('textbox', { name: '搜索' }));
    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), 'zzz');
    expect(screen.getByText('没有符合条件的记录')).toBeInTheDocument();
  });

  it('删除训练记录要二次确认', async () => {
    addRecord('推日', todayKey());
    render(<FitnessPage />);
    await userEvent.click(screen.getByRole('button', { name: /^训练记录/ }));

    await userEvent.click(screen.getByRole('button', { name: `删除 ${todayKey()} 的训练记录` }));
    const dialog = screen.getByRole('dialog', { name: '删除训练记录' });
    expect(within(dialog).getByText(/1 个动作/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(useFitnessStore.getState().records).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: `删除 ${todayKey()} 的训练记录` }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: '删除训练记录' })).getByRole('button', {
        name: '删除',
      }),
    );
    expect(useFitnessStore.getState().records).toHaveLength(0);
  });

  it('删除训练计划要二次确认，且不影响训练记录', async () => {
    addPlan('推日');
    addRecord('推日', todayKey());
    render(<FitnessPage />);

    await userEvent.click(screen.getByRole('button', { name: '删除计划「推日」' }));
    const dialog = screen.getByRole('dialog', { name: '删除训练计划' });
    expect(within(dialog).getByText(/已记录的训练数据不受影响/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '删除' }));
    expect(useFitnessStore.getState().plans).toHaveLength(0);
    expect(useFitnessStore.getState().records).toHaveLength(1);
  });
  it('没有训练记录时不渲染图表，避免一排空网格', () => {
    addPlan('推日');
    render(<FitnessPage />);

    expect(screen.queryByRole('img', { name: /训练频率热力图/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /每周训练容量/ })).not.toBeInTheDocument();
  });

  it('有记录时展示训练频率热力图与每周容量对比', () => {
    addRecord('推日', todayKey(), 60);
    addRecord('推日', addDays(todayKey(), -1), 100);

    render(<FitnessPage />);

    expect(
      screen.getByRole('img', {
        name: `最近 91 天训练频率热力图：91 天里有 2 天有记录，合计 2，最多的一天 1（${formatShortDate(addDays(todayKey(), -1))}）`,
      }),
    ).toBeInTheDocument();
    // 5 组 × 5 次 × (60 + 100) kg，同属当周时合并到一根柱
    expect(screen.getByText(/合计 4,000 kg/)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /最近 8 周每周训练容量：合计 4,000 kg/ }),
    ).toBeInTheDocument();
  });

  it('统计卡里带上练过多少天与近 7 天迷你趋势', () => {
    addRecord('推日', todayKey(), 60);

    render(<FitnessPage />);

    expect(statText('本周训练')).toContain('近 14 天有 1 天练过');
  });

  it('复制上次训练会带出计划与动作，日期为今天', async () => {
    addRecord('推日', '2026-09-20', 60);
    render(<FitnessPage />);

    await userEvent.click(screen.getByRole('button', { name: '复制上次训练' }));
    const dialog = screen.getByRole('dialog', { name: '记录训练' });

    expect(within(dialog).getByRole('combobox', { name: '训练计划' })).toHaveValue('推日');
    expect(within(dialog).getByLabelText('第 1 个动作名称')).toHaveValue('杠铃卧推');
    expect(within(dialog).getByLabelText('第 1 个动作的重量')).toHaveValue(60);
  });

  it('个人最佳卡按估算 1RM 列出动作', () => {
    addRecord('推日', '2026-09-20', 60);
    render(<FitnessPage />);

    expect(screen.getByText('个人最佳')).toBeInTheDocument();
    const row = screen.getByText('杠铃卧推').closest('li')!;
    expect(within(row).getByText('1RM 70 kg')).toBeInTheDocument();
  });

  it('超过历史最佳时弹出破纪录庆祝', async () => {
    addRecord('推日', '2026-09-20', 60); // 1RM 70
    render(
      <ToastProvider>
        <FitnessPage />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: '复制上次训练' }));
    const dialog = screen.getByRole('dialog', { name: '记录训练' });
    fireEvent.change(within(dialog).getByLabelText('第 1 个动作的重量'), {
      target: { value: '75' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: '保存记录' }));

    // 75×5 → 1RM 87.5 > 70，破纪录
    expect(screen.getByText(/新纪录！「杠铃卧推」/)).toBeInTheDocument();
  });

  it('训练日历点某一天只看那天的记录', async () => {
    // 一条放今天、一条放昨天：点昨天的格子只看昨天。
    // 今天是 1 号时昨天跨月，月历的补位格也带得出上月日期键，断言按相对日期写
    const otherDay = addDays(todayKey(), -1);
    addRecord('推日', todayKey(), 60);
    addRecord('腿日', otherDay, 100);
    render(<FitnessPage />);

    // 记录视图下才有日历
    await userEvent.click(screen.getByRole('button', { name: /训练记录/ }));
    expect(screen.getByText('训练日历')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: new RegExp(`${otherDay}，1 次训练`) }),
    );
    expect(screen.getByText(`只看 ${otherDay} · 清除`)).toBeInTheDocument();
    expect(screen.getByText('腿日')).toBeInTheDocument();
    expect(screen.queryByText('推日')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: `只看 ${otherDay} · 清除` }));
    expect(screen.getByText('推日')).toBeInTheDocument();
  });
  it('身体指标空态引导记录第一笔', async () => {
    render(<FitnessPage />);
    await userEvent.click(screen.getByRole('button', { name: /^身体指标/ }));

    expect(screen.getByText('还没有身体数据')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /体重趋势/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: '记录身体数据' })[0]!);
    expect(screen.getByRole('dialog', { name: '记录身体数据' })).toBeInTheDocument();
  });

  it('记录体重后统计卡、趋势图与列表一起更新', async () => {
    render(<FitnessPage />);
    await userEvent.click(screen.getByRole('button', { name: /^身体指标/ }));
    await userEvent.click(screen.getAllByRole('button', { name: '记录身体数据' })[0]!);

    const dialog = screen.getByRole('dialog', { name: '记录身体数据' });
    fireEvent.change(within(dialog).getByLabelText('体重(kg)'), { target: { value: '70.4' } });
    await userEvent.click(within(dialog).getByRole('button', { name: '保存记录' }));

    expect(useBodyStore.getState().records).toHaveLength(1);
    expect(useBodyStore.getState().records[0]).toMatchObject({ date: todayKey(), weight: 70.4 });

    expect(statText('当前体重')).toContain('70.4');
    expect(statText('较上次')).toContain('—');
    expect(
      screen.getByRole('img', {
        name: `体重趋势：共 1 次记录，最新 70.4 kg，最低 70.4 kg（${formatShortDate(todayKey())}），最高 70.4 kg（${formatShortDate(todayKey())}）`,
      }),
    ).toBeInTheDocument();
  });

  it('新增第二条体重后，「较上次」与趋势图都算出正确的差', async () => {
    addBody('2026-09-27', 71);
    render(<FitnessPage />);
    await userEvent.click(screen.getByRole('button', { name: /^身体指标/ }));
    await userEvent.click(screen.getAllByRole('button', { name: '记录身体数据' })[0]!);

    const dialog = screen.getByRole('dialog', { name: '记录身体数据' });
    fireEvent.change(within(dialog).getByLabelText('日期'), { target: { value: '2026-09-29' } });
    fireEvent.change(within(dialog).getByLabelText('体重(kg)'), { target: { value: '70.4' } });
    await userEvent.click(within(dialog).getByRole('button', { name: '保存记录' }));

    expect(statText('当前体重')).toContain('70.4');
    expect(statText('较上次')).toContain('-0.6');
    expect(statText('较上次')).toContain('上次 71 kg（2026-09-27）');
    expect(
      screen.getByRole('img', {
        name: '体重趋势：共 2 次记录，最新 70.4 kg，最低 70.4 kg（9/29），最高 71 kg（9/27）',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('较上次 -0.6 kg')).toBeInTheDocument();
  });

  it('编辑某天会带出那天的数据，保存是修正而不是新增', async () => {
    addBody('2026-09-27', 71);
    render(<FitnessPage />);
    await userEvent.click(screen.getByRole('button', { name: /^身体指标/ }));
    await userEvent.click(screen.getByRole('button', { name: '编辑 2026-09-27 的身体数据' }));

    const dialog = screen.getByRole('dialog', { name: '记录身体数据' });
    expect(within(dialog).getByLabelText('日期')).toHaveValue('2026-09-27');
    expect(within(dialog).getByLabelText('体重(kg)')).toHaveValue(71);
    expect(within(dialog).getByText('这一天已有记录，保存会更新它')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('体重(kg)'), { target: { value: '70.5' } });
    await userEvent.click(within(dialog).getByRole('button', { name: '保存记录' }));

    expect(useBodyStore.getState().records).toHaveLength(1);
    expect(useBodyStore.getState().records[0]!.weight).toBe(70.5);
  });

  it('只填围度也能保存，围度卡显示较上次的变化', async () => {
    addBody('2026-09-20', undefined, { waist: 82 });
    render(<FitnessPage />);
    await userEvent.click(screen.getByRole('button', { name: /^身体指标/ }));
    await userEvent.click(screen.getAllByRole('button', { name: '记录身体数据' })[0]!);

    const dialog = screen.getByRole('dialog', { name: '记录身体数据' });
    fireEvent.change(within(dialog).getByLabelText('日期'), { target: { value: '2026-09-29' } });
    fireEvent.change(within(dialog).getByLabelText('腰围'), { target: { value: '80.5' } });
    await userEvent.click(within(dialog).getByRole('button', { name: '保存记录' }));

    expect(useBodyStore.getState().records).toHaveLength(2);
    // 围度卡里那一格：显示最新值与相对上一次的变化
    const row = screen.getByText(/较上次 -1.5 cm/).closest('li')!;
    expect(within(row).getByText('腰围')).toBeInTheDocument();
    expect(within(row).getByText('80.5')).toBeInTheDocument();
    expect(within(row).getByText(/2026-09-20/)).toBeInTheDocument();
  });

  it('一天都没填时不能保存', async () => {
    render(<FitnessPage />);
    await userEvent.click(screen.getByRole('button', { name: /^身体指标/ }));
    await userEvent.click(screen.getAllByRole('button', { name: '记录身体数据' })[0]!);

    const dialog = screen.getByRole('dialog', { name: '记录身体数据' });
    expect(within(dialog).getByRole('button', { name: '保存记录' })).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('胸围'), { target: { value: '95' } });
    expect(within(dialog).getByRole('button', { name: '保存记录' })).toBeEnabled();
  });

  it('删除身体数据要二次确认，撤销可以恢复', async () => {
    addBody('2026-09-27', 71);
    render(
      <ToastProvider>
        <FitnessPage />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: /^身体指标/ }));
    await userEvent.click(screen.getByRole('button', { name: '删除 2026-09-27 的身体数据' }));

    const dialog = screen.getByRole('dialog', { name: '删除身体数据' });
    expect(within(dialog).getByText(/1 项都会被删掉/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '删除' }));
    expect(useBodyStore.getState().records).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(useBodyStore.getState().records).toHaveLength(1);
  });

  it('身体指标页按 n 打开的是身体数据弹窗', async () => {
    render(<FitnessPage />);
    await userEvent.click(screen.getByRole('button', { name: /^身体指标/ }));

    act(() => {
      window.dispatchEvent(new CustomEvent('lm:new-entry'));
    });

    expect(screen.getByRole('dialog', { name: '记录身体数据' })).toBeInTheDocument();
  });

  it('从动作库选择：搜索、肌群过滤、填入表单', async () => {
    render(<FitnessPage />);

    await userEvent.click(screen.getByRole('button', { name: '记录训练' }));
    const dialog = screen.getByRole('dialog', { name: '记录训练' });
    await userEvent.click(within(dialog).getByRole('button', { name: '从动作库选择' }));

    const picker = screen.getByRole('dialog', { name: '从动作库选择' });
    await userEvent.selectOptions(
      within(picker).getAllByRole('combobox', { name: '肌群' })[0]!,
      '背',
    );
    await userEvent.click(within(picker).getByRole('button', { name: '把「引体向上」填入表单' }));

    expect(within(dialog).getByLabelText('第 1 个动作名称')).toHaveValue('引体向上');
    expect(useLibraryStore.getState().customExercises).toHaveLength(0);
  });

  it('训练日模板：建计划时能填动作清单，卡片露出动作与一键开练', async () => {
    render(<FitnessPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '新建计划' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '新建训练计划' });
    await userEvent.type(within(dialog).getByLabelText(/^计划名称/), '推日');

    expect(within(dialog).getByText(/还没有动作/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '加动作' }));
    await userEvent.type(within(dialog).getByLabelText('动作 1 名称'), '杠铃卧推');
    await userEvent.click(within(dialog).getByRole('button', { name: '加动作' }));
    await userEvent.type(within(dialog).getByLabelText('动作 2 名称'), '绳索下压');
    const sets2 = within(dialog).getByRole('spinbutton', { name: '动作 2 组数' });
    await userEvent.clear(sets2);
    await userEvent.type(sets2, '4');
    await userEvent.click(within(dialog).getByRole('button', { name: '创建' }));

    const plan = useFitnessStore.getState().plans[0]!;
    expect(plan.exercises.map((exercise) => exercise.name)).toEqual(['杠铃卧推', '绳索下压']);
    expect(plan.exercises[1]!.sets).toBe(4);
    expect(plan.exercises.every((exercise) => exercise.weight === 0)).toBe(true);

    expect(screen.getByText('2 个动作')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '用模板开始训练' })).toBeInTheDocument();
  });

  it('用模板开始训练会把动作铺进表单，且不共用模板的动作 id', async () => {
    useFitnessStore
      .getState()
      .addPlan('推日', '', [{ name: '杠铃卧推', sets: 5, reps: 5, weight: 0 }]);

    render(<FitnessPage />);
    await userEvent.click(screen.getByRole('button', { name: '用模板开始训练' }));

    const dialog = screen.getByRole('dialog', { name: '记录训练' });
    expect(within(dialog).getByLabelText('训练计划')).toHaveValue('推日');
    expect(within(dialog).getByLabelText('第 1 个动作名称')).toHaveValue('杠铃卧推');
    expect(within(dialog).getByRole('spinbutton', { name: '第 1 个动作的组数' })).toHaveValue(5);

    await userEvent.click(within(dialog).getByRole('button', { name: '保存记录' }));

    const record = useFitnessStore.getState().records[0]!;
    const plan = useFitnessStore.getState().plans[0]!;
    expect(record.exercises[0]!.name).toBe('杠铃卧推');
    // 表单里的每一行都是新草稿，不该复用模板的条目 id
    expect(record.exercises[0]!.id).not.toBe(plan.exercises[0]!.id);
  });

  it('计划可以二次编辑，保存是修正而不是新建', async () => {
    useFitnessStore
      .getState()
      .addPlan('推日', '胸肩三头', [{ name: '杠铃卧推', sets: 5, reps: 5, weight: 0 }]);
    render(<FitnessPage />);

    await userEvent.click(screen.getByRole('button', { name: '编辑计划「推日」' }));
    const dialog = screen.getByRole('dialog', { name: '编辑训练计划' });

    expect(within(dialog).getByLabelText(/^计划名称/)).toHaveValue('推日');
    expect(within(dialog).getByLabelText('动作 1 名称')).toHaveValue('杠铃卧推');
    expect(within(dialog).getByRole('button', { name: '保存' })).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/^计划名称/), '（改）');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(useFitnessStore.getState().plans).toHaveLength(1);
    expect(useFitnessStore.getState().plans[0]!.name).toBe('推日（改）');
  });

  it('把一次训练存成模板：重量不带过来', async () => {
    addRecord('推日', todayKey(), 60);
    render(<FitnessPage />);
    await userEvent.click(screen.getByRole('button', { name: /^训练记录/ }));

    await userEvent.click(screen.getByRole('button', { name: `把 ${todayKey()} 的训练存成模板` }));
    const dialog = screen.getByRole('dialog', { name: '存成训练日模板' });

    expect(within(dialog).getByText(/重量不会带过来/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '创建' }));

    const plan = useFitnessStore.getState().plans[0]!;
    expect(plan.name).toBe('推日');
    expect(plan.exercises.map((exercise) => exercise.name)).toEqual(['杠铃卧推']);
    // 60kg 是那天的状态，不是模板的一部分
    expect(plan.exercises[0]!.weight).toBe(0);
  });

  it('库里没有的动作可以存为自建，并立刻能选', async () => {
    render(<FitnessPage />);

    await userEvent.click(screen.getByRole('button', { name: '记录训练' }));
    const dialog = screen.getByRole('dialog', { name: '记录训练' });
    await userEvent.click(within(dialog).getByRole('button', { name: '从动作库选择' }));

    const picker = screen.getByRole('dialog', { name: '从动作库选择' });
    await userEvent.type(within(picker).getByLabelText('名称'), '壶铃土耳其起立');
    await userEvent.click(within(picker).getByRole('button', { name: '存入动作库' }));

    expect(useLibraryStore.getState().customExercises[0]!.name).toBe('壶铃土耳其起立');
    expect(within(picker).getByText('壶铃土耳其起立')).toBeInTheDocument();
    expect(within(picker).getByText('自建')).toBeInTheDocument();

    await userEvent.click(
      within(picker).getByRole('button', { name: '删除自建动作「壶铃土耳其起立」' }),
    );
    expect(useLibraryStore.getState().customExercises).toHaveLength(0);
  });
});

/*
 * 视图切换器原来在工具条里 —— 而工具条在两屏内容之后，切个视图要先滚回顶部。
 * 现在它在页头，和「记录训练」这些主操作待在一起。这条盯着它别再掉回去。
 */
describe('FitnessPage 视图切换器在页头', () => {
  it('切换器落在 header 里，切换照常生效', async () => {
    render(
      <ToastProvider>
        <FitnessPage />
      </ToastProvider>,
    );

    const switcher = screen.getByRole('group', { name: '切换健身视图' });
    const header = document.querySelector('header');
    expect(header).not.toBeNull();
    expect(header!.contains(switcher)).toBe(true);

    await userEvent.click(within(switcher).getByRole('button', { name: /身体指标/ }));
    expect(within(switcher).getByRole('button', { name: /身体指标/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

/*
 * 流水就地编辑：以前写错重量只能整条删了重录（一次训练好几个动作）。
 * 现在记录行上有「改」，走同一个弹窗 —— 但**不触发破纪录提示**，
 * 那套是给「新练了一次」用的，改个写错的数字不该弹「🎉 新纪录」。
 */
describe('FitnessPage 改一次训练', () => {
  it('点「改」带出原值，保存后更新原记录且不弹破纪录提示', async () => {
    render(
      <ToastProvider>
        <FitnessPage />
      </ToastProvider>,
    );
    addRecord('推日', todayKey(), 60);
    await userEvent.click(screen.getByRole('button', { name: /^训练记录/ }));

    await userEvent.click(screen.getByRole('button', { name: /改 .* 的训练记录/ }));

    const dialog = screen.getByRole('dialog', { name: '改这次训练' });
    expect(within(dialog).getByDisplayValue('推日')).toBeInTheDocument();

    // 把重量从 60 抬到 100 —— 会超过历史最佳，但改记录不该报「新纪录」
    const weightBox = within(dialog).getByLabelText('第 1 个动作的重量');
    await userEvent.clear(weightBox);
    await userEvent.type(weightBox, '100');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存记录' }));

    const records = useFitnessStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]!.exercises[0]!.weight).toBe(100);
    expect(screen.queryByText(/新纪录/)).not.toBeInTheDocument();
  });
});

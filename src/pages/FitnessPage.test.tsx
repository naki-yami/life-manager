import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FitnessPage } from './FitnessPage';
import { ToastProvider } from '../components/ui';
import { useFitnessStore } from '../store/fitnessStore';
import { addDays, todayKey } from '../utils/date';

beforeEach(() => {
  useFitnessStore.setState({ plans: [], records: [] });
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
      screen.getByRole('img', { name: '最近 91 天训练频率热力图：91 天里有 2 天有记录，合计 2' }),
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
});

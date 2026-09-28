import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FitnessPage } from './FitnessPage';
import { useFitnessStore } from '../store/fitnessStore';
import { todayKey } from '../utils/date';

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
    expect(screen.getAllByText('杠铃卧推')).toHaveLength(2);

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
});

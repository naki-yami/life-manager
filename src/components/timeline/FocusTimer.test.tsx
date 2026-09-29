import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusTimer, type FocusOption } from './FocusTimer';
import type { ActiveFocus } from '../../types';

const OPTIONS: FocusOption[] = [
  { key: 'task:t1', title: '写周报', target: 'task', entityId: 't1', group: '任务' },
  { key: 'book:b1', title: '人类简史', target: 'book', entityId: 'b1', group: '书籍' },
];

const activeFocus = (over: Partial<ActiveFocus> = {}): ActiveFocus => ({
  entityId: 'b1',
  title: '人类简史',
  target: 'book',
  mode: 'pomodoro',
  plannedMinutes: 25,
  startedAt: new Date().toISOString(),
  ...over,
});

type Props = React.ComponentProps<typeof FocusTimer>;

const setup = (over: Partial<Props> = {}) => {
  const onStart = vi.fn();
  const onFinish = vi.fn();
  const onCancel = vi.fn();
  render(
    <FocusTimer
      active={null}
      options={OPTIONS}
      onStart={onStart}
      onFinish={onFinish}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { onStart, onFinish, onCancel };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('FocusTimer', () => {
  it('没选对象时不能开始', () => {
    setup();

    expect(screen.getByRole('button', { name: '开始专注' })).toBeDisabled();
  });

  it('选了对象就能开始，把对象、计时方式与计划时长一起回传', async () => {
    const { onStart } = setup();

    await userEvent.selectOptions(screen.getByLabelText('专注对象'), 'book:b1');
    await userEvent.selectOptions(screen.getByLabelText('计划时长'), '45');
    await userEvent.click(screen.getByRole('button', { name: '开始专注' }));

    expect(onStart).toHaveBeenCalledWith({
      entityId: 'b1',
      title: '人类简史',
      target: 'book',
      mode: 'pomodoro',
      plannedMinutes: 45,
    });
  });

  it('切到正计时就不再问计划时长', async () => {
    setup();
    expect(screen.getByLabelText('计划时长')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '正计时' }));

    expect(screen.queryByLabelText('计划时长')).not.toBeInTheDocument();
  });

  it('没有可专注的对象时下拉不可用，并说明原因', () => {
    setup({ options: [] });

    expect(screen.getByLabelText('专注对象')).toBeDisabled();
    expect(screen.getByRole('button', { name: '开始专注' })).toBeDisabled();
  });

  it('番茄钟显示剩余时间，结束与放弃各走各的回调', async () => {
    const { onFinish, onCancel } = setup({ active: activeFocus() });

    expect(screen.getByText('番茄钟 · 正在专注')).toBeInTheDocument();
    expect(screen.getByText('人类简史')).toBeInTheDocument();
    expect(screen.getByText('剩余')).toBeInTheDocument();
    expect(screen.getByText('25:00')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '放弃' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '结束并记录' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('正计时显示已经过去的时长', () => {
    const startedAt = new Date(Date.now() - 90_000).toISOString();
    setup({
      active: activeFocus({ target: 'task', mode: 'stopwatch', title: '写周报', startedAt }),
    });

    expect(screen.getByText('正计时 · 正在专注')).toBeInTheDocument();
    expect(screen.getByText('已专注')).toBeInTheDocument();
    expect(screen.getByText('01:30')).toBeInTheDocument();
  });

  it('番茄钟到点会自动结束，且只写一次记录', async () => {
    vi.useFakeTimers();
    const startedAt = new Date(2026, 8, 29, 9, 0, 0);
    vi.setSystemTime(startedAt);

    const onFinish = vi.fn();
    render(
      <FocusTimer
        active={activeFocus({ startedAt: startedAt.toISOString() })}
        options={OPTIONS}
        onStart={vi.fn()}
        onFinish={onFinish}
        onCancel={vi.fn()}
      />,
    );

    expect(onFinish).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25 * 60 * 1000);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);

    // 到点之后秒表还在跳，但不该再写第二条
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 1000);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

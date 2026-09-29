import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DayTimeline, type TimelineEntry } from './DayTimeline';

const entry = (over: Partial<TimelineEntry> = {}): TimelineEntry => ({
  id: 't1',
  title: '写周报',
  start: '09:00',
  minutes: 60,
  done: false,
  ...over,
});

type Props = React.ComponentProps<typeof DayTimeline>;

const setup = (over: Partial<Props> = {}) => {
  const onSchedule = vi.fn();
  const onResize = vi.fn();
  const onRemove = vi.fn();
  const onFocus = vi.fn();
  render(
    <DayTimeline
      label="2026-09-29 的时间轴"
      entries={[entry()]}
      candidates={[{ id: 't2', title: '买牛奶' }]}
      onSchedule={onSchedule}
      onResize={onResize}
      onRemove={onRemove}
      onFocus={onFocus}
      {...over}
    />,
  );
  return { onSchedule, onResize, onRemove, onFocus };
};

const slotList = (): HTMLElement =>
  screen.getByRole('list', { name: '2026-09-29 的时间轴的时间格' });

describe('DayTimeline', () => {
  it('画出 06:00–24:00 的刻度，并标出已排任务的区间', () => {
    setup();

    expect(screen.getByRole('group', { name: '2026-09-29 的时间轴' })).toBeInTheDocument();
    expect(screen.getByText('写周报')).toBeInTheDocument();
    expect(screen.getByText('09:00–10:00')).toBeInTheDocument();
    expect(screen.getByText('待排（1）')).toBeInTheDocument();
  });

  it('刻度只写整点，半小时留白', () => {
    setup();

    // 一格 30 分钟：06:00–24:00 共 36 格
    expect(slotList().children).toHaveLength(36);

    const ruler = slotList().parentElement!.previousElementSibling as HTMLElement;
    expect(within(ruler).getByText('06:00')).toBeInTheDocument();
    expect(within(ruler).getByText('22:00')).toBeInTheDocument();
    expect(within(ruler).queryByText('06:30')).not.toBeInTheDocument();
  });

  it('盒子上的按钮分别走提前、推迟、改时长、撤下与开始专注', async () => {
    const { onSchedule, onResize, onRemove, onFocus } = setup();

    await userEvent.click(screen.getByRole('button', { name: '把「写周报」提前 30 分钟' }));
    expect(onSchedule).toHaveBeenCalledWith('t1', '08:30');

    await userEvent.click(screen.getByRole('button', { name: '把「写周报」推迟 30 分钟' }));
    expect(onSchedule).toHaveBeenCalledWith('t1', '09:30');

    await userEvent.click(screen.getByRole('button', { name: '把「写周报」加长 15 分钟' }));
    expect(onResize).toHaveBeenCalledWith('t1', 75);

    await userEvent.click(screen.getByRole('button', { name: '把「写周报」缩短 15 分钟' }));
    expect(onResize).toHaveBeenCalledWith('t1', 45);

    await userEvent.click(screen.getByRole('button', { name: '开始专注：写周报' }));
    expect(onFocus).toHaveBeenCalledWith('t1');

    await userEvent.click(screen.getByRole('button', { name: '把「写周报」撤下时间轴' }));
    expect(onRemove).toHaveBeenCalledWith('t1');
  });

  it('已经是最短时长时不能再缩短', () => {
    setup({ entries: [entry({ minutes: 15 })] });

    expect(screen.getByText('09:00–09:15')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '把「写周报」缩短 15 分钟' })).toBeDisabled();
  });

  it('「排到…」下拉把待排任务钉到某个时间点', () => {
    const { onSchedule } = setup();

    fireEvent.change(screen.getByLabelText('把「买牛奶」排到'), { target: { value: '14:00' } });

    expect(onSchedule).toHaveBeenCalledWith('t2', '14:00');
  });

  it('没有待排任务时给出说明，而不是一个空列表', () => {
    setup({ candidates: [] });

    expect(screen.getByText('待排（0）')).toBeInTheDocument();
    expect(screen.getByText('今天该排的都排上了。')).toBeInTheDocument();
  });

  it('正在专注的任务会被高亮', () => {
    setup({ activeId: 't1' });

    const box = screen.getByText('写周报').closest('li')!.firstElementChild as HTMLElement;
    expect(box.className).toContain('border-accent');
  });

  it('已完成的任务会被划掉', () => {
    setup({ entries: [entry({ done: true })] });

    expect(screen.getByText('写周报').className).toContain('line-through');
  });
});

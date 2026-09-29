import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MonthCalendar } from './MonthCalendar';

describe('MonthCalendar', () => {
  it('渲染月历网格，有记录的日子带说明', () => {
    render(
      <MonthCalendar
        initialMonth="2026-09"
        label="测试日历"
        marks={{
          '2026-09-15': { count: 2, label: '2 次训练' },
        }}
      />,
    );

    expect(screen.getByText('2026 年 9 月')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2026-09-15，2 次训练/ })).toBeInTheDocument();
    // 没有记录的日子不带标记说明
    expect(screen.getByRole('button', { name: /^2026-09-16$/ })).toBeInTheDocument();
  });

  it('点某一天会把日期键回传给 onSelect', async () => {
    const onSelect = vi.fn();
    render(<MonthCalendar initialMonth="2026-09" label="测试日历" onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /^2026-09-28/ }));
    expect(onSelect).toHaveBeenCalledWith('2026-09-28');
  });

  it('可以切换上一个月与下一个月', async () => {
    render(<MonthCalendar initialMonth="2026-09" label="测试日历" />);
    expect(screen.getByText('2026 年 9 月')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '上一月' }));
    expect(screen.getByText('2026 年 8 月')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '下一月' }));
    await userEvent.click(screen.getByRole('button', { name: '下一月' }));
    expect(screen.getByText('2026 年 10 月')).toBeInTheDocument();
  });
});

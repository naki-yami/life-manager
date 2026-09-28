import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart, Heatmap, Sparkline } from './index';
import { dayRange, weekdayIndex } from '../../utils/stats';

describe('Sparkline', () => {
  it('数据不足两个点时退化成底色条，并在描述里说明', () => {
    render(<Sparkline data={[3]} label="每日趋势" />);

    expect(screen.getByRole('img', { name: '每日趋势（数据不足）' })).toBeInTheDocument();
  });

  it('有数据时画出折线与面积，并按 tone 上色', () => {
    const { container } = render(<Sparkline data={[1, 5, 2, 0]} label="每日趋势" tone="danger" />);

    expect(screen.getByRole('img', { name: '每日趋势' })).toBeInTheDocument();
    expect(container.querySelector('polyline')?.getAttribute('class')).toContain('stroke-danger');
    expect(container.querySelector('polygon')?.getAttribute('class')).toContain('fill-danger');
  });
});

describe('BarChart', () => {
  it('没有数据时退回提示态', () => {
    render(<BarChart data={[]} label="每日热量" />);

    expect(screen.getByRole('img', { name: '每日热量（暂无数据）' })).toBeInTheDocument();
  });

  it('按最大值定高度，并把每天的数据写进读屏明细', () => {
    const data = [
      { date: '2026-01-06', value: 0 },
      { date: '2026-01-07', value: 2 },
      { date: '2026-01-08', value: 4 },
    ];
    const { container } = render(
      <BarChart data={data} label="每日完成任务数" formatValue={(value) => `${value} 个`} />,
    );

    expect(
      screen.getByRole('img', { name: '每日完成任务数：合计 6 个，单日最高 4 个' }),
    ).toBeInTheDocument();
    expect(screen.getByText('合计 6 个')).toBeInTheDocument();

    const bars = container.querySelectorAll('[role="img"] span[title]');
    expect(bars).toHaveLength(3);
    expect((bars[2] as HTMLElement).style.height).toBe('100%');
    expect((bars[1] as HTMLElement).style.height).toBe('50%');
    // 0 值只留一条细线，避免看起来像有数据
    expect((bars[0] as HTMLElement).style.height).toBe('2px');

    const items = container.querySelectorAll('figcaption li');
    expect(items).toHaveLength(3);
    expect(items[2]).toHaveTextContent('2026-01-08：4 个');
  });
});

describe('Heatmap', () => {
  it('按星期补齐空格子，网格始终是整周', () => {
    const data = dayRange('2026-01-10', 5).map((date) => ({ date, value: 1 }));
    render(<Heatmap data={data} label="活动热力图" />);

    const grid = screen.getByRole('img', { name: '活动热力图：5 天里有 5 天有记录，合计 5' });
    const offset = weekdayIndex(data[0]!.date);
    expect(grid.children).toHaveLength(Math.ceil((offset + data.length) / 7) * 7);
    expect(grid.children).toHaveLength(7);
    for (let i = 0; i < offset; i += 1) {
      expect((grid.children[i] as HTMLElement).getAttribute('title')).toBeNull();
    }
    expect(grid.querySelectorAll('span[title]')).toHaveLength(data.length);
  });

  it('按区间最大值分档上色，并在图例里给出少到多', () => {
    const data = [
      { date: '2026-01-05', value: 0 },
      { date: '2026-01-06', value: 1 },
      { date: '2026-01-07', value: 4 },
    ];
    render(<Heatmap data={data} label="活动热力图" />);

    expect(screen.getByTitle('2026-01-05 · 0').className).toContain('bg-heat-0');
    expect(screen.getByTitle('2026-01-06 · 1').className).toContain('bg-heat-1');
    expect(screen.getByTitle('2026-01-07 · 4').className).toContain('bg-heat-4');
    expect(screen.getByText('少')).toBeInTheDocument();
    expect(screen.getByText('多')).toBeInTheDocument();
  });

  it('没有数据时不渲染格子', () => {
    render(<Heatmap data={[]} label="活动热力图" />);

    const grid = screen.getByRole('img', { name: '活动热力图：0 天里有 0 天有记录，合计 0' });
    expect(grid.children).toHaveLength(0);
  });
});

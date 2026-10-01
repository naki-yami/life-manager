import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BarChart, ChartEmpty, Heatmap, LineChart, Sparkline, StackedBar } from './index';
import { seriesAt } from './tones';
import { extremeWithDate, hasChartSignal, peakWithDate, troughWithDate } from './digest';
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

  it('折线四个方向都留白，不贴边被裁', () => {
    const { container } = render(<Sparkline data={[0, 10, 4]} label="每日趋势" />);

    const pairs = (container.querySelector('polyline')?.getAttribute('points') ?? '')
      .split(' ')
      .map((pair) => pair.split(',').map(Number) as [number, number]);

    expect(pairs).toHaveLength(3);
    expect(Math.min(...pairs.map(([x]) => x))).toBeGreaterThan(0);
    expect(Math.max(...pairs.map(([x]) => x))).toBeLessThan(100);
    expect(Math.min(...pairs.map(([, y]) => y))).toBeGreaterThan(0);
    expect(Math.max(...pairs.map(([, y]) => y))).toBeLessThan(100);
  });

  it('末端点一个圆点，落在最后一个点的位置上', () => {
    const { container } = render(<Sparkline data={[0, 10, 4]} label="每日趋势" />);

    // 最后一个点是 4（区间 0..10 里的 40%），归位后落在纵向下沿往上 58% 处
    const dot = container.querySelector<HTMLElement>('span[aria-hidden]');
    expect(dot?.style.left).toBe('98%');
    expect(dot?.style.top).toBe('58%');
  });
});

describe('ChartEmpty', () => {
  it('空图不只是一块灰底，还写明为什么空', () => {
    render(<ChartEmpty label="每日热量" height={120} />);

    const box = screen.getByRole('img', { name: '每日热量（暂无数据）' });
    expect(box).toHaveTextContent('暂无数据');
  });

  it('后缀可以换，读屏描述跟着换', () => {
    render(<ChartEmpty label="每日趋势" height={32} suffix="数据不足" />);

    expect(screen.getByRole('img', { name: '每日趋势（数据不足）' })).toHaveTextContent('数据不足');
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
      screen.getByRole('img', { name: '每日完成任务数：合计 6 个，单日最高 4 个（1/8）' }),
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

  it('每天都有一个看得见的柱槽，空的那几天也数得出来', () => {
    const data = [
      { date: '2026-01-06', value: 0 },
      { date: '2026-01-07', value: 3 },
    ];
    const { container } = render(<BarChart data={data} label="每日完成任务数" />);

    const tracks = container.querySelectorAll('[role="img"] > span');
    expect(tracks).toHaveLength(2);
    // 空桶自己的柱子只留一条细线，但柱槽得看得见 ——
    // 否则稀疏的图看起来就像凭空浮着一个色块，读不出总共有几个桶
    expect(tracks[0]).toHaveClass('bg-heat-0');
    expect(tracks[0]?.querySelector('span')?.style.height).toBe('2px');
    expect(tracks[1]?.querySelector('span')?.style.height).toBe('100%');
  });

  it('桶少的时候柱子不会被拉成色块，柱槽等宽铺开', () => {
    const data = [
      { date: '2026-01-06', value: 1 },
      { date: '2026-01-07', value: 2 },
    ];
    const { container } = render(<BarChart data={data} label="每周完成任务数" />);

    expect(container.querySelector('[role="img"]')).toHaveClass('justify-between');
    const tracks = container.querySelectorAll('[role="img"] > span');
    expect(tracks).toHaveLength(2);
    tracks.forEach((track) => expect(track).toHaveClass('max-w-16'));
  });

  it('序列全为 0 时，描述里的最高值也是 0，不许拿缩放下限凑数', () => {
    // 回归：早先 BarChart 把 Math.max(1, ...values) 既当缩放下限又当峰值，
    // 空活动的一周会被读成「合计 0 个，单日最高 1 个」，自相矛盾。
    const data = [
      { date: '2026-01-06', value: 0 },
      { date: '2026-01-07', value: 0 },
      { date: '2026-01-08', value: 0 },
    ];
    render(<BarChart data={data} label="每日完成任务数" formatValue={(value) => `${value} 个`} />);

    expect(
      screen.getByRole('img', { name: '每日完成任务数：合计 0 个，单日最高 0 个' }),
    ).toBeInTheDocument();
  });

  it('按周聚合时描述改口说「单周最高」，不再假装是单日', () => {
    const data = [
      { date: '2026-09-07', value: 2 },
      { date: '2026-09-14', value: 5 },
    ];
    render(<BarChart data={data} label="每周完成任务数" bucket="week" />);

    expect(
      screen.getByRole('img', { name: '每周完成任务数：合计 7，单周最高 5（9/14）' }),
    ).toBeInTheDocument();
  });
});

describe('LineChart', () => {
  it('没有数据时退回提示态', () => {
    render(<LineChart data={[]} label="体重趋势" />);

    expect(screen.getByRole('img', { name: '体重趋势（暂无数据）' })).toBeInTheDocument();
  });

  it('按区间上下沿自适应，而不是把 0 当基线', () => {
    const data = [
      { date: '2026-09-01', value: 70 },
      { date: '2026-09-02', value: 68 },
    ];
    const { container } = render(
      <LineChart data={data} label="体重趋势" formatValue={(value) => `${value} kg`} />,
    );

    expect(
      screen.getByRole('img', {
        name: '体重趋势：共 2 次记录，最新 68 kg，最低 68 kg（9/2），最高 70 kg（9/1）',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('最低 68 kg · 最高 70 kg')).toBeInTheDocument();
    // 70kg 画在 8%、68kg 画在 92% —— 若按 0 基线，两点都会贴顶
    expect(container.querySelector('polyline')?.getAttribute('points')).toBe(
      '0.00,8.00 100.00,92.00',
    );
    expect(container.querySelector('polyline')?.getAttribute('class')).toContain('stroke-accent');
    expect(container.querySelectorAll('line')).toHaveLength(2);
  });

  it('数值完全相同时画水平线，也不画高低参考线', () => {
    const data = [
      { date: '2026-09-01', value: 70 },
      { date: '2026-09-02', value: 70 },
    ];
    const { container } = render(<LineChart data={data} label="体重趋势" />);

    expect(container.querySelector('polyline')?.getAttribute('points')).toBe(
      '0.00,50.00 100.00,50.00',
    );
    expect(container.querySelectorAll('line')).toHaveLength(0);
  });

  it('每个点都有悬停明细，读屏明细逐条列出', () => {
    const data = [
      { date: '2026-09-01', value: 70 },
      { date: '2026-09-03', value: 69 },
    ];
    const { container } = render(
      <LineChart
        data={data}
        label="体重趋势"
        tone="success"
        formatValue={(value) => `${value} kg`}
      />,
    );

    const titles = [...container.querySelectorAll('rect title')].map((node) => node.textContent);
    expect(titles).toEqual(['2026-09-01 · 70 kg', '2026-09-03 · 69 kg']);

    const items = container.querySelectorAll('figcaption li');
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent('2026-09-03：69 kg');
  });

  it('按周 / 按月聚合时改口说「周 / 个月」，不把聚合点念成「次记录」', () => {
    const data = [
      { date: '2026-09-21', value: 2.5 },
      { date: '2026-09-28', value: 3.5 },
    ];
    const { unmount } = render(
      <LineChart data={data} label="心情趋势" bucket="week" formatValue={(v) => `${v} 分`} />,
    );

    expect(
      screen.getByRole('img', {
        name: '心情趋势：共 2 周，最新 3.5 分，最低 2.5 分（9/21），最高 3.5 分（9/28）',
      }),
    ).toBeInTheDocument();
    unmount();

    render(
      <LineChart
        data={[{ date: '2026-09-01', value: 3.5 }]}
        label="心情趋势"
        bucket="month"
        formatValue={(v) => `${v} 分`}
      />,
    );
    expect(
      screen.getByRole('img', {
        name: '心情趋势：共 1 个月，最新 3.5 分，最低 3.5 分（9/1），最高 3.5 分（9/1）',
      }),
    ).toBeInTheDocument();
  });

  it('只有一个点时画在中间，不除以零', () => {
    const { container } = render(
      <LineChart data={[{ date: '2026-09-01', value: 70 }]} label="体重趋势" />,
    );

    expect(container.querySelector('polyline')?.getAttribute('points')).toBe('50.00,50.00');
  });
});

describe('Heatmap', () => {
  it('按星期补齐空格子，网格始终是整周', () => {
    const data = dayRange('2026-01-10', 5).map((date) => ({ date, value: 1 }));
    render(<Heatmap data={data} label="活动热力图" />);

    const grid = screen.getByRole('img', {
      name: '活动热力图：5 天里有 5 天有记录，合计 5，最多的一天 1（1/6）',
    });
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

describe('图表键盘读点', () => {
  const data = [
    { date: '2026-01-06', value: 0 },
    { date: '2026-01-07', value: 2 },
    { date: '2026-01-08', value: 4 },
  ];

  it('柱状图聚焦后落在最后一天，左右键 / Home / End 都能移动', async () => {
    render(
      <BarChart
        data={data}
        label="每日完成任务数"
        formatValue={(value) => `${value} 个`}
        formatDate={(key) => key}
      />,
    );

    await userEvent.tab();
    expect(screen.getByRole('img', { name: /每日完成任务数/ })).toHaveFocus();
    expect(screen.getByText('2026-01-08 · 4 个')).toBeInTheDocument();

    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByText('2026-01-07 · 2 个')).toBeInTheDocument();

    await userEvent.keyboard('{Home}');
    expect(screen.getByText('2026-01-06 · 0 个')).toBeInTheDocument();

    await userEvent.keyboard('{End}{ArrowRight}');
    expect(screen.getByText('2026-01-08 · 4 个')).toBeInTheDocument();
  });

  it('Esc 清掉光标，说明行回到合计', async () => {
    render(<BarChart data={data} label="每日完成任务数" formatValue={(value) => `${value} 个`} />);

    await userEvent.tab();
    await userEvent.keyboard('{Escape}');

    expect(screen.getByText('合计 6 个')).toBeInTheDocument();
  });

  it('折线图读点时多画一条竖线，说明行换成那一天的数值', async () => {
    const { container } = render(
      <LineChart
        data={[
          { date: '2026-09-01', value: 70 },
          { date: '2026-09-03', value: 69 },
        ]}
        label="体重趋势"
        formatValue={(value) => `${value} kg`}
        // 说明行用短日期，和 SVG 里 <title> 的长日期区分开，避免断言命中两处
        formatDate={(key) => key.slice(5)}
      />,
    );
    expect(container.querySelectorAll('line')).toHaveLength(2);

    await userEvent.tab();

    expect(screen.getByText('09-03 · 69 kg')).toBeInTheDocument();
    expect(container.querySelectorAll('line')).toHaveLength(3);
  });

  it('空数据时容器不可聚焦，也不会有读点', async () => {
    render(<BarChart data={[]} label="每日热量" />);

    await userEvent.tab();

    expect(screen.getByRole('img', { name: '每日热量（暂无数据）' })).not.toHaveFocus();
  });
});

describe('StackedBar', () => {
  const dates = ['2026-01-06', '2026-01-07'];
  const series = [
    { name: '任务', values: [1, 2] },
    { name: '训练', values: [0, 1] },
  ];

  it('没有数据时退回提示态', () => {
    render(<StackedBar dates={[]} series={[]} label="活动构成" />);

    expect(screen.getByRole('img', { name: '活动构成（暂无数据）' })).toBeInTheDocument();
  });

  it('按各序列占比分高度，图例与读屏明细都对得上', () => {
    const { container } = render(
      <StackedBar dates={dates} series={series} label="活动构成" formatDate={(key) => key} />,
    );

    expect(
      screen.getByRole('img', { name: '活动构成：合计 4，最高一天 3（2026-01-07）' }),
    ).toBeInTheDocument();
    const columns = container.querySelectorAll('[role="img"] > div');
    expect(columns).toHaveLength(2);
    // 第一天只有任务 1（占 1/3），第二天任务 2 + 训练 1（占满）
    expect(container.querySelectorAll('[role="img"] > div > span')).toHaveLength(3);
    expect(screen.getByText('任务')).toBeInTheDocument();
    expect(screen.getByText('训练')).toBeInTheDocument();
    expect(screen.getByText('合计 4')).toBeInTheDocument();

    const items = container.querySelectorAll('figcaption li');
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent('2026-01-07：任务 2，训练 1，合计 3');
  });

  it('没有活动的那些天也留一个柱槽，读得出总共有几天', () => {
    const { container } = render(
      <StackedBar
        dates={['2026-01-06', '2026-01-07']}
        series={[{ name: '任务', values: [0, 2] }]}
        label="活动构成"
      />,
    );

    const columns = container.querySelectorAll('[role="img"] > div');
    expect(columns[0]).toHaveClass('bg-heat-0');
    expect(columns[0]?.querySelector('span')?.className).toContain('bg-inset');
  });

  it('键盘读点显示当天各序列的值', async () => {
    render(<StackedBar dates={dates} series={series} label="活动构成" formatDate={(key) => key} />);

    await userEvent.tab();

    expect(screen.getByText('2026-01-07 · 任务 2 · 训练 1')).toBeInTheDocument();
  });

  it('序列色按声明顺序取，超过 8 条从头轮转', () => {
    render(
      <StackedBar
        dates={['2026-01-06']}
        series={[
          { name: 'A', values: [1] },
          { name: 'B', values: [1] },
          { name: 'C', values: [1] },
        ]}
        label="三条序列"
      />,
    );

    const dotOf = (name: string): Element | null => screen.getByText(name).querySelector('span');
    expect(dotOf('A')).toHaveClass('bg-chart-1');
    expect(dotOf('B')).toHaveClass('bg-chart-2');
    expect(dotOf('C')).toHaveClass('bg-chart-3');
    expect(seriesAt(8)).toBe(1);
    expect(seriesAt(9)).toBe(2);
  });

  it('按月聚合时堆叠柱改口说「最高一月」', () => {
    render(
      <StackedBar
        dates={['2026-08-01', '2026-09-01']}
        series={[{ name: '任务', values: [1, 3] }]}
        label="活动构成"
        bucket="month"
      />,
    );

    expect(
      screen.getByRole('img', { name: '活动构成：合计 4，最高一月 3（9/1）' }),
    ).toBeInTheDocument();
  });

  it('每一天都是 0 时，「最高一天」报 0，而不是缩放用的 1', () => {
    render(
      <StackedBar
        dates={['2026-01-06', '2026-01-07']}
        series={[
          { name: '任务', values: [0, 0] },
          { name: '训练', values: [0, 0] },
        ]}
        label="活动构成"
      />,
    );

    expect(screen.getByRole('img', { name: '活动构成：合计 0，最高一天 0' })).toBeInTheDocument();
  });
});

describe('图表摘要（U8）', () => {
  it('峰值带上落在哪一天，读屏用户不用自己比对明细', () => {
    const data = [
      { date: '2026-03-10', value: 2 },
      { date: '2026-03-12', value: 5 },
      { date: '2026-03-14', value: 1 },
    ];

    expect(peakWithDate(data, (value) => `${value} 次`)).toBe('5 次（3/12）');
    expect(troughWithDate(data, (value) => `${value} 次`)).toBe('1 次（3/14）');
  });

  it('整段没有信号时不报日期 —— 没有「最高的那一天」这件事', () => {
    const blank = [
      { date: '2026-03-10', value: 0 },
      { date: '2026-03-11', value: 0 },
    ];

    expect(hasChartSignal(blank)).toBe(false);
    expect(peakWithDate(blank, (value) => `${value} 次`)).toBe('0 次');
  });

  it('段里混着真实的 0 时照样报日期 —— 那个 0 是记录，不是空白', () => {
    const data = [
      { date: '2026-03-10', value: 0 },
      { date: '2026-03-11', value: 3 },
    ];

    expect(hasChartSignal(data)).toBe(true);
    expect(troughWithDate(data, (value) => `${value} 次`)).toBe('0 次（3/10）');
  });

  it('并列最大时取最早的那一天，结果稳定不随数据顺序漂移', () => {
    const data = [
      { date: '2026-03-11', value: 4 },
      { date: '2026-03-12', value: 4 },
    ];

    expect(peakWithDate(data, (value) => String(value))).toBe('4（3/11）');
  });

  it('空序列退回数值本身，调用方不用先判长度', () => {
    expect(extremeWithDate([], 'max', (value) => `${value} 次`)).toBe('0 次');
  });
});

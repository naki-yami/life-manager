import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { JournalPage } from './JournalPage';
import { ToastProvider } from '../components/ui';
import { MASTER_DETAIL_QUERY } from '../components/layout';
import { useJournalStore } from '../store/journalStore';
import { useHabitStore } from '../store/habitStore';
import { mockMediaQueries } from '../test/matchMedia';
import { addDays, formatDayLabel, todayKey } from '../utils/date';
import type { JournalEntry } from '../types';

const TODAY = todayKey();
const YESTERDAY = addDays(TODAY, -1);
const store = () => useJournalStore.getState();

const entry = (patch: Partial<JournalEntry> & { date: string }): JournalEntry => ({
  id: `id-${patch.date}`,
  mood: 0,
  tags: [],
  text: '',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...patch,
});

const renderPage = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/growth/journal']}>
      <ToastProvider>
        <JournalPage />
      </ToastProvider>
    </MemoryRouter>,
  );

/** 宽屏：右侧编辑器是并排的一栏，不用点开抽屉就能断言 */
const wide = (): void => mockMediaQueries({ [MASTER_DETAIL_QUERY]: true });

beforeEach(() => {
  localStorage.clear();
  useJournalStore.setState({ entries: [] });
  useHabitStore.setState({ habits: [] });
});

describe('JournalPage 概览', () => {
  it('一篇都没有时给出空态与引导文案，而不是空白页', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /日记与心情/ })).toBeInTheDocument();
    expect(screen.getByText('还没有写过日记')).toBeInTheDocument();
    expect(screen.getByText('还没有记过心情')).toBeInTheDocument();
  });

  it('标题汇总篇数与平均分，列表按日期倒序', () => {
    useJournalStore.setState({
      entries: [
        entry({ date: YESTERDAY, mood: 2, text: '昨天那句' }),
        entry({ date: TODAY, mood: 4, text: '今天那句', tags: ['工作'] }),
      ],
    });
    renderPage();

    expect(screen.getByText('写过的 2 篇里，有 2 篇记了心情 · 平均 3 分')).toBeInTheDocument();

    const rows = screen.getAllByRole('button', { name: /那句/ });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAccessibleName(/今天那句/);
    expect(rows[1]).toHaveAccessibleName(/昨天那句/);
  });

  it('分布条按档位统计篇数，没记心情的日期不计入任何一档', () => {
    useJournalStore.setState({
      entries: [
        entry({ date: TODAY, mood: 5 }),
        entry({ date: YESTERDAY, mood: 5 }),
        entry({ date: addDays(TODAY, -2), mood: 0, text: '只写了字' }),
      ],
    });
    renderPage();

    expect(screen.getByText('2 篇记了心情 · 平均 5 分')).toBeInTheDocument();
    expect(screen.getByText('2 篇')).toBeInTheDocument();
    expect(screen.getAllByText('0 篇')).toHaveLength(4);
  });
});

describe('JournalPage 写日记', () => {
  beforeEach(wide);

  it('写今天：选心情、写正文、保存后落库', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: '写今天' }));
    await userEvent.click(screen.getByRole('button', { name: '不错' }));
    await userEvent.type(screen.getByLabelText('今天发生了什么'), '今天把日记页写完了');

    // 有改动但还没保存时给出提醒
    expect(screen.getByText('有未保存的修改')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(store().entries).toHaveLength(1);
    expect(store().entries[0]).toMatchObject({ date: TODAY, mood: 4, text: '今天把日记页写完了' });
  });

  it('同一天再写一次是修正，不会攒出第二篇', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: '写今天' }));
    await userEvent.click(screen.getByRole('button', { name: '一般' }));
    await userEvent.type(screen.getByLabelText('今天发生了什么'), '初稿');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    const created = store().entries[0]!;

    await userEvent.clear(screen.getByLabelText('今天发生了什么'));
    await userEvent.type(screen.getByLabelText('今天发生了什么'), '改过的');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(store().entries).toHaveLength(1);
    expect(store().entries[0]!.id).toBe(created.id);
    expect(store().entries[0]!.text).toBe('改过的');
  });

  it('心情按钮再点一次是取消选择，不是锁死在那一档', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: '写今天' }));
    const chip = screen.getByRole('button', { name: '很好' });

    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('把内容清干净再保存等于删掉这一天，并给出提示', async () => {
    useJournalStore.setState({ entries: [entry({ date: TODAY, mood: 3, text: '写过的' })] });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /写过的/ }));
    await userEvent.click(screen.getByRole('button', { name: '清除' }));
    await userEvent.clear(screen.getByLabelText('今天发生了什么'));
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(store().entries).toEqual([]);
    expect(await screen.findByText('这一天的记录已清空')).toBeInTheDocument();
  });

  it('删除后可以撤销：快照整表还原', async () => {
    useJournalStore.setState({
      entries: [
        entry({ date: TODAY, mood: 3, text: '要删的' }),
        entry({ date: YESTERDAY, mood: 2, text: '留着的' }),
      ],
    });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: '写今天' }));
    await userEvent.click(screen.getByRole('button', { name: '删除' }));

    expect(store().entries.map((item) => item.date)).toEqual([YESTERDAY]);

    await userEvent.click(await screen.findByRole('button', { name: '撤销' }));

    expect(
      store()
        .entries.map((item) => item.date)
        .sort(),
    ).toEqual([TODAY, YESTERDAY].sort());
  });

  it('点列表里的一天会读回那一天的内容', async () => {
    useJournalStore.setState({ entries: [entry({ date: YESTERDAY, mood: 2, text: '昨天写的' })] });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /昨天写的/ }));

    expect(screen.getByLabelText('今天发生了什么')).toHaveValue('昨天写的');
    expect(screen.getByRole('button', { name: '回到今天' })).toBeInTheDocument();
  });

  it('可以前后翻日期；翻走再翻回来，没保存的正文还在', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: '写今天' }));
    await userEvent.type(screen.getByLabelText('今天发生了什么'), '今天的内容');

    await userEvent.click(screen.getByRole('button', { name: '前一天' }));
    expect(screen.getByLabelText('今天发生了什么')).toHaveValue('');

    await userEvent.click(screen.getByRole('button', { name: '后一天' }));
    // 草稿按日期留在内存里：只是想翻回昨天看一眼，不该把今天写的字弄丢
    expect(screen.getByLabelText('今天发生了什么')).toHaveValue('今天的内容');
    expect(store().entries).toEqual([]);
  });
});

describe('JournalPage 与习惯联动', () => {
  beforeEach(wide);

  it('编辑器里列出这一天打过的卡，量化习惯带上进度', async () => {
    const habits = useHabitStore.getState();
    habits.addHabit({ name: '晨跑' });
    habits.addHabit({ name: '喝水', kind: 'count', target: 8, unit: '杯' });
    const [run, water] = useHabitStore.getState().habits;

    useHabitStore.getState().toggleHabitLog(run!.id, TODAY);
    useHabitStore.getState().toggleHabitLog(water!.id, TODAY);
    useHabitStore.getState().toggleHabitLog(water!.id, TODAY);

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '写今天' }));

    expect(screen.getByText('这一天的打卡')).toBeInTheDocument();
    expect(screen.getByText('晨跑')).toBeInTheDocument();
    expect(screen.getByText('已完成')).toBeInTheDocument();
    expect(screen.getByText('2/8')).toBeInTheDocument();
  });

  it('这一天没有打卡记录时不占位置', async () => {
    useHabitStore.getState().addHabit({ name: '晨跑' });

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: '写今天' }));

    expect(screen.queryByText('这一天的打卡')).not.toBeInTheDocument();
  });
});

describe('JournalPage 趋势', () => {
  beforeEach(wide);

  it('心情趋势卡在，周 / 月粒度可切换', async () => {
    useJournalStore.setState({
      entries: [entry({ date: TODAY, mood: 5 }), entry({ date: YESTERDAY, mood: 1 })],
    });
    renderPage();

    const weekly = screen.getByRole('button', { name: '按周' });
    const monthly = screen.getByRole('button', { name: '按月' });
    expect(weekly).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(monthly);
    expect(monthly).toHaveAttribute('aria-pressed', 'true');
    expect(weekly).toHaveAttribute('aria-pressed', 'false');
  });

  it('读屏描述按聚合粒度改口，不把「两周」念成「两次记录」', async () => {
    useJournalStore.setState({
      entries: [entry({ date: TODAY, mood: 5 }), entry({ date: YESTERDAY, mood: 2 })],
    });
    renderPage();

    expect(screen.getByRole('img', { name: /心情趋势：共 \d+ 周/ })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /次记录/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '按月' }));

    expect(screen.getByRole('img', { name: /心情趋势：共 \d+ 个月/ })).toBeInTheDocument();
  });

  it('没有数据时趋势图给空态占位，不抛错', () => {
    renderPage();
    expect(screen.getByRole('img', { name: '心情趋势（暂无数据）' })).toBeInTheDocument();
  });
});

/** 把当前 URL 打到 DOM 上，便于断言「状态真的进 URL 了」 */
const LocationProbe: React.FC = () => {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
};

const renderJournalAt = (entry: string): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <JournalPage />
        <LocationProbe />
      </ToastProvider>
    </MemoryRouter>,
  );

/*
 * 选中日期进 URL（`?date=`）。
 *
 * 以前是 `useState`：刷新、从别处跳回来、按浏览器回退，选中的那天全丢，
 * 用户得重新在日历上找一遍。开发页的 `?project=` 是现成模式，这里对齐它。
 */
describe('JournalPage 选中日期进 URL', () => {
  it('URL 带 ?date= 时右栏直接打开那一天，不用再点一次', () => {
    wide();
    renderJournalAt(`/growth/journal?date=${YESTERDAY}`);

    expect(screen.getByRole('button', { name: '前一天' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '回到今天' })).toBeInTheDocument();
  });

  it('没带 ?date= 时不自己挑一天，右栏保持占位', () => {
    wide();
    renderJournalAt('/growth/journal');

    expect(screen.queryByRole('button', { name: '前一天' })).not.toBeInTheDocument();
  });

  it('点「回到今天」把日期写回 URL', async () => {
    wide();
    renderJournalAt(`/growth/journal?date=${YESTERDAY}`);

    await userEvent.click(screen.getByRole('button', { name: '回到今天' }));

    expect(screen.getByTestId('location')).toHaveTextContent(`date=${TODAY}`);
    // 顺带确认 UI 真的跟着走了：今天这一期会亮「今天」徽章
    expect(screen.getByText(formatDayLabel(TODAY))).toBeInTheDocument();
  });
});

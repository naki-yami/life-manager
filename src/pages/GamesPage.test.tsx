import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GamesPage } from './GamesPage';
import { ToastProvider } from '../components/ui';
import { useGameStore } from '../store/gameStore';
import { todayKey } from '../utils/date';
import { GameStatus } from '../types';
import { requestPaletteFocus, resetPaletteFocus } from '../hooks/usePaletteFocus';
import { MASTER_DETAIL_QUERY } from '../components/layout';
import { mockMediaQueries } from '../test/matchMedia';

beforeEach(() => {
  useGameStore.setState({ games: [], sessions: [] });
});

const gameOf = (name: string) => useGameStore.getState().games.find((game) => game.name === name)!;

describe('GamesPage 从命令面板打开', () => {
  afterEach(() => {
    resetPaletteFocus();
  });

  it('聚焦某款游戏时打开它的笔记面板', () => {
    addGame('星露谷物语');
    render(<GamesPage />);

    act(() => {
      requestPaletteFocus('/games', gameOf('星露谷物语').id);
    });

    expect(screen.getByRole('dialog', { name: '《星露谷物语》的笔记' })).toBeInTheDocument();
  });

  it('聚焦一款不存在的游戏时不弹面板', () => {
    render(<GamesPage />);

    act(() => {
      requestPaletteFocus('/games', 'missing');
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

/** 统计卡片的整块文本，避免多个卡片出现相同数字时选择器歧义 */
const statText = (label: string): string =>
  screen.getByText(label).closest('div.rounded-lg')?.textContent ?? '';

const addGame = (name: string, platform: 'PC' | 'Switch' = 'PC'): void => {
  useGameStore.getState().addGame(name, platform);
};

const setStatus = (name: string, status: GameStatus): void => {
  useGameStore.getState().updateGameStatus(gameOf(name).id, status);
};

describe('GamesPage', () => {
  it('空态引导添加第一款游戏', async () => {
    render(<GamesPage />);
    expect(screen.getByText('游戏库还是空的')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: '添加游戏' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '添加游戏' });
    expect(within(dialog).getByRole('button', { name: '添加' })).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/^游戏名称/), '塞尔达传说');
    await userEvent.selectOptions(within(dialog).getByLabelText('平台'), 'Switch');
    await userEvent.click(within(dialog).getByRole('button', { name: '添加' }));

    const games = useGameStore.getState().games;
    expect(games).toHaveLength(1);
    expect(games[0]!.name).toBe('塞尔达传说');
    expect(games[0]!.platform).toBe('Switch');
    expect(games[0]!.status).toBe('playing');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('统计卡片汇总游戏数、在玩、已通关与总时长', () => {
    addGame('塞尔达传说', 'Switch');
    addGame('哈迪斯');
    addGame('空洞骑士');
    setStatus('哈迪斯', 'completed');
    useGameStore.getState().updateHoursPlayed(gameOf('塞尔达传说').id, 10);
    useGameStore.getState().updateHoursPlayed(gameOf('哈迪斯').id, 2.5);

    render(<GamesPage />);

    expect(statText('游戏总数')).toContain('3');
    expect(statText('在玩中')).toContain('2');
    expect(statText('已通关数')).toContain('1');
    expect(statText('总时长')).toContain('12 小时 30 分');
  });

  it('可以按状态筛选并显示数量，也能按成就名搜索', async () => {
    addGame('塞尔达传说', 'Switch');
    addGame('哈迪斯');
    addGame('空洞骑士');
    setStatus('哈迪斯', 'completed');
    useGameStore.getState().addAchievement(gameOf('空洞骑士').id, '速通五小时', '');

    render(<GamesPage />);

    expect(screen.getByRole('button', { name: /^全部/ })).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: /^已通关/ })).toHaveTextContent('1');

    await userEvent.click(screen.getByRole('button', { name: /^已通关/ }));
    expect(screen.getByText('哈迪斯')).toBeInTheDocument();
    expect(screen.queryByText('塞尔达传说')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^全部/ }));
    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), '速通');
    expect(screen.getByText('空洞骑士')).toBeInTheDocument();
    expect(screen.queryByText('哈迪斯')).not.toBeInTheDocument();
  });

  it('可以改状态、改时长与拖动进度', async () => {
    addGame('哈迪斯');
    render(<GamesPage />);

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '调整「哈迪斯」的状态' }),
      'completed',
    );
    expect(gameOf('哈迪斯').status).toBe('completed');

    const hours = screen.getByRole('spinbutton', { name: '「哈迪斯」的游玩时长' });
    await userEvent.clear(hours);
    await userEvent.type(hours, '42');
    expect(gameOf('哈迪斯').hoursPlayed).toBe(42);

    fireEvent.change(screen.getByRole('slider', { name: '调整「哈迪斯」的进度' }), {
      target: { value: '70' },
    });
    expect(gameOf('哈迪斯').progress).toBe(70);
    expect(screen.getByRole('progressbar', { name: '通关进度' })).toHaveAttribute(
      'aria-valuenow',
      '70',
    );
  });

  it('可以直接点成就切换解锁状态', async () => {
    addGame('哈迪斯');
    useGameStore.getState().addAchievement(gameOf('哈迪斯').id, '逃出冥界', '击败冥王');
    render(<GamesPage />);

    expect(screen.getByText('成就 0/1')).toBeInTheDocument();

    const badge = screen.getByRole('button', { name: '逃出冥界' });
    expect(badge).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(badge);
    expect(gameOf('哈迪斯').achievements[0]!.unlocked).toBe(true);
    expect(screen.getByText('成就 1/1')).toBeInTheDocument();
  });

  it('管理成就里可以新增与删除成就', async () => {
    addGame('哈迪斯');
    render(<GamesPage />);

    await userEvent.click(screen.getByRole('button', { name: '管理成就' }));
    const dialog = screen.getByRole('dialog', { name: '《哈迪斯》的成就' });
    expect(within(dialog).getByText('还没有成就')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '添加' })).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/^成就名称/), '无伤通关');
    await userEvent.type(within(dialog).getByLabelText(/^描述/), '一次都不受伤');
    await userEvent.click(within(dialog).getByRole('button', { name: '添加' }));

    const achievements = gameOf('哈迪斯').achievements;
    expect(achievements).toHaveLength(1);
    expect(achievements[0]!.description).toBe('一次都不受伤');
    expect(within(dialog).getByRole('button', { name: /^无伤通关/ })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '删除成就「无伤通关」' }));
    expect(gameOf('哈迪斯').achievements).toHaveLength(0);
    expect(within(dialog).getByText('还没有成就')).toBeInTheDocument();
  });

  it('笔记可以保存与清空', async () => {
    addGame('哈迪斯');
    render(<GamesPage />);

    await userEvent.click(screen.getByRole('button', { name: '笔记' }));
    const dialog = screen.getByRole('dialog', { name: '《哈迪斯》的笔记' });
    await userEvent.type(within(dialog).getByLabelText('笔记'), '先刷满武器再打冥王');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(gameOf('哈迪斯').notes).toBe('先刷满武器再打冥王');
    expect(screen.getByText('先刷满武器再打冥王')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '笔记' }));
    const reopened = screen.getByRole('dialog', { name: '《哈迪斯》的笔记' });
    expect(within(reopened).getByLabelText('笔记')).toHaveValue('先刷满武器再打冥王');

    await userEvent.clear(within(reopened).getByLabelText('笔记'));
    await userEvent.click(within(reopened).getByRole('button', { name: '保存' }));
    expect(gameOf('哈迪斯').notes).toBe('');
  });

  it('删除游戏要二次确认，文案里提示成就与时长', async () => {
    addGame('哈迪斯');
    useGameStore.getState().addAchievement(gameOf('哈迪斯').id, '逃出冥界', '');
    useGameStore.getState().updateHoursPlayed(gameOf('哈迪斯').id, 30);

    render(<GamesPage />);
    await userEvent.click(screen.getByRole('button', { name: '删除《哈迪斯》' }));

    const dialog = screen.getByRole('dialog', { name: '删除游戏' });
    expect(within(dialog).getByText(/1 个成就记录与 30 小时时长/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(useGameStore.getState().games).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: '删除《哈迪斯》' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: '删除游戏' })).getByRole('button', {
        name: '删除',
      }),
    );
    expect(useGameStore.getState().games).toHaveLength(0);
    expect(screen.getByText('游戏库还是空的')).toBeInTheDocument();
  });

  it('记录游玩会写入流水，并把时长累加到游戏上', async () => {
    addGame('哈迪斯');
    render(<GamesPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '记录游玩' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '记录游玩' });

    fireEvent.change(within(dialog).getByRole('spinbutton', { name: '时长' }), {
      target: { value: '2.5' },
    });
    await userEvent.type(within(dialog).getByLabelText('备注'), '打通第一层');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    const { sessions } = useGameStore.getState();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.gameId).toBe(gameOf('哈迪斯').id);
    expect(sessions[0]!.date).toBe(todayKey());
    expect(sessions[0]!.hours).toBe(2.5);
    expect(sessions[0]!.note).toBe('打通第一层');
    expect(gameOf('哈迪斯').hoursPlayed).toBe(2.5);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('年度卡片汇总今年游玩的小时数与天数', () => {
    addGame('哈迪斯');
    const gameId = gameOf('哈迪斯').id;
    useGameStore.getState().addSession(gameId, todayKey(), 3, '第一章');
    useGameStore.getState().addSession(gameId, todayKey(), 1.5, '');

    render(<GamesPage />);

    const year = todayKey().slice(0, 4);
    expect(screen.getByText(`${year} 年游玩`)).toBeInTheDocument();
    expect(screen.getByText(/累计 4\.5 小时 · 游玩 1 天 · 2 条记录/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /年每月游玩时长：合计 4\.5 小时/ })).toBeInTheDocument();
    expect(screen.getByText('第一章')).toBeInTheDocument();
  });

  it('删除游玩记录会把时长减回去，撤销后两边都恢复', async () => {
    addGame('哈迪斯');
    const gameId = gameOf('哈迪斯').id;
    useGameStore.getState().addSession(gameId, todayKey(), 2, '');

    render(
      <ToastProvider>
        <GamesPage />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /的「哈迪斯」游玩记录/ }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: '删除游玩记录' })).getByRole('button', {
        name: '删除',
      }),
    );

    expect(useGameStore.getState().sessions).toHaveLength(0);
    expect(gameOf('哈迪斯').hoursPlayed).toBe(0);
    expect(screen.getByText(/已删除 .* 的游玩记录/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '撤销' }));

    expect(useGameStore.getState().sessions).toHaveLength(1);
    expect(gameOf('哈迪斯').hoursPlayed).toBe(2);
    expect(screen.getByText(/累计 2 小时 · 游玩 1 天 · 1 条记录/)).toBeInTheDocument();
  });

  it('没有游玩记录时不渲染年度卡片', () => {
    addGame('哈迪斯');
    render(<GamesPage />);

    expect(screen.queryByText(`${todayKey().slice(0, 4)} 年游玩`)).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /每月游玩时长/ })).not.toBeInTheDocument();
  });

  it('游戏卡片带封面占位（渐变 + 首字）', () => {
    addGame('哈迪斯');
    render(<GamesPage />);

    // 封面是 aria-hidden 的装饰块，里面显示游戏名首字
    const cover = screen.getByText('哈').closest('div[aria-hidden]');
    expect(cover).not.toBeNull();
    expect(cover!.getAttribute('style')).toContain('linear-gradient');
  });
});

describe('GamesPage 标签', () => {
  it('添加游戏时能打标签，卡片上会显示', async () => {
    render(<GamesPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '添加游戏' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '添加游戏' });
    await userEvent.type(within(dialog).getByLabelText(/^游戏名称/), '极乐迪斯科');
    await userEvent.type(within(dialog).getByLabelText('标签'), 'RPG{Enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: '添加' }));

    expect(useGameStore.getState().games[0]!.tags).toEqual(['RPG']);
    expect(screen.getByText('#RPG')).toBeInTheDocument();
  });

  it('卡片上可以就地补标签，标签会写回 store', async () => {
    addGame('极乐迪斯科');
    render(<GamesPage />);

    await userEvent.click(screen.getByRole('button', { name: '添加标签' }));
    await userEvent.type(screen.getByLabelText('编辑标签'), 'RPG{Enter}');
    await userEvent.click(screen.getByRole('button', { name: '完成' }));

    expect(gameOf('极乐迪斯科').tags).toEqual(['RPG']);
    expect(screen.getByText('#RPG')).toBeInTheDocument();
  });

  it('搜索框里输入 #标签 能筛出对应的游戏', async () => {
    const store = useGameStore.getState();
    store.addGame('极乐迪斯科', 'PC', ['RPG']);
    store.addGame('星露谷物语', 'PC', ['休闲']);
    render(<GamesPage />);

    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), '#休闲');

    expect(screen.getByText('星露谷物语')).toBeInTheDocument();
    expect(screen.queryByText('极乐迪斯科')).not.toBeInTheDocument();
  });
});
describe('GamesPage 宽屏双栏', () => {
  afterEach(() => {
    resetPaletteFocus();
  });

  const expectWideLayout = (): void => mockMediaQueries({ [MASTER_DETAIL_QUERY]: true });
  const panel = (name = '游戏详情'): HTMLElement => screen.getByRole('complementary', { name });

  it('宽屏右栏常驻，没选中游戏时是占位内容', () => {
    addGame('哈迪斯');
    expectWideLayout();

    render(<GamesPage />);

    expect(within(panel()).getByText('还没有选中游戏')).toBeInTheDocument();
    expect(screen.getByText('哈迪斯')).toBeInTheDocument();
  });

  it('点「管理成就」在右栏增删，不再弹对话框', async () => {
    addGame('哈迪斯');
    expectWideLayout();

    render(<GamesPage />);
    await userEvent.click(screen.getByRole('button', { name: '管理成就' }));

    // 焦点没被搬进对话框，游戏库也还在
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('哈迪斯')).toBeInTheDocument();

    const aside = panel('《哈迪斯》的成就');
    expect(within(aside).getByText('还没有成就')).toBeInTheDocument();

    await userEvent.type(within(aside).getByLabelText(/^成就名称/), '无伤通关');
    await userEvent.type(within(aside).getByLabelText(/^描述/), '一次都不受伤');
    await userEvent.click(within(aside).getByRole('button', { name: '添加' }));

    const achievements = gameOf('哈迪斯').achievements;
    expect(achievements).toHaveLength(1);
    expect(achievements[0]!.description).toBe('一次都不受伤');
    // 右栏没关，可以接着加第二条
    expect(within(aside).getByRole('button', { name: /^无伤通关/ })).toBeInTheDocument();

    await userEvent.click(within(aside).getByRole('button', { name: '删除成就「无伤通关」' }));
    expect(gameOf('哈迪斯').achievements).toHaveLength(0);
    expect(within(aside).getByText('还没有成就')).toBeInTheDocument();
  });

  it('点「笔记」在右栏保存与清空，不再弹对话框', async () => {
    addGame('哈迪斯');
    expectWideLayout();

    render(<GamesPage />);
    await userEvent.click(screen.getByRole('button', { name: '笔记' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const aside = panel('《哈迪斯》的笔记');
    await userEvent.type(within(aside).getByLabelText('笔记'), '先刷满武器再打冥王');
    await userEvent.click(within(aside).getByRole('button', { name: '保存' }));

    expect(gameOf('哈迪斯').notes).toBe('先刷满武器再打冥王');
    expect(screen.getByText('先刷满武器再打冥王')).toBeInTheDocument();
    // 存完右栏回到占位
    expect(within(panel()).getByText('还没有选中游戏')).toBeInTheDocument();
  });

  it('「取消」只关右栏，不把草稿写回 store', async () => {
    addGame('哈迪斯');
    expectWideLayout();

    render(<GamesPage />);
    await userEvent.click(screen.getByRole('button', { name: '笔记' }));

    const aside = panel('《哈迪斯》的笔记');
    await userEvent.type(within(aside).getByLabelText('笔记'), '不该被保存');
    await userEvent.click(within(aside).getByRole('button', { name: '取消' }));

    expect(within(panel()).getByText('还没有选中游戏')).toBeInTheDocument();
    expect(gameOf('哈迪斯').notes).toBe('');
  });

  it('成就与笔记共用一个右栏，切换按钮就切换内容', async () => {
    addGame('哈迪斯');
    expectWideLayout();

    render(<GamesPage />);
    await userEvent.click(screen.getByRole('button', { name: '管理成就' }));
    expect(panel('《哈迪斯》的成就')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '笔记' }));
    expect(panel('《哈迪斯》的笔记')).toBeInTheDocument();
    expect(screen.queryByText('还没有成就')).not.toBeInTheDocument();
  });

  it('宽屏下命令面板聚焦某款游戏，也直接进右栏', () => {
    addGame('星露谷物语');
    expectWideLayout();

    render(<GamesPage />);
    act(() => {
      requestPaletteFocus('/games', gameOf('星露谷物语').id);
    });

    expect(panel('《星露谷物语》的笔记')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

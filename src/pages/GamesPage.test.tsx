import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { GamesPage } from './GamesPage';
import { useGameStore } from '../store/gameStore';
import { GameStatus } from '../types';

beforeEach(() => {
  useGameStore.setState({ games: [] });
});

const gameOf = (name: string) => useGameStore.getState().games.find((game) => game.name === name)!;

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
});

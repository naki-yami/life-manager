import { useMemo } from 'react';
import { useOptionalToast } from '../ui';
import { useBookStore } from '../../store/bookStore';
import { useDevStore } from '../../store/devStore';
import { useFocusStore, type StartFocusInput } from '../../store/focusStore';
import { useGameStore } from '../../store/gameStore';
import { useTaskStore } from '../../store/taskStore';
import { postFocusSession } from '../../services/focusPost';
import { todayKey } from '../../utils/date';
import { FOCUS_TARGET_LABELS, focusSummary, formatFocusDuration } from '../../utils/focus';
import type { ActiveFocus } from '../../types';
import type { FocusOption } from './FocusTimer';

/**
 * 专注会话的接线。
 *
 * 首页的「专注」卡片与「今日计划」页的时间轴都要开车，两处各写一份必然走样，
 * 所以把「有哪些可专注的对象、结束后写回哪儿、提示什么」收在这里。
 * 计时本身与界面无关，留在 `FocusTimer` 里。
 */
export interface FocusSessionController {
  active: ActiveFocus | null;
  options: FocusOption[];
  /** 今天专注了几次、共多久 */
  today: { count: number; minutes: number };
  start: (input: StartFocusInput) => void;
  cancel: () => void;
  finish: () => void;
}

export function useFocusSession(): FocusSessionController {
  const tasks = useTaskStore((state) => state.tasks);
  const toggleTaskStatus = useTaskStore((state) => state.toggleTaskStatus);
  const devProjects = useDevStore((state) => state.projects);
  const books = useBookStore((state) => state.books);
  const games = useGameStore((state) => state.games);
  const sessions = useFocusStore((state) => state.sessions);
  const active = useFocusStore((state) => state.active);
  const startFocus = useFocusStore((state) => state.startFocus);
  const cancelFocus = useFocusStore((state) => state.cancelFocus);
  const finishFocus = useFocusStore((state) => state.finishFocus);
  const toast = useOptionalToast();

  const today = todayKey();

  /**
   * 可专注的对象：待办任务，加上「正在做」的那几类实体 ——
   * 已经读完的书、归档的项目不该出现在这里占位置。
   */
  const options = useMemo<FocusOption[]>(
    () => [
      ...tasks
        .filter((task) => task.status === 'pending')
        .map((task) => ({
          key: `task:${task.id}`,
          title: task.title,
          target: 'task' as const,
          entityId: task.id,
          group: FOCUS_TARGET_LABELS.task,
        })),
      ...devProjects
        .filter((project) => project.status === 'in-progress')
        .map((project) => ({
          key: `dev:${project.id}`,
          title: project.name,
          target: 'dev' as const,
          entityId: project.id,
          group: FOCUS_TARGET_LABELS.dev,
        })),
      ...books
        .filter((book) => book.status === 'reading')
        .map((book) => ({
          key: `book:${book.id}`,
          title: book.title,
          target: 'book' as const,
          entityId: book.id,
          group: FOCUS_TARGET_LABELS.book,
        })),
      ...games
        .filter((game) => game.status === 'playing')
        .map((game) => ({
          key: `game:${game.id}`,
          title: game.name,
          target: 'game' as const,
          entityId: game.id,
          group: FOCUS_TARGET_LABELS.game,
        })),
    ],
    [tasks, devProjects, books, games],
  );

  const todaySummary = useMemo(() => focusSummary(sessions, today), [sessions, today]);

  /**
   * 结束专注。
   *
   * 任务是「勾完成」而不是「记时长」，所以只提示不写流水；
   * 开发 / 读书 / 游戏走 focusPost 回填，回填结果（成功、对象已删）都要告诉用户 ——
   * 默默不写才是最糟的结果。
   */
  const finish = (): void => {
    const session = finishFocus();
    if (!session) return;
    const duration = formatFocusDuration(session.minutes);
    if (session.target === 'task') {
      const task = tasks.find((item) => item.id === session.entityId);
      const undone = task?.status === 'pending' ? task : undefined;
      toast?.toast({
        tone: 'info',
        title: `本次专注 ${duration}`,
        description: undone
          ? '任务不写时长流水 —— 顺手把它勾掉？'
          : '任务不写时长流水，做完直接勾掉任务即可。',
        action: undone
          ? { label: '标记完成', onClick: () => toggleTaskStatus(undone.id) }
          : undefined,
      });
      return;
    }
    const outcome = postFocusSession(session);
    toast?.toast({
      tone: outcome.ok ? 'success' : 'warning',
      title: `本次专注 ${duration}`,
      description: outcome.message,
    });
  };

  return { active, options, today: todaySummary, start: startFocus, cancel: cancelFocus, finish };
}

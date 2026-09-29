import type { FocusSession } from '../types';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useFocusStore } from '../store/focusStore';
import { useGameStore } from '../store/gameStore';
import { formatFocusDuration } from '../utils/focus';

/**
 * 专注时长的回填。
 *
 * 为什么单独一个模块：这次专注「算多久、写到哪」是一条业务规则，而不是某个页面的
 * 装饰逻辑。任务页、首页卡片、以后的复盘页都要用它，放在服务层只有一份实现。
 *
 * 三条规则：
 * - **任务是勾完成，不写流水**：任务本身没有「时长」字段，硬造一条流水没有意义；
 * - **对象被删了就不写**：宁可提示「对应的项目已经删了」，也不要造一条挂空 id 的流水 ——
 *   那种记录在任何统计里都是幽灵；
 * - **写一次就标记**：写入成功后立刻把 `posted` 置位，重复点击不会写第二遍。
 */

export type FocusPostOutcome =
  | { ok: true; message: string }
  | { ok: false; reason: 'task' | 'missing' | 'posted'; message: string };

/** 专注时长换算成小时，保留两位小数：开发工时与游玩时长都按小时记 */
export function focusHours(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round((minutes / 60) * 100) / 100;
}

export function postFocusSession(session: FocusSession): FocusPostOutcome {
  if (session.posted) {
    return { ok: false, reason: 'posted', message: '这次专注的时长已经写进流水了。' };
  }

  if (session.target === 'task') {
    return { ok: false, reason: 'task', message: '任务是直接勾完成，不写时长流水。' };
  }

  const duration = formatFocusDuration(session.minutes);
  const note = `专注计时 · ${duration}`;
  const markPosted = (): void => useFocusStore.getState().markPosted(session.id);

  if (session.target === 'dev') {
    const exists = useDevStore
      .getState()
      .projects.some((project) => project.id === session.entityId);
    if (!exists) {
      return {
        ok: false,
        reason: 'missing',
        message: '对应的开发项目已经删了，这次时长没有写进工时。',
      };
    }
    useDevStore
      .getState()
      .addSession(session.entityId, session.date, focusHours(session.minutes), note);
    markPosted();
    return { ok: true, message: `已把 ${duration} 写进开发工时。` };
  }

  if (session.target === 'book') {
    const exists = useBookStore.getState().books.some((book) => book.id === session.entityId);
    if (!exists) {
      return {
        ok: false,
        reason: 'missing',
        message: '对应的书已经删了，这次时长没有写进阅读记录。',
      };
    }
    useBookStore
      .getState()
      .addReadingSession(session.entityId, session.date, session.minutes, note);
    markPosted();
    return { ok: true, message: `已把 ${duration} 写进阅读记录。` };
  }

  const exists = useGameStore.getState().games.some((game) => game.id === session.entityId);
  if (!exists) {
    return {
      ok: false,
      reason: 'missing',
      message: '对应的游戏已经删了，这次时长没有写进游玩记录。',
    };
  }
  useGameStore
    .getState()
    .addSession(session.entityId, session.date, focusHours(session.minutes), note);
  markPosted();
  return { ok: true, message: `已把 ${duration} 写进游玩记录。` };
}

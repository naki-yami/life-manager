import { useTaskStore } from './taskStore';
import { useBookStore } from './bookStore';
import { useDevStore } from './devStore';
import { useWritingStore } from './writingStore';
import { useFitnessStore } from './fitnessStore';
import { useDietStore } from './dietStore';
import { useGameStore } from './gameStore';
import { useHabitStore } from './habitStore';
import { useBodyStore } from './bodyStore';
import { useFocusStore } from './focusStore';
import { useReviewStore } from './reviewStore';
import { useGoalStore } from './goalStore';
import { useThemeStore } from './themeStore';
import { useUiStore } from './uiStore';

/**
 * 等待所有 store 把本地数据读回内存。
 *
 * 为什么需要它：V2.0 的数据都在 localStorage 里，读取是同步的，
 * 首屏第一帧画的就是用户的真实数据。V2.1 把数据搬进 IndexedDB 之后读取变成异步，
 * 不等的话首屏会先按「空数据」渲染一帧，几十毫秒后才被真数据替换 ——
 * 用户会看到「还没有任务」闪一下再变成任务列表。
 * 宁可晚一帧出内容，也不要先给一个错的。
 *
 * 调用点只有 main.tsx（渲染之前）。测试里不需要等，store 的异步反序列化照常发生。
 */

interface HydratableStore {
  persist: {
    hasHydrated: () => boolean;
    /** 注册一次性的「读完」回调；重复注册不会有害，所以这里不关心取消 */
    onFinishHydration: (listener: () => void) => () => void;
  };
}

/** 会往本地存储写数据的 store；新增 store 时记得加进来 */
const STORES: HydratableStore[] = [
  useTaskStore,
  useBookStore,
  useDevStore,
  useWritingStore,
  useFitnessStore,
  useDietStore,
  useGameStore,
  useHabitStore,
  useBodyStore,
  useFocusStore,
  useReviewStore,
  useGoalStore,
  useThemeStore,
  useUiStore,
];

function whenHydrated(store: HydratableStore): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    store.persist.onFinishHydration(() => resolve());
  });
}

/**
 * 等待上限：IndexedDB 万一一直没有回应（比如被别的标签页锁着），
 * 也不能让界面永远白屏 —— 超时就先渲染，数据到了会自己补上。
 */
const BOOT_TIMEOUT_MS = 1500;

export async function hydrateAllStores(): Promise<void> {
  await Promise.race([
    Promise.all(STORES.map(whenHydrated)).then(() => undefined),
    new Promise<void>((resolve) => {
      setTimeout(resolve, BOOT_TIMEOUT_MS);
    }),
  ]);
}

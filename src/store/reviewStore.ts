import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReviewEntry, ReviewPeriod } from '../types';
import { createId } from '../utils/id';
import { isDayKey } from '../utils/date';
import { periodStartOf } from '../utils/review';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { persistOptions } from './persist';
import { asRecord, normalizeArray } from './normalize';
import { reviewSchema } from '../services/schemas';

/**
 * 每日 / 每周复盘。
 *
 * 三个约定：
 * - **`saveReview` 按周期 upsert**：`period + 起始日` 是主键，再写一次是修正。
 *   复盘本来就是「改了想法就改」，逼用户先删后建没有意义；
 * - **只存回答，不存汇总数字**：完成任务数、专注时长这些每次从各模块流水现算，
 *   存下来会在数据变动之后撒谎；
 * - **空回答也照存**：用户可能先写下一条，另外两条明天补 —— 那是「还没写」，
 *   不是「没这条记录」。列表里靠 `hasAnswer` 决定要不要占位。
 */
export interface ReviewAnswers {
  best: string;
  blocker: string;
  next: string;
}

interface ReviewState {
  reviews: ReviewEntry[];
  /** 写入某个周期的复盘；同一个周期再写是修正，不会新增第二条 */
  saveReview: (period: ReviewPeriod, start: string, answers: ReviewAnswers) => void;
  deleteReview: (id: string) => void;
  replaceReviews: (reviews: ReviewEntry[]) => void;
}

const defaultState = { reviews: [] as ReviewEntry[] };

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      ...defaultState,
      saveReview: (period, start, answers) =>
        set((state) => {
          // 周期起点在这里再算一次：页面传当天也行、传周一也行，落到库里永远是起点
          const day = periodStartOf(period, start);
          if (!isDayKey(day)) return state;

          const now = new Date().toISOString();
          const content: ReviewAnswers = {
            best: answers.best.trim(),
            blocker: answers.blocker.trim(),
            next: answers.next.trim(),
          };
          const existing = state.reviews.find(
            (entry) => entry.period === period && entry.date === day,
          );

          if (!existing) {
            return {
              reviews: [
                ...state.reviews,
                {
                  id: createId(),
                  period,
                  date: day,
                  ...content,
                  createdAt: now,
                  updatedAt: now,
                },
              ],
            };
          }

          return {
            reviews: state.reviews.map((entry) =>
              entry.id === existing.id ? { ...entry, ...content, updatedAt: now } : entry,
            ),
          };
        }),
      deleteReview: (id) =>
        set((state) => ({ reviews: state.reviews.filter((entry) => entry.id !== id) })),
      replaceReviews: (reviews) => set({ reviews }),
    }),
    persistOptions<ReviewState, Pick<ReviewState, 'reviews'>>({
      name: STORAGE_KEYS.review,
      partialize: (state) => ({ reviews: state.reviews }),
      normalize: (persisted) => ({
        reviews: normalizeArray(reviewSchema, asRecord(persisted).reviews),
      }),
    }),
  ),
);

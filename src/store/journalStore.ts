import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { JournalEntry } from '../types';
import { createId } from '../utils/id';
import { isDayKey } from '../utils/date';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { clampMood, isEmptyDraft } from '../utils/journal';
import { normalizeTags } from '../utils/tags';
import { persistOptions } from './persist';
import { asRecord, normalizeArray } from './normalize';
import { journalSchema } from '../services/schemas';

/**
 * 日记与心情。
 *
 * 三个约定：
 * - **一天一条，`date` 是主键**：`saveEntry` 按日期 upsert，再写一次是修正，
 *   不会攒出「同一天的第二篇」；
 * - **清空就是删除**：心情归 0、标签清空、正文删光之后再保存，这条记录直接消失 ——
 *   留一篇空白日记除了把列表撑长没有任何意义；
 * - **心情用 0 表示「没记」**：和「今天很糟（1）」是两件事，不能都算成 1。
 */
export interface JournalDraft {
  mood: number;
  tags: string[];
  text: string;
}

interface JournalState {
  entries: JournalEntry[];
  /** 写入某天的日记；空草稿等于删除那一天的记录 */
  saveEntry: (date: string, draft: JournalDraft) => void;
  deleteEntry: (id: string) => void;
  replaceEntries: (entries: JournalEntry[]) => void;
}

const defaultState = { entries: [] as JournalEntry[] };

export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      ...defaultState,
      saveEntry: (date, draft) =>
        set((state) => {
          if (!isDayKey(date)) return state;

          const content = {
            mood: clampMood(draft.mood),
            tags: normalizeTags(draft.tags),
            text: draft.text.trim(),
          };
          const existing = state.entries.find((entry) => entry.date === date);

          if (isEmptyDraft(content)) {
            // 清空 = 删除：原本就没有这一天时连 set 都不用做
            return existing
              ? { entries: state.entries.filter((entry) => entry.id !== existing.id) }
              : state;
          }

          const now = new Date().toISOString();
          if (!existing) {
            return {
              entries: [
                ...state.entries,
                { id: createId(), date, ...content, createdAt: now, updatedAt: now },
              ],
            };
          }

          return {
            entries: state.entries.map((entry) =>
              entry.id === existing.id ? { ...entry, ...content, updatedAt: now } : entry,
            ),
          };
        }),
      deleteEntry: (id) =>
        set((state) => ({ entries: state.entries.filter((entry) => entry.id !== id) })),
      replaceEntries: (entries) => set({ entries }),
    }),
    persistOptions<JournalState, Pick<JournalState, 'entries'>>({
      name: STORAGE_KEYS.journal,
      partialize: (state) => ({ entries: state.entries }),
      normalize: (persisted) => ({
        entries: normalizeArray(journalSchema, asRecord(persisted).entries),
      }),
    }),
  ),
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Book, BookStatus, ReadingSession } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { STORE_VERSION, migrateState } from './persist';

interface BookState {
  books: Book[];
  /** 阅读流水，用来做每周阅读时长这类按时间的统计 */
  sessions: ReadingSession[];
  addBook: (title: string, author: string, category: string) => void;
  updateBook: (id: string, updates: Partial<Book>) => void;
  deleteBook: (id: string) => void;
  updateBookStatus: (id: string, status: BookStatus) => void;
  updateProgress: (id: string, progress: number) => void;
  addNote: (bookId: string, content: string, page?: number) => void;
  deleteNote: (bookId: string, noteId: string) => void;
  replaceBooks: (books: Book[]) => void;
  addReadingSession: (bookId: string, date: string, minutes: number, note: string) => void;
  deleteReadingSession: (id: string) => void;
  replaceSessions: (sessions: ReadingSession[]) => void;
}

const defaultState = { books: [] as Book[], sessions: [] as ReadingSession[] };

export const useBookStore = create<BookState>()(
  persist(
    (set) => ({
      ...defaultState,
      addBook: (title, author, category) =>
        set((state) => ({
          books: [
            ...state.books,
            {
              id: createId(),
              title,
              author,
              category,
              status: 'want-to-read' as BookStatus,
              progress: 0,
              notes: [],
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      updateBook: (id, updates) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        })),
      deleteBook: (id) => set((state) => ({ books: state.books.filter((b) => b.id !== id) })),
      updateBookStatus: (id, status) =>
        set((state) => ({
          books: state.books.map((b) =>
            b.id === id
              ? {
                  ...b,
                  status,
                  // 记下第一次读完的时间，重复标记不覆盖，便于按年统计
                  finishedAt:
                    status === 'finished' ? (b.finishedAt ?? new Date().toISOString()) : undefined,
                  // 记下开始阅读的时间，用来估算「还需几天读完」；再次进入不覆盖
                  startedAt:
                    status === 'reading' ? (b.startedAt ?? new Date().toISOString()) : b.startedAt,
                }
              : b,
          ),
        })),
      updateProgress: (id, progress) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, progress } : b)),
        })),
      addNote: (bookId, content, page) =>
        set((state) => ({
          books: state.books.map((b) =>
            b.id === bookId
              ? {
                  ...b,
                  notes: [
                    {
                      id: createId(),
                      content,
                      createdAt: new Date().toISOString(),
                      ...(page && page > 0 ? { page } : {}),
                    },
                    ...b.notes,
                  ],
                }
              : b,
          ),
        })),
      deleteNote: (bookId, noteId) =>
        set((state) => ({
          books: state.books.map((b) =>
            b.id === bookId ? { ...b, notes: b.notes.filter((n) => n.id !== noteId) } : b,
          ),
        })),
      replaceBooks: (books) => set({ books }),
      addReadingSession: (bookId, date, minutes, note) =>
        set((state) => ({
          sessions: [
            {
              id: createId(),
              bookId,
              date,
              minutes: Math.max(0, Math.round(minutes)),
              note,
              createdAt: new Date().toISOString(),
            },
            ...state.sessions,
          ],
        })),
      deleteReadingSession: (id) =>
        set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),
      replaceSessions: (sessions) => set({ sessions }),
    }),
    {
      name: STORAGE_KEYS.books,
      version: STORE_VERSION,
      partialize: (state) => ({ books: state.books, sessions: state.sessions }),
      migrate: (persisted) => migrateState(persisted, defaultState),
    },
  ),
);

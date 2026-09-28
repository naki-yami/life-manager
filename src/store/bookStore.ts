import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Book, BookStatus } from '../types';
import { createId } from '../utils/id';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { STORE_VERSION, migrateState } from './persist';

interface BookState {
  books: Book[];
  addBook: (title: string, author: string, category: string) => void;
  updateBook: (id: string, updates: Partial<Book>) => void;
  deleteBook: (id: string) => void;
  updateBookStatus: (id: string, status: BookStatus) => void;
  updateProgress: (id: string, progress: number) => void;
  addNote: (bookId: string, content: string) => void;
  deleteNote: (bookId: string, noteId: string) => void;
  replaceBooks: (books: Book[]) => void;
}

const defaultState = { books: [] as Book[] };

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
          books: state.books.map((b) => (b.id === id ? { ...b, status } : b)),
        })),
      updateProgress: (id, progress) =>
        set((state) => ({
          books: state.books.map((b) => (b.id === id ? { ...b, progress } : b)),
        })),
      addNote: (bookId, content) =>
        set((state) => ({
          books: state.books.map((b) =>
            b.id === bookId
              ? {
                  ...b,
                  notes: [
                    { id: createId(), content, createdAt: new Date().toISOString() },
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
    }),
    {
      name: STORAGE_KEYS.books,
      version: STORE_VERSION,
      partialize: (state) => ({ books: state.books }),
      migrate: (persisted) => migrateState(persisted, defaultState),
    },
  ),
);

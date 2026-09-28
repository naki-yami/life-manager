import React, { useState } from 'react';
import { Plus, Trash2, Edit3, StickyNote } from 'lucide-react';
import { Card, CardHeader, CardBody, Button, Input, Modal, Select } from '../components/ui';
import { useBookStore } from '../store/bookStore';
import { BookStatus } from '../types';

export const BooksPage: React.FC = () => {
  const { books, addBook, deleteBook, updateBookStatus, updateProgress, addNote, deleteNote } = useBookStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | BookStatus>('all');
  const [form, setForm] = useState({ title: '', author: '', category: '' });

  const handleAdd = () => {
    if (!form.title.trim()) return;
    addBook(form.title, form.author, form.category);
    setForm({ title: '', author: '', category: '' });
    setShowAddModal(false);
  };

  const handleAddNote = () => {
    if (selectedBookId && noteInput.trim()) {
      addNote(selectedBookId, noteInput.trim());
      setNoteInput('');
    }
  };

  const filtered = books.filter((b) => filterStatus === 'all' || b.status === filterStatus);

  const statusLabels: Record<BookStatus, string> = {
    'want-to-read': '想读',
    'reading': '在读',
    'finished': '已读',
  };

  const statusColors: Record<BookStatus, string> = {
    'want-to-read': 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    'reading': 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    'finished': 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">读书</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">管理你的阅读书单</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus size={16} className="mr-2" /> 添加书籍
        </Button>
      </div>

      <div className="flex gap-2">
        {(['all', 'want-to-read', 'reading', 'finished'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilterStatus(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filterStatus === f
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {f === 'all' ? '全部' : statusLabels[f]}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-400 dark:text-gray-500">暂无书籍</p>
          </Card>
        ) : (
          filtered.map((book) => (
            <Card key={book.id} className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{book.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[book.status]}`}>
                      {statusLabels[book.status]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{book.author} · {book.category}</p>
                  
                  {book.status === 'reading' && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-primary-500 h-2 rounded-full transition-all"
                            style={{ width: `${book.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-10 text-right">{book.progress}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={book.progress}
                        onChange={(e) => updateProgress(book.id, parseInt(e.target.value))}
                        className="w-full mt-1 accent-primary-600"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3">
                    {book.status !== 'reading' && (
                      <button
                        onClick={() => updateBookStatus(book.id, 'reading')}
                        className="text-xs px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition-colors"
                      >
                        开始阅读
                      </button>
                    )}
                    {book.status !== 'finished' && (
                      <button
                        onClick={() => updateBookStatus(book.id, 'finished')}
                        className="text-xs px-3 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 transition-colors"
                      >
                        标记已读
                      </button>
                    )}
                    <button
                      onClick={() => { setSelectedBookId(book.id); setShowNoteModal(true); }}
                      className="text-xs px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 transition-colors flex items-center gap-1"
                    >
                      <StickyNote size={12} /> 笔记 ({book.notes.length})
                    </button>
                    <button
                      onClick={() => deleteBook(book.id)}
                      className="text-xs px-3 py-1 rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Add Book Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="添加书籍">
        <div className="space-y-4">
          <Input label="书名" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="输入书名" />
          <Input label="作者" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="输入作者" />
          <Input label="分类" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="如：技术、文学、历史" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button onClick={handleAdd}>添加</Button>
          </div>
        </div>
      </Modal>

      {/* Notes Modal */}
      <Modal isOpen={showNoteModal} onClose={() => { setShowNoteModal(false); setSelectedBookId(null); }} title="读书笔记">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
              placeholder="输入笔记内容..."
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <Button size="sm" onClick={handleAddNote}>添加</Button>
          </div>
          {selectedBookId && books.find(b => b.id === selectedBookId)?.notes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">暂无笔记</p>
          )}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {selectedBookId && books.find(b => b.id === selectedBookId)?.notes.map((note) => (
              <div key={note.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">{note.content}</p>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-gray-400">{new Date(note.createdAt).toLocaleDateString('zh-CN')}</span>
                  <button onClick={() => deleteNote(selectedBookId, note.id)} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};

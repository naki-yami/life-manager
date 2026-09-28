import React, { useState } from 'react';
import { Plus, Trash2, FileText } from 'lucide-react';
import { Card, CardBody, Button, Input, Modal, Select } from '../components/ui';
import { useWritingStore } from '../store/writingStore';
import { WritingType, WritingStatus } from '../types';

export const WritingPage: React.FC = () => {
  const { projects, addProject, deleteProject, updateStatus, updateWordCount, updateNotes } =
    useWritingStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', type: 'article' as WritingType });
  const [notesForm, setNotesForm] = useState('');

  const handleAdd = () => {
    if (!form.title.trim()) return;
    addProject(form.title, form.type);
    setForm({ title: '', type: 'article' });
    setShowAddModal(false);
  };

  const statusLabels: Record<WritingStatus, string> = {
    draft: '草稿',
    'in-progress': '进行中',
    completed: '已完成',
  };

  const typeLabels: Record<WritingType, string> = {
    article: '文章',
    copy: '文案',
    book: '书籍',
  };

  const statusColors: Record<WritingStatus, string> = {
    draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    'in-progress': 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    completed: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">写作</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">管理你的写作项目</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus size={16} className="mr-2" /> 新建项目
        </Button>
      </div>

      <div className="grid gap-4">
        {projects.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-400">暂无写作项目</p>
          </Card>
        ) : (
          projects.map((project) => (
            <Card key={project.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText size={16} className="text-gray-400" />
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {project.title}
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                      {typeLabels[project.type]}
                    </span>
                    <Select
                      value={project.status}
                      onChange={(v) => updateStatus(project.id, v as WritingStatus)}
                      options={Object.entries(statusLabels).map(([k, l]) => ({
                        value: k,
                        label: l,
                      }))}
                      className="w-auto"
                    />
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">字数:</span>
                      <input
                        type="number"
                        value={project.wordCount}
                        onChange={(e) => updateWordCount(project.id, parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <span className="text-xs text-gray-400">
                      更新于 {new Date(project.updatedAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditingId(project.id);
                      setNotesForm(project.notes);
                    }}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500 transition-colors"
                  >
                    <FileText size={16} />
                  </button>
                  <button
                    onClick={() => deleteProject(project.id)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Add Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="新建写作项目">
        <div className="space-y-4">
          <Input
            label="标题"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="输入标题"
          />
          <Select
            label="类型"
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v as WritingType })}
            options={Object.entries(typeLabels).map(([k, l]) => ({ value: k, label: l }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              取消
            </Button>
            <Button onClick={handleAdd}>创建</Button>
          </div>
        </div>
      </Modal>

      {/* Notes Modal */}
      <Modal isOpen={!!editingId} onClose={() => setEditingId(null)} title="创作笔记">
        <div className="space-y-4">
          <textarea
            value={notesForm}
            onChange={(e) => setNotesForm(e.target.value)}
            rows={8}
            placeholder="记录你的创作想法..."
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingId(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (editingId) updateNotes(editingId, notesForm);
                setEditingId(null);
              }}
            >
              保存
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

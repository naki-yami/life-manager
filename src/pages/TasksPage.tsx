import React, { useState } from 'react';
import { Plus, CheckCircle2, Circle, Trash2, Edit3 } from 'lucide-react';
import { Card, CardHeader, CardBody, Button, Input, Modal, Select } from '../components/ui';
import { useTaskStore } from '../store/taskStore';
import { Priority, TaskStatus } from '../types';

export const TasksPage: React.FC = () => {
  const { tasks, addTask, deleteTask, toggleTaskStatus, updateTask } = useTaskStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' as Priority, dueDate: '' });

  const handleAdd = () => {
    if (!form.title.trim()) return;
    addTask(form.title, form.description, form.priority, form.dueDate);
    setForm({ title: '', description: '', priority: 'medium', dueDate: '' });
    setShowAddModal(false);
  };

  const handleEdit = () => {
    if (!editingTaskId || !form.title.trim()) return;
    updateTask(editingTaskId, { title: form.title, description: form.description, priority: form.priority, dueDate: form.dueDate });
    setShowEditModal(false);
    setEditingTaskId(null);
  };

  const openEdit = (task: typeof tasks[0]) => {
    setEditingTaskId(task.id);
    setForm({ title: task.title, description: task.description, priority: task.priority, dueDate: task.dueDate });
    setShowEditModal(true);
  };

  const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  const filtered = tasks
    .filter((t) => filter === 'all' || t.status === filter)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">今日计划</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">管理你的每日任务</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus size={16} className="mr-2" /> 添加任务
        </Button>
      </div>

      <div className="flex gap-2">
        {(['all', 'pending', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === f
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {f === 'all' ? '全部' : f === 'pending' ? '待办' : '已完成'}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-400 dark:text-gray-500">暂无任务</p>
          </Card>
        ) : (
          filtered.map((task) => (
            <Card key={task.id} className="p-4">
              <div className="flex items-center gap-3">
                <button onClick={() => toggleTaskStatus(task.id)} className="shrink-0">
                  {task.status === 'completed' ? (
                    <CheckCircle2 size={22} className="text-green-500" />
                  ) : (
                    <Circle size={22} className="text-gray-300 dark:text-gray-600 hover:text-primary-500 transition-colors" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">{task.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      task.priority === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                      task.priority === 'medium' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {task.priority === 'high' ? '紧急' : task.priority === 'medium' ? '中等' : '低'}
                    </span>
                    {task.dueDate && (
                      <span className="text-xs text-gray-400">{task.dueDate}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(task)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-500 transition-colors">
                    <Edit3 size={16} />
                  </button>
                  <button onClick={() => deleteTask(task.id)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Add Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="添加任务">
        <div className="space-y-4">
          <Input label="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="任务标题" />
          <Input label="描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="任务描述（可选）" multiline rows={3} />
          <Select
            label="优先级"
            value={form.priority}
            onChange={(v) => setForm({ ...form, priority: v as Priority })}
            options={[
              { value: 'high', label: '紧急' },
              { value: 'medium', label: '中等' },
              { value: 'low', label: '低' },
            ]}
          />
          <Input label="截止日期" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button onClick={handleAdd}>添加</Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} onClose={() => { setShowEditModal(false); setEditingTaskId(null); }} title="编辑任务">
        <div className="space-y-4">
          <Input label="标题" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="任务标题" />
          <Input label="描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="任务描述（可选）" multiline rows={3} />
          <Select
            label="优先级"
            value={form.priority}
            onChange={(v) => setForm({ ...form, priority: v as Priority })}
            options={[
              { value: 'high', label: '紧急' },
              { value: 'medium', label: '中等' },
              { value: 'low', label: '低' },
            ]}
          />
          <Input label="截止日期" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setShowEditModal(false); setEditingTaskId(null); }}>取消</Button>
            <Button onClick={handleEdit}>保存</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

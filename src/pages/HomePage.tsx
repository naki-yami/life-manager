import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, BookOpen, Code2, PenTool, Dumbbell, UtensilsCrossed, Gamepad2, Plus, Send, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardBody, Button } from '../components/ui';
import { useTaskStore } from '../store/taskStore';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { tasks, memos, addMemo, deleteMemo } = useTaskStore();
  const [memoInput, setMemoInput] = useState('');

  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const highPriorityTasks = pendingTasks.filter((t) => t.priority === 'high');
  const todayTasks = pendingTasks.slice(0, 5);

  const handleAddMemo = () => {
    if (memoInput.trim()) {
      addMemo(memoInput.trim());
      setMemoInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddMemo();
    }
  };

  const moduleCards = [
    { icon: BookOpen, label: '在读', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', path: '/books' },
    { icon: Code2, label: '项目', color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20', path: '/dev' },
    { icon: PenTool, label: '写作', color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', path: '/writing' },
    { icon: Dumbbell, label: '健身', color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', path: '/fitness' },
    { icon: UtensilsCrossed, label: '饮食', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', path: '/diet' },
    { icon: Gamepad2, label: '游戏', color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-900/20', path: '/games' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">你好 👋</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">今天是 {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-3xl font-bold text-primary-600">{pendingTasks.length}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">待办任务</p>
        </Card>
        <Card className="p-4">
          <p className="text-3xl font-bold text-green-600">{tasks.filter((t) => t.status === 'completed').length}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">已完成</p>
        </Card>
        <Card className="p-4">
          <p className="text-3xl font-bold text-orange-600">{memos.length}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">备忘条</p>
        </Card>
        <Card className="p-4">
          <p className="text-3xl font-bold text-red-600">{highPriorityTasks.length}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">紧急任务</p>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Today's tasks */}
        <Card>
          <CardHeader title="今日待办" subtitle={`${pendingTasks.length} 个待完成`} action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
              查看全部
            </Button>
          } />
          <CardBody>
            {todayTasks.length === 0 ? (
              <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-4">暂无待办任务</p>
            ) : (
              <div className="space-y-2">
                {todayTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    {task.status === 'completed' ? (
                      <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                    ) : (
                      <Circle size={18} className="text-gray-300 dark:text-gray-600 shrink-0" />
                    )}
                    <span className={`text-sm flex-1 ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      {task.title}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      task.priority === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                      task.priority === 'medium' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                      'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {task.priority === 'high' ? '紧急' : task.priority === 'medium' ? '中等' : '低'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Quick Memo */}
        <Card>
          <CardHeader title="快速备忘" subtitle="回车即可保存" />
          <CardBody>
            <div className="flex gap-2 mb-3">
              <input
                value={memoInput}
                onChange={(e) => setMemoInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="输入备忘内容..."
                className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={handleAddMemo}
                className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Send size={16} />
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {memos.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-4">暂无备忘</p>
              ) : (
                memos.slice(0, 10).map((memo) => (
                  <div key={memo.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">{memo.content}</p>
                    <button
                      onClick={() => deleteMemo(memo.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Module overview cards */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">模块概览</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {moduleCards.map((mod) => {
            const Icon = mod.icon;
            return (
              <Card key={mod.path} className="p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(mod.path)}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${mod.bg} flex items-center justify-center`}>
                    <Icon size={20} className={mod.color} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{mod.label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">点击前往</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

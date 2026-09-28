import React, { useState, useRef } from 'react';
import { Download, Upload, Trash2, Sun, Moon, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardBody, Button, Modal } from '../components/ui';
import { useTheme } from '../hooks/useTheme';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useGameStore } from '../store/gameStore';

export const SettingsPage: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [showClearModal, setShowClearModal] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const taskStore = useTaskStore();
  const bookStore = useBookStore();
  const devStore = useDevStore();
  const writingStore = useWritingStore();
  const fitnessStore = useFitnessStore();
  const dietStore = useDietStore();
  const gameStore = useGameStore();

  const handleExport = () => {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      tasks: taskStore.tasks,
      memos: taskStore.memos,
      books: bookStore.books,
      devProjects: devStore.projects,
      writingProjects: writingStore.projects,
      fitnessPlans: fitnessStore.plans,
      fitnessRecords: fitnessStore.records,
      dietRecords: dietStore.records,
      games: gameStore.games,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `life-manager-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        if (data.tasks) {
          data.tasks.forEach((t: any) => taskStore.addTask(t.title, t.description, t.priority, t.dueDate));
        }
        if (data.memos) {
          data.memos.forEach((m: any) => taskStore.addMemo(m.content));
        }
        if (data.books) {
          data.books.forEach((b: any) => {
            bookStore.addBook(b.title, b.author, b.category);
          });
        }
        if (data.devProjects) {
          data.devProjects.forEach((p: any) => devStore.addProject(p.name, p.description));
        }
        if (data.writingProjects) {
          data.writingProjects.forEach((p: any) => writingStore.addProject(p.title, p.type));
        }
        if (data.fitnessPlans) {
          data.fitnessPlans.forEach((p: any) => fitnessStore.addPlan(p.name, p.description));
        }
        if (data.games) {
          data.games.forEach((g: any) => gameStore.addGame(g.name, g.platform));
        }

        setImportStatus('数据导入成功！');
        setTimeout(() => setImportStatus(null), 3000);
      } catch {
        setImportStatus('导入失败：文件格式无效');
        setTimeout(() => setImportStatus(null), 3000);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearAll = () => {
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">数据与设置</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">管理你的应用数据和偏好</p>
      </div>

      {/* Theme */}
      <Card>
        <CardHeader title="主题设置" subtitle="切换亮色/暗色模式" />
        <CardBody>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === 'light' ? <Sun size={20} className="text-yellow-500" /> : <Moon size={20} className="text-blue-400" />}
              <span className="text-gray-700 dark:text-gray-300">{theme === 'light' ? '亮色模式' : '暗色模式'}</span>
            </div>
            <Button onClick={toggleTheme} variant="secondary">
              切换主题
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Export */}
      <Card>
        <CardHeader title="导出数据" subtitle="将所有数据导出为 JSON 文件备份" />
        <CardBody>
          <Button onClick={handleExport}>
            <Download size={16} className="mr-2" /> 导出 JSON
          </Button>
        </CardBody>
      </Card>

      {/* Import */}
      <Card>
        <CardHeader title="导入数据" subtitle="从 JSON 备份文件恢复数据" />
        <CardBody>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} className="mr-2" /> 导入 JSON
          </Button>
          {importStatus && (
            <p className={`text-sm mt-3 ${importStatus.includes('成功') ? 'text-green-500' : 'text-red-500'}`}>
              {importStatus}
            </p>
          )}
        </CardBody>
      </Card>

      {/* Clear Data */}
      <Card>
        <CardHeader title="清除数据" subtitle="删除所有本地数据，此操作不可逆" />
        <CardBody>
          <Button variant="danger" onClick={() => setShowClearModal(true)}>
            <Trash2 size={16} className="mr-2" /> 清除所有数据
          </Button>
        </CardBody>
      </Card>

      {/* Confirm Clear Modal */}
      <Modal isOpen={showClearModal} onClose={() => setShowClearModal(false)} title="确认清除数据">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <AlertTriangle size={24} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">
              此操作将永久删除所有数据，包括任务、书籍、项目、训练记录等。导出备份后确认操作。
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowClearModal(false)}>取消</Button>
            <Button variant="danger" onClick={handleClearAll}>确认清除</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

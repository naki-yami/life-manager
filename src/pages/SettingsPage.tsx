import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  Upload,
  Sun,
  Moon,
  Monitor,
  Trash2,
  AlertTriangle,
  History,
  RotateCcw,
  CheckCircle2,
  Database,
  LayoutGrid,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Modal,
  SegmentedControl,
  Switch,
} from '../components/ui';
import { useTheme } from '../hooks/useTheme';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useGameStore } from '../store/gameStore';
import { useThemeStore } from '../store/themeStore';
import { useUiStore } from '../store/uiStore';
import { BACKUP_MODULES, MODULE_LABELS } from '../services/schemas';
import type { BackupData, BackupModule } from '../services/schemas';
import {
  createAutoSnapshot,
  downloadBackup,
  listAutoSnapshots,
  parseBackup,
  planImport,
  planTotals,
  restoreAutoSnapshot,
} from '../services/backup';
import type { ImportMode, ImportPlan, ParseIssue } from '../services/backup';
import { clearAppStorage, estimateStorageBytes } from '../utils/storageKeys';

/** 从各 store 读取当前全量数据（用 getState 读取，避免订阅与闭包过期） */
function readAllData(): BackupData {
  const taskState = useTaskStore.getState();
  return {
    tasks: taskState.tasks,
    memos: taskState.memos,
    books: useBookStore.getState().books,
    devProjects: useDevStore.getState().projects,
    writingProjects: useWritingStore.getState().projects,
    fitnessPlans: useFitnessStore.getState().plans,
    fitnessRecords: useFitnessStore.getState().records,
    dietRecords: useDietStore.getState().records,
    games: useGameStore.getState().games,
    settings: {
      themeMode: useThemeStore.getState().themeMode,
      density: useUiStore.getState().density,
      sidebarCollapsed: useUiStore.getState().sidebarCollapsed,
    },
  };
}

/** 把导入结果写回各 store。整对象写入，保留 id / 状态 / 时间戳 / 嵌套数组 */
function applyPlan(data: Partial<BackupData>): void {
  if (data.tasks) useTaskStore.getState().replaceTasks(data.tasks);
  if (data.memos) useTaskStore.getState().replaceMemos(data.memos);
  if (data.books) useBookStore.getState().replaceBooks(data.books);
  if (data.devProjects) useDevStore.getState().replaceProjects(data.devProjects);
  if (data.writingProjects) useWritingStore.getState().replaceProjects(data.writingProjects);
  if (data.fitnessPlans) useFitnessStore.getState().replacePlans(data.fitnessPlans);
  if (data.fitnessRecords) useFitnessStore.getState().replaceRecords(data.fitnessRecords);
  if (data.dietRecords) useDietStore.getState().replaceRecords(data.dietRecords);
  if (data.games) useGameStore.getState().replaceGames(data.games);
  const settings = data.settings;
  if (settings) {
    // 旧备份只有二态 theme，按 themeMode 处理
    const mode = settings.themeMode ?? settings.theme;
    if (mode) useThemeStore.getState().setThemeMode(mode);
    if (settings.density) useUiStore.getState().setDensity(settings.density);
    if (typeof settings.sidebarCollapsed === 'boolean') {
      useUiStore.getState().setSidebarCollapsed(settings.sidebarCollapsed);
    }
  }
}

/** 只清空各 store 的内存状态（不清 localStorage，localStorage 由 clearAppStorage 负责） */
function resetStores(): void {
  useTaskStore.getState().replaceTasks([]);
  useTaskStore.getState().replaceMemos([]);
  useBookStore.getState().replaceBooks([]);
  useDevStore.getState().replaceProjects([]);
  useWritingStore.getState().replaceProjects([]);
  useFitnessStore.getState().replacePlans([]);
  useFitnessStore.getState().replaceRecords([]);
  useDietStore.getState().replaceRecords([]);
  useGameStore.getState().replaceGames([]);
  // 外观也回到默认，避免「清除数据」后还停留在上一次的皮肤
  useThemeStore.getState().setThemeMode('system');
  useUiStore.getState().setDensity('comfortable');
  useUiStore.getState().setSidebarCollapsed(false);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const MODE_OPTIONS: { value: ImportMode; label: string; hint: string }[] = [
  { value: 'merge', label: '合并', hint: '保留现有数据，只补充备份中没有的条目（按 id 去重）' },
  { value: 'append', label: '追加', hint: '全部追加进来，id 冲突时自动分配新 id' },
  { value: 'overwrite', label: '覆盖', hint: '用备份完全替换对应模块，现有数据会被清掉' },
];

export const SettingsPage: React.FC = () => {
  const { themeMode, setThemeMode } = useTheme();
  const { density, setDensity } = useUiStore();
  const navigate = useNavigate();
  const [showClearModal, setShowClearModal] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [parsed, setParsed] = useState<{ plan: ImportPlan; warnings: ParseIssue[] } | null>(null);
  const [importErrors, setImportErrors] = useState<ParseIssue[]>([]);
  const [snapshots, setSnapshots] = useState(() => listAutoSnapshots());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 用选择器订阅各模块条数：数据变化时概览会自动刷新，且不会引起无关重渲染
  const taskCount = useTaskStore((s) => s.tasks.length);
  const memoCount = useTaskStore((s) => s.memos.length);
  const bookCount = useBookStore((s) => s.books.length);
  const devCount = useDevStore((s) => s.projects.length);
  const writingCount = useWritingStore((s) => s.projects.length);
  const planCount = useFitnessStore((s) => s.plans.length);
  const recordCount = useFitnessStore((s) => s.records.length);
  const dietCount = useDietStore((s) => s.records.length);
  const gameCount = useGameStore((s) => s.games.length);

  const counts: { module: BackupModule; label: string; count: number }[] = [
    { module: 'tasks', label: MODULE_LABELS.tasks, count: taskCount },
    { module: 'memos', label: MODULE_LABELS.memos, count: memoCount },
    { module: 'books', label: MODULE_LABELS.books, count: bookCount },
    { module: 'devProjects', label: MODULE_LABELS.devProjects, count: devCount },
    { module: 'writingProjects', label: MODULE_LABELS.writingProjects, count: writingCount },
    { module: 'fitnessPlans', label: MODULE_LABELS.fitnessPlans, count: planCount },
    { module: 'fitnessRecords', label: MODULE_LABELS.fitnessRecords, count: recordCount },
    { module: 'dietRecords', label: MODULE_LABELS.dietRecords, count: dietCount },
    { module: 'games', label: MODULE_LABELS.games, count: gameCount },
  ];

  const storageBytes = estimateStorageBytes();

  const flash = useCallback((message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus(null), 4000);
  }, []);

  const handleExport = (): void => {
    const fileName = downloadBackup(readAllData());
    flash(`已导出 ${fileName}`);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result ?? '');
      const result = parseBackup(text);
      if (!result.ok) {
        setImportErrors(result.errors);
        setParsed(null);
        return;
      }
      setImportErrors([]);
      setParsed({
        plan: planImport(readAllData(), result.backup.modules, importMode),
        warnings: result.backup.warnings,
      });
    };
    reader.onerror = () => setImportErrors([{ path: '(文件)', message: '读取文件失败' }]);
    reader.readAsText(file);
  };

  const handleConfirmImport = (): void => {
    if (!parsed) return;
    createAutoSnapshot('导入备份前');
    applyPlan(parsed.plan.data);
    const totals = planTotals(parsed.plan.stats);
    setParsed(null);
    setSnapshots(listAutoSnapshots());
    flash(`导入完成：新增 ${totals.added} 条，跳过重复 ${totals.skipped} 条`);
  };

  const handleClearAll = (): void => {
    createAutoSnapshot('清除所有数据前');
    clearAppStorage();
    resetStores();
    setShowClearModal(false);
    setSnapshots(listAutoSnapshots());
    flash('已清除本应用的全部数据（可通过自动备份回滚）');
  };

  const handleRestore = (key: string): void => {
    if (!restoreAutoSnapshot(key)) {
      flash('回滚失败：快照已损坏');
      return;
    }
    window.location.reload();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">数据与设置</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">管理你的应用数据和偏好</p>
      </div>

      {status && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{status}</span>
        </div>
      )}

      {/* Theme */}
      {/* 外观 */}
      <Card>
        <CardHeader title="外观" subtitle="主题模式与界面密度，会随备份一起导出" />
        <CardBody>
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium text-content-secondary">主题模式</p>
              <SegmentedControl
                label="主题模式"
                value={themeMode}
                onChange={setThemeMode}
                options={[
                  { value: 'light', label: '亮色', icon: <Sun size={14} /> },
                  { value: 'dark', label: '暗色', icon: <Moon size={14} /> },
                  { value: 'system', label: '跟随系统', icon: <Monitor size={14} /> },
                ]}
              />
            </div>
            <Switch
              checked={density === 'compact'}
              onChange={(next) => setDensity(next ? 'compact' : 'comfortable')}
              label="紧凑密度"
              description="收紧页面留白，一屏能放下更多内容"
            />
          </div>
        </CardBody>
      </Card>
      {/* Data overview */}
      <Card>
        <CardHeader
          title="数据概览"
          subtitle={`本应用占用本地存储约 ${formatBytes(storageBytes)}`}
        />
        <CardBody>
          <div className="grid grid-cols-3 gap-3">
            {counts.map((item) => (
              <div
                key={item.module}
                className="rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2"
              >
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                  {item.count}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.label}</p>
              </div>
            ))}
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
        <CardHeader title="导入数据" subtitle="导入前会先校验并预览，确认后才会写入" />
        <CardBody className="space-y-4">
          <div className="space-y-2">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setImportMode(option.value)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                  importMode === option.value
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/40'
                }`}
              >
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {option.label}
                </span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            className="hidden"
          />
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} className="mr-2" /> 选择备份文件
          </Button>

          {importErrors.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 space-y-1">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                导入失败：备份文件无法解析
              </p>
              {importErrors.slice(0, 5).map((issue) => (
                <p key={issue.path} className="text-xs text-red-600 dark:text-red-400">
                  {issue.path} — {issue.message}
                </p>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Auto backups */}
      <Card>
        <CardHeader
          title="自动备份"
          subtitle="每次导入或清除数据前都会自动留一份快照，最多保留 10 份"
        />
        <CardBody>
          {snapshots.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              还没有快照。执行一次导入或清除数据后会自动生成。
            </p>
          ) : (
            <ul className="space-y-2">
              {snapshots.map((snapshot) => (
                <li
                  key={snapshot.key}
                  className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2">
                      <History size={14} className="shrink-0" />
                      <span className="truncate">{snapshot.reason || '快照'}</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {snapshot.createdAt
                        ? new Date(snapshot.createdAt).toLocaleString('zh-CN')
                        : '时间未知'}{' '}
                      · {formatBytes(snapshot.size)}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => handleRestore(snapshot.key)}>
                    <RotateCcw size={14} className="mr-1.5" /> 回滚
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Component gallery */}
      <Card>
        <CardHeader title="组件预览" subtitle="开发用：查看设计系统里全部组件与状态" />
        <CardBody>
          <Button variant="secondary" onClick={() => navigate('/ui')}>
            <LayoutGrid size={16} className="mr-2" /> 打开组件预览
          </Button>
        </CardBody>
      </Card>

      {/* Clear Data */}
      <Card>
        <CardHeader title="清除数据" subtitle="删除本应用的全部本地数据，此操作不可逆" />
        <CardBody>
          <Button variant="danger" onClick={() => setShowClearModal(true)}>
            <Trash2 size={16} className="mr-2" /> 清除所有数据
          </Button>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1.5">
            <Database size={12} />
            只会删除本应用（lm: 前缀）的数据，不会影响同一浏览器下的其他项目。
          </p>
        </CardBody>
      </Card>

      {/* Import preview modal */}
      <Modal isOpen={parsed !== null} onClose={() => setParsed(null)} title="确认导入">
        {parsed && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 p-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                模式：
                <span className="font-medium">
                  {MODE_OPTIONS.find((o) => o.value === importMode)?.label}
                </span>
                ，共将新增{' '}
                <span className="font-semibold text-primary-600">
                  {planTotals(parsed.plan.stats).added}
                </span>{' '}
                条
                {planTotals(parsed.plan.stats).skipped > 0 && (
                  <>
                    ，跳过重复{' '}
                    <span className="font-semibold">{planTotals(parsed.plan.stats).skipped}</span>{' '}
                    条
                  </>
                )}
              </p>
            </div>

            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 dark:text-gray-400">
                    <th className="text-left font-medium py-1">模块</th>
                    <th className="text-right font-medium py-1">备份中</th>
                    <th className="text-right font-medium py-1">新增</th>
                    <th className="text-right font-medium py-1">跳过</th>
                  </tr>
                </thead>
                <tbody>
                  {BACKUP_MODULES.map((module: BackupModule) => {
                    const row = parsed.plan.stats[module];
                    if (row.incoming === 0) return null;
                    return (
                      <tr key={module} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="py-1.5 text-gray-700 dark:text-gray-200">
                          {MODULE_LABELS[module]}
                        </td>
                        <td className="py-1.5 text-right text-gray-500 dark:text-gray-400 tabular-nums">
                          {row.incoming}
                        </td>
                        <td className="py-1.5 text-right text-green-600 dark:text-green-400 tabular-nums">
                          {row.added}
                        </td>
                        <td className="py-1.5 text-right text-gray-400 tabular-nums">
                          {row.skipped}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {parsed.warnings.length > 0 && (
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3 space-y-1 max-h-32 overflow-y-auto">
                <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
                  有 {parsed.warnings.length} 条数据未通过校验，已被跳过：
                </p>
                {parsed.warnings.slice(0, 5).map((warning) => (
                  <p key={warning.path} className="text-xs text-yellow-700 dark:text-yellow-400">
                    {warning.path} — {warning.message}
                  </p>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-500 dark:text-gray-400">
              导入前会自动生成一份快照，导入后可在「自动备份」中回滚。
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setParsed(null)}>
                取消
              </Button>
              <Button onClick={handleConfirmImport}>确认导入</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Clear Modal */}
      <Modal isOpen={showClearModal} onClose={() => setShowClearModal(false)} title="确认清除数据">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <AlertTriangle size={24} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">
              将删除本应用的全部数据（任务、书籍、项目、训练记录等）。清除前会自动生成快照，可回滚。
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowClearModal(false)}>
              取消
            </Button>
            <Button variant="danger" onClick={handleClearAll}>
              确认清除
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

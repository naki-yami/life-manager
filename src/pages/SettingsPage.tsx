import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database,
  Download,
  History,
  LayoutGrid,
  Monitor,
  Moon,
  RotateCcw,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Modal,
  RadioGroup,
  SegmentedControl,
  Spinner,
  Switch,
  useToast,
} from '../components/ui';
import { PageHeader } from '../components/layout';
import { useTheme } from '../hooks/useTheme';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useGameStore } from '../store/gameStore';
import { useHabitStore } from '../store/habitStore';
import { useBodyStore } from '../store/bodyStore';
import { useThemeStore } from '../store/themeStore';
import { useUiStore } from '../store/uiStore';
import { BACKUP_MODULES, MODULE_LABELS } from '../services/schemas';
import type { BackupData, BackupModule } from '../services/schemas';
import {
  clearAutoSnapshots,
  createAutoSnapshot,
  downloadBackup,
  listAutoSnapshots,
  parseBackup,
  planImport,
  planTotals,
  restoreAutoSnapshot,
} from '../services/backup';
import type { ImportMode, ImportPlan, ParseIssue } from '../services/backup';
import { MAX_AUTO_BACKUPS, clearAppStorage, getStorageUsage } from '../utils/storageKeys';
import { Kbd } from '../components/ui';

/** 快捷键说明表的数据；与 useShortcuts 里真正实现的按键保持一致 */
const SHORTCUT_ROWS: Array<{ keys: string; action: string }> = [
  { keys: 'Ctrl / ⌘ K', action: '打开命令面板（跳转页面、切换外观）' },
  { keys: '/', action: '打开命令面板搜索' },
  { keys: 'n', action: '新建当前模块的条目' },
  { keys: 'Esc', action: '关闭弹层与抽屉' },
  { keys: 'g 后接 1-9', action: '跳转到对应的主页面（1 首页、2 今日计划、3 读书…）' },
];


/** 从各 store 读取当前全量数据（用 getState 读取，避免订阅与闭包过期） */
function readAllData(): BackupData {
  const taskState = useTaskStore.getState();
  return {
    tasks: taskState.tasks,
    memos: taskState.memos,
    books: useBookStore.getState().books,
    devProjects: useDevStore.getState().projects,
    workSessions: useDevStore.getState().sessions,
    writingProjects: useWritingStore.getState().projects,
    fitnessPlans: useFitnessStore.getState().plans,
    fitnessRecords: useFitnessStore.getState().records,
    bodyMetrics: useBodyStore.getState().records,
    dietRecords: useDietStore.getState().records,
    games: useGameStore.getState().games,
    gameSessions: useGameStore.getState().sessions,
    readingSessions: useBookStore.getState().sessions,
    habits: useHabitStore.getState().habits,
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
  if (data.workSessions) useDevStore.getState().replaceSessions(data.workSessions);
  if (data.writingProjects) useWritingStore.getState().replaceProjects(data.writingProjects);
  if (data.fitnessPlans) useFitnessStore.getState().replacePlans(data.fitnessPlans);
  if (data.fitnessRecords) useFitnessStore.getState().replaceRecords(data.fitnessRecords);
  if (data.bodyMetrics) useBodyStore.getState().replaceRecords(data.bodyMetrics);
  if (data.dietRecords) useDietStore.getState().replaceRecords(data.dietRecords);
  if (data.games) useGameStore.getState().replaceGames(data.games);
  if (data.gameSessions) useGameStore.getState().replaceSessions(data.gameSessions);
  if (data.readingSessions) useBookStore.getState().replaceSessions(data.readingSessions);
  if (data.habits) useHabitStore.getState().replaceHabits(data.habits);
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
  useDevStore.getState().replaceSessions([]);
  useWritingStore.getState().replaceProjects([]);
  useFitnessStore.getState().replacePlans([]);
  useFitnessStore.getState().replaceRecords([]);
  useBodyStore.getState().replaceRecords([]);
  useDietStore.getState().replaceRecords([]);
  useGameStore.getState().replaceGames([]);
  useGameStore.getState().replaceSessions([]);
  useHabitStore.getState().replaceHabits([]);
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
  const density = useUiStore((state) => state.density);
  const setDensity = useUiStore((state) => state.setDensity);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showClearSnapshotsDialog, setShowClearSnapshotsDialog] = useState(false);
  const [restoreKey, setRestoreKey] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [parsed, setParsed] = useState<{ plan: ImportPlan; warnings: ParseIssue[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<ParseIssue[]>([]);
  const [snapshots, setSnapshots] = useState(() => listAutoSnapshots());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 用选择器订阅各模块条数：数据变化时概览会自动刷新，且不会引起无关重渲染
  const taskCount = useTaskStore((state) => state.tasks.length);
  const memoCount = useTaskStore((state) => state.memos.length);
  const bookCount = useBookStore((state) => state.books.length);
  const devCount = useDevStore((state) => state.projects.length);
  const workSessionCount = useDevStore((state) => state.sessions.length);
  const writingCount = useWritingStore((state) => state.projects.length);
  const planCount = useFitnessStore((state) => state.plans.length);
  const recordCount = useFitnessStore((state) => state.records.length);
  const bodyCount = useBodyStore((state) => state.records.length);
  const dietCount = useDietStore((state) => state.records.length);
  const gameCount = useGameStore((state) => state.games.length);
  const sessionCount = useGameStore((state) => state.sessions.length);
  const readingSessionCount = useBookStore((state) => state.sessions.length);
  const habitCount = useHabitStore((state) => state.habits.length);

  const counts: { module: BackupModule; label: string; count: number }[] = [
    { module: 'tasks', label: MODULE_LABELS.tasks, count: taskCount },
    { module: 'memos', label: MODULE_LABELS.memos, count: memoCount },
    { module: 'books', label: MODULE_LABELS.books, count: bookCount },
    { module: 'devProjects', label: MODULE_LABELS.devProjects, count: devCount },
    { module: 'workSessions', label: MODULE_LABELS.workSessions, count: workSessionCount },
    { module: 'writingProjects', label: MODULE_LABELS.writingProjects, count: writingCount },
    { module: 'fitnessPlans', label: MODULE_LABELS.fitnessPlans, count: planCount },
    { module: 'fitnessRecords', label: MODULE_LABELS.fitnessRecords, count: recordCount },
    { module: 'bodyMetrics', label: MODULE_LABELS.bodyMetrics, count: bodyCount },
    { module: 'dietRecords', label: MODULE_LABELS.dietRecords, count: dietCount },
    { module: 'games', label: MODULE_LABELS.games, count: gameCount },
    { module: 'gameSessions', label: MODULE_LABELS.gameSessions, count: sessionCount },
    { module: 'readingSessions', label: MODULE_LABELS.readingSessions, count: readingSessionCount },
    { module: 'habits', label: MODULE_LABELS.habits, count: habitCount },
  ];

  const totalEntries = counts.reduce((sum, item) => sum + item.count, 0);
  const usage = getStorageUsage();

  const handleExport = useCallback((): void => {
    const fileName = downloadBackup(readAllData());
    toast({
      title: '已导出备份',
      description: `${fileName} · 共 ${totalEntries} 条数据`,
      tone: 'success',
    });
  }, [toast, totalEntries]);

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    // 备份文件可能很大，读盘期间给个进度反馈，别让按钮看起来没反应
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setImporting(false);
      const text = String(loadEvent.target?.result ?? '');
      const result = parseBackup(text);
      if (!result.ok) {
        setImportErrors(result.errors);
        setParsed(null);
        toast({
          title: '备份文件无法解析',
          description: result.errors[0]?.message,
          tone: 'danger',
        });
        return;
      }
      setImportErrors([]);
      setParsed({
        plan: planImport(readAllData(), result.backup.modules, importMode),
        warnings: result.backup.warnings,
      });
    };
    reader.onerror = () => {
      setImporting(false);
      setImportErrors([{ path: '(文件)', message: '读取文件失败' }]);
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = (): void => {
    if (!parsed) return;
    createAutoSnapshot('导入备份前');
    applyPlan(parsed.plan.data);
    const totals = planTotals(parsed.plan.stats);
    setParsed(null);
    setSnapshots(listAutoSnapshots());
    toast({
      title: '导入完成',
      description: `新增 ${totals.added} 条，跳过重复 ${totals.skipped} 条`,
      tone: 'success',
    });
  };

  const handleClearAll = (): void => {
    createAutoSnapshot('清除所有数据前');
    clearAppStorage();
    resetStores();
    setShowClearDialog(false);
    setSnapshots(listAutoSnapshots());
    toast({
      title: '已清除全部数据',
      description: '需要恢复的话，可以在「自动备份」里回滚。',
      tone: 'info',
    });
  };

  const handleClearSnapshots = (): void => {
    const removed = clearAutoSnapshots();
    setShowClearSnapshotsDialog(false);
    setSnapshots(listAutoSnapshots());
    toast({
      title: '已删除全部快照',
      description: `${removed.length} 份快照已清除，之后无法再回滚（当前数据不受影响）。`,
      tone: 'warning',
    });
  };

  const handleConfirmRestore = (): void => {
    const key = restoreKey;
    setRestoreKey(null);
    if (!key || !restoreAutoSnapshot(key)) {
      toast({ title: '回滚失败', description: '快照可能已损坏。', tone: 'danger' });
      return;
    }
    window.location.reload();
  };

  const importTotals = parsed ? planTotals(parsed.plan.stats) : null;

  return (
    <div className="space-y-section">
      <PageHeader
        title="数据与设置"
        description="外观、本地存储与数据备份都在这里"
        icon={SettingsIcon}
        meta={
          <Badge tone="default">
            共 {totalEntries} 条数据 · 占用 {formatBytes(usage.bytes)}
          </Badge>
        }
      />

      <Card>
        <CardHeader title="外观" subtitle="主题模式与界面密度会随备份一起导出" />
        <CardBody>
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium text-content-secondary">主题模式</p>
              <SegmentedControl
                label="主题模式"
                value={themeMode}
                onChange={setThemeMode}
                options={[
                  { value: 'light', label: '亮色', icon: <Sun size={14} aria-hidden /> },
                  { value: 'dark', label: '暗色', icon: <Moon size={14} aria-hidden /> },
                  { value: 'system', label: '跟随系统', icon: <Monitor size={14} aria-hidden /> },
                ]}
              />
            </div>
            <Switch
              checked={density === 'compact'}
              onChange={(next) => setDensity(next ? 'compact' : 'comfortable')}
              label="紧凑密度"
              description="收紧页面留白，一屏能放下更多内容"
            />
            <Switch
              checked={sidebarCollapsed}
              onChange={setSidebarCollapsed}
              label="折叠侧边栏"
              description="只显示图标，给内容让出宽度（大屏生效）"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="快捷键" subtitle="在任何页面都能用（输入框里打字时不会触发）" />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-xs text-content-tertiary">
                  <th scope="col" className="py-2 pr-4 font-medium">按键</th>
                  <th scope="col" className="py-2 font-medium">作用</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {SHORTCUT_ROWS.map((row) => (
                  <tr key={row.keys}>
                    <td className="py-2 pr-4 align-top"><Kbd>{row.keys}</Kbd></td>
                    <td className="py-2 text-content-secondary">{row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="数据概览"
          subtitle={`本应用占用本地存储约 ${formatBytes(usage.bytes)}`}
        />
        <CardBody>
          {usage.level === 'warning' && (
            <Alert tone="warning" title="本地存储快满了" className="mb-3">
              已用 {formatBytes(usage.bytes)}，接近浏览器给单个站点的上限（约 5MB）。
              建议先在上方导出备份，再到下面删除不需要的自动快照。
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {counts.map((item) => (
              <div key={item.module} className="rounded bg-inset px-3 py-2">
                <p className="text-lg font-semibold text-content tabular">{item.count}</p>
                <p className="mt-0.5 text-xs text-content-tertiary">{item.label}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="导出数据" subtitle="导出为 JSON 文件，包含全部模块与外观设置" />
        <CardBody>
          <Button icon={<Download size={16} aria-hidden />} onClick={handleExport}>
            导出 JSON
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="导入数据" subtitle="导入前会先校验并预览，确认后才会写入" />
        <CardBody className="space-y-4">
          <RadioGroup
            name="import-mode"
            label="导入方式"
            value={importMode}
            onChange={(value) => setImportMode(value as ImportMode)}
            options={MODE_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
              description: option.hint,
            }))}
          />

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              aria-label="选择备份文件"
              className="hidden"
            />
            <Button
              variant="secondary"
              icon={importing ? <Spinner size={16} /> : <Upload size={16} aria-hidden />}
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? '正在读取…' : '选择备份文件'}
            </Button>
          </div>

          {importErrors.length > 0 && (
            <Alert tone="danger" title="导入失败：备份文件无法解析">
              <ul className="space-y-0.5">
                {importErrors.slice(0, 5).map((issue) => (
                  <li key={issue.path}>
                    {issue.path} — {issue.message}
                  </li>
                ))}
              </ul>
            </Alert>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="自动备份"
          subtitle={`每次导入或清除数据前都会自动留一份快照，最多保留 ${MAX_AUTO_BACKUPS} 份`}
          action={
            snapshots.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={14} aria-hidden />}
                onClick={() => setShowClearSnapshotsDialog(true)}
              >
                清除快照
              </Button>
            ) : undefined
          }
        />
        <CardBody>
          {snapshots.length === 0 ? (
            <EmptyState
              icon={<History size={20} aria-hidden />}
              title="还没有快照"
              description="执行一次导入或清除数据后，这里会自动出现可回滚的快照。"
              className="py-6"
            />
          ) : (
            <ul className="space-y-2">
              {snapshots.map((snapshot) => (
                <li
                  key={snapshot.key}
                  className="flex items-center justify-between gap-3 rounded bg-inset px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm text-content">
                      <History size={14} className="shrink-0 text-content-tertiary" aria-hidden />
                      <span className="truncate">{snapshot.reason || '快照'}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-content-tertiary">
                      {snapshot.createdAt
                        ? new Date(snapshot.createdAt).toLocaleString('zh-CN')
                        : '时间未知'}{' '}
                      · {formatBytes(snapshot.size)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<RotateCcw size={14} aria-hidden />}
                    onClick={() => setRestoreKey(snapshot.key)}
                  >
                    回滚
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="组件预览" subtitle="开发用：查看设计系统里全部组件与状态" />
        <CardBody>
          <Button
            variant="secondary"
            icon={<LayoutGrid size={16} aria-hidden />}
            onClick={() => navigate('/ui')}
          >
            打开组件预览
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="清除数据" subtitle="删除本应用的全部本地数据，此操作不可逆" />
        <CardBody className="space-y-4">
          <Alert tone="warning" title="只影响本应用">
            <span className="flex items-center gap-1.5">
              <Database size={12} aria-hidden />
              只会删除本应用（lm: 前缀）的数据，不会影响同一浏览器下的其他项目。
            </span>
          </Alert>
          <Button
            variant="danger"
            icon={<Trash2 size={16} aria-hidden />}
            onClick={() => setShowClearDialog(true)}
          >
            清除所有数据
          </Button>
        </CardBody>
      </Card>

      <Modal
        isOpen={parsed !== null}
        onClose={() => setParsed(null)}
        title="确认导入"
        description="确认后会先自动生成一份快照，方便随时回滚"
        footer={
          <>
            <Button variant="secondary" onClick={() => setParsed(null)}>
              取消
            </Button>
            <Button onClick={handleConfirmImport}>确认导入</Button>
          </>
        }
      >
        {parsed && importTotals && (
          <div className="space-y-4">
            <p className="text-sm text-content-secondary">
              模式：
              <span className="font-medium text-content">
                {MODE_OPTIONS.find((option) => option.value === importMode)?.label}
              </span>
              ，共将新增{' '}
              <span className="font-semibold text-accent tabular">{importTotals.added}</span> 条
              {importTotals.skipped > 0 && (
                <>
                  ，跳过重复 <span className="font-semibold tabular">{importTotals.skipped}</span>{' '}
                  条
                </>
              )}
            </p>

            <div className="max-h-56 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-content-tertiary">
                    <th scope="col" className="py-1 text-left font-medium">
                      模块
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      备份中
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      新增
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      跳过
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {BACKUP_MODULES.map((module: BackupModule) => {
                    const row = parsed.plan.stats[module];
                    if (row.incoming === 0) return null;
                    return (
                      <tr key={module} className="border-t border-line-subtle">
                        <td className="py-1.5 text-content-secondary">{MODULE_LABELS[module]}</td>
                        <td className="py-1.5 text-right text-content-tertiary tabular">
                          {row.incoming}
                        </td>
                        <td className="py-1.5 text-right text-success tabular">{row.added}</td>
                        <td className="py-1.5 text-right text-content-tertiary tabular">
                          {row.skipped}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {parsed.warnings.length > 0 && (
              <Alert
                tone="warning"
                title={`有 ${parsed.warnings.length} 条数据未通过校验，已被跳过`}
              >
                <ul className="max-h-32 space-y-0.5 overflow-y-auto">
                  {parsed.warnings.slice(0, 5).map((warning) => (
                    <li key={warning.path}>
                      {warning.path} — {warning.message}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={showClearDialog}
        onClose={() => setShowClearDialog(false)}
        onConfirm={handleClearAll}
        title="清除所有数据"
        description="将删除本应用（lm: 前缀）的全部数据：任务、备忘、书籍、项目、训练与饮食记录、游戏。清除前会自动生成一份快照（快照本身不会被清除），之后可以在「自动备份」里回滚。"
        confirmText="确认清除"
        requireText="清除"
        tone="danger"
      />

      <ConfirmDialog
        isOpen={showClearSnapshotsDialog}
        onClose={() => setShowClearSnapshotsDialog(false)}
        onConfirm={handleClearSnapshots}
        title="删除全部快照"
        description={`${snapshots.length} 份快照将被删除，之后无法再回滚到之前的状态（当前数据不受影响）。`}
        confirmText="删除快照"
        tone="danger"
      />

      <ConfirmDialog
        isOpen={restoreKey !== null}
        onClose={() => setRestoreKey(null)}
        onConfirm={handleConfirmRestore}
        title="回滚到这份快照"
        description="当前数据会被快照内容覆盖，页面随后会刷新。"
        confirmText="回滚并刷新"
      />
    </div>
  );
};

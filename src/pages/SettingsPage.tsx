import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Book, Game } from '../types';
import { formatNumber } from '../utils/date';
import {
  Database,
  Download,
  FolderOpen,
  History,
  LayoutGrid,
  Monitor,
  Moon,
  RefreshCw,
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
  Select,
} from '../components/ui';
import { PageHeader } from '../components/layout';
import { useTheme } from '../hooks/useTheme';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import {
  CSV_SOURCES,
  planBookCsvImport,
  planGameCsvImport,
  type CsvImportPlan,
  type CsvImportSource,
} from '../services/csvImport';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useGameStore } from '../store/gameStore';
import { useHabitStore } from '../store/habitStore';
import { useBodyStore } from '../store/bodyStore';
import { useFocusStore } from '../store/focusStore';
import { useReviewStore } from '../store/reviewStore';
import { useJournalStore } from '../store/journalStore';
import { useGoalStore } from '../store/goalStore';
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
import type { AutoSnapshot, ImportMode, ImportPlan, ParseIssue } from '../services/backup';
import { readAllData } from '../services/appData';
import {
  FOLDER_BACKUP_FILE,
  chooseFolderBackupFolder,
  forgetFolderBackupFolder,
  getFolderBackupStatus,
  isFolderBackupSupported,
  isFolderPickerAbort,
  writeFolderBackupNow,
} from '../services/folderSync';
import type { FolderBackupStatus } from '../services/folderSync';
import { MAX_AUTO_BACKUPS } from '../utils/storageKeys';
import { clearAppData, measureAppStorage } from '../store/storage';
import type { AppStorageUsage } from '../store/storage';
import { Kbd } from '../components/ui';

/** 快捷键说明表的数据；与 useShortcuts 里真正实现的按键保持一致 */
const SHORTCUT_ROWS: Array<{ keys: string; action: string }> = [
  { keys: 'Ctrl / ⌘ K', action: '打开命令面板（跳转页面、切换外观）' },
  { keys: '/', action: '打开命令面板搜索' },
  { keys: 'n', action: '新建当前模块的条目' },
  { keys: 'Esc', action: '关闭弹层与抽屉' },
  { keys: 'g 后接 1-9', action: '跳转到对应的主页面（1 首页、2 今日计划、3 读书…）' },
];

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
  if (data.focusSessions) useFocusStore.getState().replaceSessions(data.focusSessions);
  if (data.reviews) useReviewStore.getState().replaceReviews(data.reviews);
  if (data.journal) useJournalStore.getState().replaceEntries(data.journal);
  if (data.goals) useGoalStore.getState().replaceGoals(data.goals);
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

/** 只清空各 store 的内存状态（落盘那一步由 clearAppData 负责，这里不碰存储） */
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
  useFocusStore.getState().replaceSessions([]);
  useReviewStore.getState().replaceReviews([]);
  useJournalStore.getState().replaceEntries([]);
  useGoalStore.getState().replaceGoals([]);
  // 进行中的专注也要停掉：清空数据后还挂着一个秒表，只会让人以为没清干净
  useFocusStore.getState().cancelFocus();
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

/** 出错时给用户看的那句话；拿不到 message 就退回到一句通用文案 */
function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '未知错误';
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN');
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
  const [snapshots, setSnapshots] = useState<AutoSnapshot[]>([]);
  const [usage, setUsage] = useState<AppStorageUsage | null>(null);
  const [folderStatus, setFolderStatus] = useState<FolderBackupStatus | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderSupported = isFolderBackupSupported();

  /**
   * 重新读一遍存储占用与快照。
   *
   * 数据现在可能落在 IndexedDB 里，读取是异步的，不能再像以前那样在渲染里同步取值；
   * 读不出来也只影响这两块显示，不该把整个设置页拖下水。
   */
  const refreshStorage = useCallback(async (): Promise<void> => {
    try {
      const [nextUsage, nextSnapshots, nextFolder] = await Promise.all([
        measureAppStorage(),
        listAutoSnapshots(),
        getFolderBackupStatus(),
      ]);
      setUsage(nextUsage);
      setSnapshots(nextSnapshots);
      setFolderStatus(nextFolder);
    } catch (error) {
      console.error('[Life Manager] 读取本地存储状态失败。', error);
    }
  }, []);

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
  const focusCount = useFocusStore((state) => state.sessions.length);
  const reviewCount = useReviewStore((state) => state.reviews.length);
  const journalCount = useJournalStore((state) => state.entries.length);
  const goalCount = useGoalStore((state) => state.goals.length);

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
    { module: 'focusSessions', label: MODULE_LABELS.focusSessions, count: focusCount },
    { module: 'reviews', label: MODULE_LABELS.reviews, count: reviewCount },
    { module: 'journal', label: MODULE_LABELS.journal, count: journalCount },
    { module: 'goals', label: MODULE_LABELS.goals, count: goalCount },
  ];

  const totalEntries = counts.reduce((sum, item) => sum + item.count, 0);

  // 条数一变就重算占用（导入、清除之后的刷新也走这条路径）
  useEffect(() => {
    void refreshStorage();
  }, [refreshStorage, totalEntries]);

  // ---------- 外部导入（F10）：CSV 预览与写入 ----------
  const [csvSource, setCsvSource] = useState<CsvImportSource>('goodreads');
  const [csvPlan, setCsvPlan] = useState<
    ((CsvImportPlan<Book, 'books'> | CsvImportPlan<Game, 'games'>) & { fileName: string }) | null
  >(null);
  const [csvBusy, setCsvBusy] = useState(false);

  const currentSource = CSV_SOURCES.find((source) => source.id === csvSource)!;

  const handleCsvFile = async (file: File): Promise<void> => {
    setCsvBusy(true);
    try {
      const text = await file.text();
      const plan =
        csvSource === 'steam'
          ? planGameCsvImport(text, useGameStore.getState().games)
          : planBookCsvImport(csvSource, text, useBookStore.getState().books);
      setCsvPlan({ ...plan, fileName: file.name });
    } finally {
      setCsvBusy(false);
    }
  };

  const confirmCsvImport = (): void => {
    if (!csvPlan || csvPlan.toAdd.length === 0) return;
    // 写库前先留一份快照，和「导入数据」卡的安全网保持一致
    void (async () => {
      const { createAutoSnapshot } = await import('../services/backup');
      createAutoSnapshot('外部导入前');
      if (csvPlan.target === 'books') {
        const books = useBookStore.getState().books;
        useBookStore.getState().replaceBooks([...books, ...csvPlan.toAdd]);
      } else {
        const games = useGameStore.getState().games;
        useGameStore.getState().replaceGames([...games, ...csvPlan.toAdd]);
      }
      toast({
        tone: 'success',
        title: `已导入 ${csvPlan.toAdd.length} 条`,
        description: `来源：${csvPlan.fileName}（去重跳过 ${csvPlan.skipped} 条）。`,
      });
      setCsvPlan(null);
    })();
  };

  const handleExport = useCallback((): void => {
    const fileName = downloadBackup(readAllData());
    toast({
      title: '已导出备份',
      description: `${fileName} · 共 ${totalEntries} 条数据`,
      tone: 'success',
    });
  }, [toast, totalEntries]);

  /** 选（或换）一个备份文件夹：会弹系统授权框，所以必须由点击触发 */
  const handleChooseFolder = useCallback(async (): Promise<void> => {
    setFolderBusy(true);
    try {
      const next = await chooseFolderBackupFolder(readAllData());
      setFolderStatus(next);
      toast({
        title: '已写入备份文件夹',
        description: `以后每次打开应用都会更新「${next.folderName}」里的 ${FOLDER_BACKUP_FILE}`,
        tone: 'success',
      });
    } catch (error) {
      // 在系统弹窗里按「取消」不算失败，不该弹一条红色错误
      if (!isFolderPickerAbort(error)) {
        toast({ title: '没能写入文件夹', description: errorText(error), tone: 'danger' });
      }
    } finally {
      setFolderBusy(false);
    }
  }, [toast]);

  const handleWriteFolderNow = useCallback(async (): Promise<void> => {
    setFolderBusy(true);
    try {
      const next = await writeFolderBackupNow(readAllData());
      setFolderStatus(next);
      toast({
        title: '已更新备份文件',
        description: `${next.folderName} · ${formatDateTime(next.lastWrittenAt)}`,
        tone: 'success',
      });
    } catch (error) {
      toast({ title: '没能写入文件夹', description: errorText(error), tone: 'danger' });
    } finally {
      setFolderBusy(false);
    }
  }, [toast]);

  const handleForgetFolder = useCallback(async (): Promise<void> => {
    setFolderBusy(true);
    try {
      await forgetFolderBackupFolder();
      setFolderStatus(null);
      toast({
        title: '已取消文件夹备份',
        description: '已经写出去的那份备份文件留在原地，没有被删除。',
        tone: 'info',
      });
    } catch (error) {
      toast({ title: '操作失败', description: errorText(error), tone: 'danger' });
    } finally {
      setFolderBusy(false);
    }
  }, [toast]);

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

  const handleConfirmImport = async (): Promise<void> => {
    if (!parsed) return;
    // 必须先落快照再写入：快照要的是「导入前」的状态，慢一步就成了导入后的
    await createAutoSnapshot('导入备份前');
    applyPlan(parsed.plan.data);
    const totals = planTotals(parsed.plan.stats);
    setParsed(null);
    await refreshStorage();
    toast({
      title: '导入完成',
      description: `新增 ${totals.added} 条，跳过重复 ${totals.skipped} 条`,
      tone: 'success',
    });
  };

  const handleClearAll = async (): Promise<void> => {
    await createAutoSnapshot('清除所有数据前');
    try {
      await clearAppData();
    } catch {
      // 没清干净就别说「已清除」，更别把界面上的数据抹掉 —— 那会变成两处对不上
      setShowClearDialog(false);
      toast({
        title: '清除失败',
        description: '浏览器拒绝写入本地存储，请先导出备份后重试。',
        tone: 'danger',
      });
      return;
    }
    resetStores();
    setShowClearDialog(false);
    await refreshStorage();
    toast({
      title: '已清除全部数据',
      description: '需要恢复的话，可以在「自动备份」里回滚。',
      tone: 'info',
    });
  };

  const handleClearSnapshots = async (): Promise<void> => {
    const removed = await clearAutoSnapshots();
    setShowClearSnapshotsDialog(false);
    await refreshStorage();
    toast({
      title: '已删除全部快照',
      description: `${removed.length} 份快照已清除，之后无法再回滚（当前数据不受影响）。`,
      tone: 'warning',
    });
  };

  const handleConfirmRestore = async (): Promise<void> => {
    const key = restoreKey;
    setRestoreKey(null);
    if (!key || !(await restoreAutoSnapshot(key))) {
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
            共 {totalEntries} 条数据 · 占用 {usage ? formatBytes(usage.bytes) : '—'}
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
                  <th scope="col" className="py-2 pr-4 font-medium">
                    按键
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    作用
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {SHORTCUT_ROWS.map((row) => (
                  <tr key={row.keys}>
                    <td className="py-2 pr-4 align-top">
                      <Kbd>{row.keys}</Kbd>
                    </td>
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
          subtitle={
            usage === null
              ? '正在读取存储占用…'
              : `本应用占用${
                  usage.backend === 'indexeddb' ? '浏览器存储（IndexedDB）' : '本地存储'
                }约 ${formatBytes(usage.bytes)}`
          }
        />
        <CardBody>
          {usage?.level === 'warning' && (
            <Alert tone="warning" title="存储空间快满了" className="mb-3">
              已用 {formatBytes(usage.bytes)}，
              {usage.backend === 'indexeddb'
                ? '浏览器给本站点的配额已经用掉七成以上。'
                : '接近浏览器给单个站点的上限（约 5MB）。'}
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
        <CardHeader
          title="备份到文件夹"
          subtitle="授权一个文件夹后，每次打开应用都会自动更新里面的一份完整备份"
        />
        <CardBody className="space-y-3">
          {!folderSupported && (
            <Alert tone="info" title="这个浏览器不支持">
              需要支持「文件系统访问」的浏览器（Chrome / Edge 桌面版）。可以改用上面的「导出
              JSON」， 每周手动存一份到网盘或移动硬盘。
            </Alert>
          )}

          {folderSupported && folderStatus === null && (
            <>
              <p className="text-sm text-content-secondary">
                还没有选择文件夹。选好之后这里会记住它，之后每次打开应用都静默写入一份最新备份，
                不用再记得手动导出。
              </p>
              <Button
                icon={<FolderOpen size={16} aria-hidden />}
                disabled={folderBusy}
                onClick={() => void handleChooseFolder()}
              >
                {folderBusy ? '正在写入…' : '选择文件夹'}
              </Button>
            </>
          )}

          {folderSupported && folderStatus !== null && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={folderStatus.granted ? 'success' : 'warning'}>
                  {folderStatus.granted ? '已授权' : '需要重新授权'}
                </Badge>
                <span className="text-sm text-content">{folderStatus.folderName}</span>
              </div>
              <p className="text-sm text-content-secondary">
                最近一次写入：{formatDateTime(folderStatus.lastWrittenAt)} · 文件名固定为{' '}
                {FOLDER_BACKUP_FILE}，每次覆盖，不会在文件夹里堆一串历史文件。
              </p>
              {!folderStatus.granted && (
                <Alert tone="warning" title="文件夹授权已失效">
                  浏览器会在长时间不用后收回授权，开机时的自动写入已经暂停。
                  点「立即写入」重新授权一次即可恢复。
                </Alert>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  icon={<RefreshCw size={16} aria-hidden />}
                  disabled={folderBusy}
                  onClick={() => void handleWriteFolderNow()}
                >
                  {folderBusy ? '正在写入…' : '立即写入'}
                </Button>
                <Button
                  variant="ghost"
                  disabled={folderBusy}
                  onClick={() => void handleChooseFolder()}
                >
                  换一个文件夹
                </Button>
                <Button
                  variant="ghost"
                  disabled={folderBusy}
                  onClick={() => void handleForgetFolder()}
                >
                  取消授权
                </Button>
              </div>
            </>
          )}
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
        <CardHeader
          title="从外部导入"
          subtitle="把别的平台导出的 CSV 批量搬进来：先预览、按名字去重，确认后才写入"
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-56">
              <Select
                label="来源"
                value={csvSource}
                onChange={(value) => {
                  setCsvSource(value as CsvImportSource);
                  setCsvPlan(null);
                }}
                options={CSV_SOURCES.map((source) => ({
                  value: source.id,
                  label: source.label,
                }))}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="pb-2 text-xs text-content-tertiary">{currentSource.hint}</p>
            </div>
            <input
              type="file"
              accept=".csv,text/csv"
              aria-label="选择 CSV 文件"
              disabled={csvBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleCsvFile(file);
                // 允许重复选择同一个文件
                event.target.value = '';
              }}
              className="block w-full max-w-xs rounded border border-line-subtle bg-surface p-2 text-sm text-content-secondary file:mr-3 file:rounded file:border-0 file:bg-inset file:px-3 file:py-1.5 file:text-xs file:text-content-secondary"
            />
          </div>

          {csvPlan && (
            <div className="space-y-3 rounded border border-line-subtle p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="info">{csvPlan.fileName}</Badge>
                <Badge tone="default">共 {csvPlan.total} 行</Badge>
                <Badge tone={csvPlan.toAdd.length > 0 ? 'success' : 'default'}>
                  将新增 {csvPlan.toAdd.length} 条
                </Badge>
                {csvPlan.skipped > 0 && <Badge tone="warning">去重跳过 {csvPlan.skipped} 条</Badge>}
              </div>

              {csvPlan.warnings.length > 0 && (
                <Alert tone="warning" title="有几点要注意">
                  <ul className="list-disc space-y-0.5 pl-4">
                    {csvPlan.warnings.slice(0, 5).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                    {csvPlan.warnings.length > 5 && (
                      <li>…还有 {csvPlan.warnings.length - 5} 条警告</li>
                    )}
                  </ul>
                </Alert>
              )}

              {csvPlan.toAdd.length > 0 && (
                <div className="max-h-48 overflow-auto rounded border border-line-subtle">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-surface">
                      <tr className="text-content-tertiary">
                        {csvPlan.target === 'books' ? (
                          <>
                            <th scope="col" className="px-3 py-1.5 font-medium">
                              标题
                            </th>
                            <th scope="col" className="px-3 py-1.5 font-medium">
                              作者
                            </th>
                            <th scope="col" className="px-3 py-1.5 font-medium">
                              状态
                            </th>
                          </>
                        ) : (
                          <>
                            <th scope="col" className="px-3 py-1.5 font-medium">
                              游戏
                            </th>
                            <th scope="col" className="px-3 py-1.5 font-medium">
                              时长
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-subtle">
                      {csvPlan.toAdd.slice(0, 8).map((item) =>
                        csvPlan.target === 'books' ? (
                          <tr key={item.id}>
                            <td className="max-w-40 truncate px-3 py-1.5 text-content">
                              {(item as Book).title}
                            </td>
                            <td className="max-w-32 truncate px-3 py-1.5 text-content-secondary">
                              {(item as Book).author || '—'}
                            </td>
                            <td className="px-3 py-1.5 text-content-tertiary">
                              {(item as Book).status === 'finished' ? '已读' : '想读'}
                            </td>
                          </tr>
                        ) : (
                          <tr key={item.id}>
                            <td className="max-w-40 truncate px-3 py-1.5 text-content">
                              {(item as Game).name}
                            </td>
                            <td className="px-3 py-1.5 text-content-tertiary tabular">
                              {formatNumber((item as Game).hoursPlayed)} 小时
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                  {csvPlan.toAdd.length > 8 && (
                    <p className="border-t border-line-subtle px-3 py-1.5 text-2xs text-content-tertiary">
                      只预览前 8 条，共 {csvPlan.toAdd.length} 条。
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button variant="secondary" onClick={() => setCsvPlan(null)}>
                  放弃
                </Button>
                <Button onClick={confirmCsvImport} disabled={csvPlan.toAdd.length === 0}>
                  导入 {csvPlan.toAdd.length} 条
                </Button>
              </div>
            </div>
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

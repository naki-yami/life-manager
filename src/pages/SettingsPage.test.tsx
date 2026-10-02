import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';
import { ToastProvider } from '../components/ui';
import { parseBackup, serializeBackup } from '../services/backup';
import { FOLDER_BACKUP_FILE, resetFolderBackupStore } from '../services/folderSync';
import { installIndexedDbStub } from '../test/indexedDbStub';
import { fakeFolder, stubDirectoryPicker } from '../test/fakeFolder';
import type { BackupData } from '../services/schemas';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useGameStore } from '../store/gameStore';
import { useHabitStore } from '../store/habitStore';
import { useReviewStore } from '../store/reviewStore';
import { useGoalStore } from '../store/goalStore';
import { useThemeStore } from '../store/themeStore';
import { useUiStore } from '../store/uiStore';
import { DEFAULT_DIET_GOALS } from '../utils/diet';

beforeEach(() => {
  useTaskStore.setState({ tasks: [], memos: [] });
  useBookStore.setState({ books: [] });
  useDevStore.setState({ projects: [] });
  useWritingStore.setState({ projects: [] });
  useFitnessStore.setState({ plans: [], records: [] });
  useDietStore.setState({ records: [], goals: { ...DEFAULT_DIET_GOALS }, water: {} });
  useGameStore.setState({ games: [] });
  useHabitStore.setState({ habits: [] });
  useReviewStore.setState({ reviews: [] });
  useGoalStore.setState({ goals: [] });
  useThemeStore.setState({ themeMode: 'system' });
  useUiStore.setState({ density: 'comfortable', sidebarCollapsed: false });
  localStorage.clear();
});

afterEach(() => {
  // 句柄仓库缓存与假 indexedDB 都是全局的，不清会串到下一个用例
  resetFolderBackupStore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderSettings = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <ToastProvider>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/ui" element={<div>UI 预览页</div>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );

const emptyBackup: BackupData = {
  tasks: [],
  memos: [],
  books: [],
  devProjects: [],
  workSessions: [],
  writingProjects: [],
  fitnessPlans: [],
  fitnessRecords: [],
  bodyMetrics: [],
  dietRecords: [],
  mealTemplates: [],
  dietGoals: { calories: 2000, protein: 80 },
  dietWater: {},
  games: [],
  gameSessions: [],
  readingSessions: [],
  habits: [],
  focusSessions: [],
  reviews: [],
  journal: [],
  goals: [],
  customFoods: [],
  customExercises: [],
  settings: { themeMode: 'system', density: 'comfortable', sidebarCollapsed: false },
};

const uploadFile = (text: string, name = 'backup.json'): void => {
  const input = screen.getByLabelText('选择备份文件') as HTMLInputElement;
  const file = new File([text], name, { type: 'application/json' });
  fireEvent.change(input, { target: { files: [file] } });
};

/**
 * 数据概览里某个模块的标签。
 *
 * 模块中文名现在同时出现在「数据概览」九宫格和「单模块导出」的下拉里，
 * 直接 `getByText('书籍')` 会撞上两个。九宫格里的标签是 `<p>`，
 * 下拉里的是 `<option>` —— 按标签名取 `<p>` 就能唯一命中。
 */
const overviewLabel = (label: string): HTMLElement => {
  const matches = screen.getAllByText(label).filter((node) => node.tagName === 'P');
  expect(matches).toHaveLength(1);
  return matches[0]!;
};

/** 单模块导出区：从模块下拉往上找到带三个格式按钮的那一层 */
const exportSection = (): HTMLElement => {
  const select = screen.getByLabelText('选择要导出的模块');
  const row = select.closest('.flex') as HTMLElement | null;
  expect(row).not.toBeNull();
  expect(within(row!).getByRole('button', { name: /JSON/ })).toBeInTheDocument();
  return row!;
};

/** 单模块导出区里的格式按钮 */
const formatButton = (name: RegExp): HTMLElement =>
  within(exportSection()).getByRole('button', { name });

/**
 * 拦下浏览器下载，把每次导出的内容收进数组。
 *
 * 导出的验收点是「文件里到底是什么」，不是「有没有调用 createObjectURL」——
 * 所以这里把 Blob 留下来给用例读文本。
 */
const stubDownload = (): { blobs: Blob[]; anchorClick: ReturnType<typeof vi.fn> } => {
  const blobs: Blob[] = [];
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:mock';
    }),
    revokeObjectURL: vi.fn(),
  });
  const anchorClick = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  return { blobs, anchorClick };
};

describe('SettingsPage', () => {
  it('快捷键说明表列出全局按键', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route
            path="/settings"
            element={
              <ToastProvider>
                <SettingsPage />
              </ToastProvider>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('快捷键')).toBeInTheDocument();
    expect(screen.getByText('Ctrl / ⌘ K')).toBeInTheDocument();
    expect(screen.getByText('g 后接 1-9')).toBeInTheDocument();
    expect(screen.getByText('j / k / x')).toBeInTheDocument();
    expect(screen.getByText('列表内：行间移动焦点 / 把当前行勾进批量操作')).toBeInTheDocument();
    // 页面清单是从 mainNavShortcuts 现算的，这一行就是主导航收敛后的最终顺序（13 → 8），
    // 不再出现手写的「3 读书」这种对不上的旧文案
    expect(
      screen.getByText(
        '跳转到对应的主页面（1 首页总览、2 今日计划、3 书房、4 开发工作、5 健康、6 游戏娱乐、7 成长、8 统计与复盘）',
      ),
    ).toBeInTheDocument();
  });

  it('外观区可以切换主题模式、密度与侧边栏折叠', async () => {
    renderSettings();

    await userEvent.click(screen.getByRole('button', { name: '暗色' }));
    expect(useThemeStore.getState().themeMode).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    const densitySwitch = screen.getByRole('switch', { name: '紧凑密度' });
    await userEvent.click(densitySwitch);
    expect(useUiStore.getState().density).toBe('compact');
    expect(densitySwitch).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('switch', { name: '折叠侧边栏' }));
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
  });

  it('数据概览会把习惯也算进来', () => {
    useHabitStore.getState().addHabit({ name: '晨跑' });
    useHabitStore.getState().addHabit({ name: '喝水', kind: 'count', target: 8 });

    renderSettings();

    expect(overviewLabel('习惯')).toBeInTheDocument();
    expect(screen.getByText(/共 2 条数据/)).toBeInTheDocument();
  });

  it('数据概览会把复盘也算进来', () => {
    useReviewStore.setState({
      reviews: [
        {
          id: 'r1',
          period: 'week',
          date: '2026-09-21',
          best: '把复盘页收尾',
          blocker: '',
          next: '',
          createdAt: '2026-09-21T12:00:00',
          updatedAt: '2026-09-21T12:00:00',
        },
      ],
    });

    renderSettings();

    expect(overviewLabel('复盘')).toBeInTheDocument();
    expect(screen.getByText(/共 1 条数据/)).toBeInTheDocument();
  });

  it('数据概览会把目标也算进来', () => {
    useGoalStore.getState().addGoal({ metric: 'fitness.sessions', period: 'week', target: 4 });
    useGoalStore.getState().addGoal({ metric: 'reading.minutes', period: 'month', target: 600 });

    renderSettings();

    expect(overviewLabel('目标')).toBeInTheDocument();
    expect(screen.getByText(/共 2 条数据/)).toBeInTheDocument();
  });

  it('数据概览列出各模块条数并在标题旁汇总', () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    useGameStore.getState().addGame('哈迪斯', 'PC');

    renderSettings();

    expect(screen.getByText(/共 2 条数据/)).toBeInTheDocument();
    expect(overviewLabel('书籍')).toBeInTheDocument();
    expect(overviewLabel('游戏')).toBeInTheDocument();
    expect(overviewLabel('训练计划')).toBeInTheDocument();
  });

  it('导出会生成带信封结构的 JSON 备份并给出提示', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: '导出 JSON' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    const parsed = JSON.parse(await blob.text()) as {
      app: string;
      data: { books: Array<{ title: string }> };
    };
    expect(parsed.app).toBe('life-manager');
    expect(parsed.data.books[0]!.title).toBe('人类简史');

    expect(await screen.findByText('已导出备份')).toBeInTheDocument();
    expect(screen.getByText(/life-manager-backup-\d{4}-\d{2}-\d{2}\.json/)).toBeInTheDocument();
  });

  it('分模块导出：选中的模块与格式决定文件名和内容，只带这一个模块', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    useTaskStore.getState().addTask('写周报', '', 'medium', '');
    const { blobs, anchorClick } = stubDownload();

    renderSettings();
    await userEvent.selectOptions(screen.getByLabelText('选择要导出的模块'), 'books');
    await userEvent.click(formatButton(/CSV/));

    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(blobs).toHaveLength(1);
    const text = await blobs[0]!.text();
    expect(text.split('\r\n')[0]).toBe('书名,作者,分类,状态,进度,评分,标签,短评,读完于');
    expect(text).toContain('人类简史');
    // 任务模块没被带进来
    expect(text).not.toContain('写周报');

    expect(await screen.findByText('已导出书籍')).toBeInTheDocument();
    expect(screen.getByText(/life-manager-书籍-\d{4}-\d{2}-\d{2}\.csv/)).toBeInTheDocument();
  });

  it('分模块导出的 JSON 能被「导入数据」读回来', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    const { blobs } = stubDownload();

    renderSettings();
    await userEvent.selectOptions(screen.getByLabelText('选择要导出的模块'), 'books');
    await userEvent.click(formatButton(/JSON/));

    const text = await blobs[0]!.text();
    const raw = JSON.parse(text) as { module: string; data: Record<string, unknown> };
    expect(raw.module).toBe('books');
    expect(Object.keys(raw.data)).toEqual(['books']);

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.modules.books?.[0]?.title).toBe('人类简史');
    expect(parsed.backup.modules.tasks).toBeUndefined();
  });

  it('树形模块禁用 CSV / Markdown，并说明原因', async () => {
    renderSettings();
    await userEvent.selectOptions(screen.getByLabelText('选择要导出的模块'), 'devProjects');

    expect(formatButton(/CSV/)).toBeDisabled();
    expect(formatButton(/Markdown/)).toBeDisabled();
    expect(formatButton(/JSON/)).toBeEnabled();
    expect(screen.getByText(/开发项目挂着子任务、里程碑与日志/)).toBeInTheDocument();

    // 换回普通模块，按钮恢复可用
    await userEvent.selectOptions(screen.getByLabelText('选择要导出的模块'), 'tasks');
    expect(formatButton(/CSV/)).toBeEnabled();
  });

  it('没有数据的模块导出空表也给出提示，而不是静默下载', async () => {
    const { blobs } = stubDownload();
    renderSettings();

    await userEvent.selectOptions(screen.getByLabelText('选择要导出的模块'), 'goals');
    await userEvent.click(formatButton(/JSON/));

    expect(blobs).toHaveLength(1);
    expect(await screen.findByText('已导出目标')).toBeInTheDocument();
    expect(screen.getByText(/这个模块目前还没有数据/)).toBeInTheDocument();
  });

  it('导入会先预览再写入，并且模式可切换', async () => {
    const text = serializeBackup({
      ...emptyBackup,
      books: [
        {
          id: 'book-1',
          title: '人类简史',
          author: 'Harari',
          category: '历史',
          status: 'reading',
          rating: 0,
          review: '',
          favorite: false,
          statusHistory: [],
          progress: 30,
          notes: [],
          tags: [],
          createdAt: new Date().toISOString(),
        },
      ],
    });

    renderSettings();
    expect(screen.getByRole('radio', { name: /合并/ })).toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: /追加/ }));
    expect(screen.getByRole('radio', { name: /追加/ })).toBeChecked();

    uploadFile(text);
    const dialog = await screen.findByRole('dialog', { name: '确认导入' });
    expect(within(dialog).getByText(/共将新增/)).toHaveTextContent('1');
    expect(within(dialog).getByRole('cell', { name: '书籍' })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '确认导入' }));

    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0]!.title).toBe('人类简史');
    expect(await screen.findByText('导入完成')).toBeInTheDocument();
    // 导入前自动留了一份快照
    await waitFor(() => expect(screen.getByText('导入备份前')).toBeInTheDocument());
  });

  it('导入预览里饮水按「天」、目标按「项」计数，不是「条」', async () => {
    const text = serializeBackup({
      ...emptyBackup,
      dietGoals: { calories: 2100, protein: 120 },
      dietWater: { '2026-09-01': 8, '2026-09-02': 6 },
    });

    renderSettings();
    uploadFile(text);
    const dialog = await screen.findByRole('dialog', { name: '确认导入' });

    expect(within(dialog).getByRole('cell', { name: '饮水打卡' })).toBeInTheDocument();
    expect(within(dialog).getByRole('cell', { name: '每日目标' })).toBeInTheDocument();
    // 「备份中 2 天」与「新增 2 天」两格；目标同理两格「1 项」
    expect(within(dialog).getAllByRole('cell', { name: /2 天/ })).toHaveLength(2);
    expect(within(dialog).getAllByRole('cell', { name: /1 项/ })).toHaveLength(2);
  });

  it('分模块导出饮水：CSV 一天一行，提示按「天」计数', async () => {
    const { blobs } = stubDownload();
    useDietStore.setState({ water: { '2026-09-01': 8, '2026-09-02': 6 } });
    renderSettings();

    await userEvent.selectOptions(screen.getByLabelText('选择要导出的模块'), 'dietWater');
    await userEvent.click(formatButton(/CSV/));

    expect(blobs).toHaveLength(1);
    expect(await screen.findByText('已导出饮水打卡')).toBeInTheDocument();
    expect(screen.getByText(/共 2 天/)).toBeInTheDocument();
  });

  it('坏文件会提示解析失败，且不会写入任何数据', async () => {
    renderSettings();
    uploadFile('这不是 JSON', 'broken.json');

    expect(await screen.findByText('导入失败：备份文件无法解析')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '确认导入' })).not.toBeInTheDocument();
    expect(useBookStore.getState().books).toHaveLength(0);
  });

  it('清除数据需要输入确认词，且只清本应用的数据', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    localStorage.setItem('other-project:token', 'must-stay');

    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: '清除所有数据' }));

    const dialog = screen.getByRole('dialog', { name: '清除所有数据' });
    const confirm = within(dialog).getByRole('button', { name: '确认清除' });
    expect(confirm).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/请输入「清除」以确认/), '清除');
    await userEvent.click(confirm);

    expect(useBookStore.getState().books).toHaveLength(0);
    expect(localStorage.getItem('other-project:token')).toBe('must-stay');
    expect(await screen.findByText('已清除全部数据')).toBeInTheDocument();
  });

  it('没有快照时是空态，清除后可以回滚并刷新页面', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');

    renderSettings();
    // 快照在异步后端里，要先读回来
    expect(await screen.findByText('还没有快照')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '清除所有数据' }));
    const clearDialog = screen.getByRole('dialog', { name: '清除所有数据' });
    await userEvent.type(within(clearDialog).getByLabelText(/请输入「清除」以确认/), '清除');
    await userEvent.click(within(clearDialog).getByRole('button', { name: '确认清除' }));

    const restoreButton = await screen.findByRole('button', { name: '回滚' });
    await userEvent.click(restoreButton);
    const restoreDialog = screen.getByRole('dialog', { name: '回滚到这份快照' });
    await userEvent.click(within(restoreDialog).getByRole('button', { name: '回滚并刷新' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('可以显式删除全部快照', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    renderSettings();

    await userEvent.click(screen.getByRole('button', { name: '清除所有数据' }));
    const clearDialog = screen.getByRole('dialog', { name: '清除所有数据' });
    await userEvent.type(within(clearDialog).getByLabelText(/请输入「清除」以确认/), '清除');
    await userEvent.click(within(clearDialog).getByRole('button', { name: '确认清除' }));

    await userEvent.click(await screen.findByRole('button', { name: '清除快照' }));
    const dialog = screen.getByRole('dialog', { name: '删除全部快照' });
    expect(within(dialog).getByText(/1 份快照将被删除/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '删除快照' }));

    expect(await screen.findByText('已删除全部快照')).toBeInTheDocument();
    expect(await screen.findByText('还没有快照')).toBeInTheDocument();
  });

  it('组件预览入口可以跳到 /ui', async () => {
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: '打开组件预览' }));
    expect(screen.getByText('UI 预览页')).toBeInTheDocument();
  });
  it('读取备份文件期间按钮进入加载态并禁用', () => {
    class PendingFileReader {
      onload: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      readAsText(): void {
        // 故意不触发 onload：模拟文件还在读取中
      }
    }
    vi.stubGlobal('FileReader', PendingFileReader);

    renderSettings();
    const input = screen.getByLabelText('选择备份文件') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['{}'], 'backup.json', { type: 'application/json' })] },
    });

    expect(screen.getByRole('button', { name: /正在读取/ })).toBeDisabled();
    expect(screen.getByRole('status', { name: '加载中' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '选择备份文件' })).not.toBeInTheDocument();
  });

  it('浏览器不支持「备份到文件夹」时给出提示，而不是给一个点了没反应的按钮', () => {
    renderSettings();

    expect(screen.getByText('这个浏览器不支持')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '选择文件夹' })).not.toBeInTheDocument();
  });

  it('授权文件夹后写入一份备份，可以立即更新，也可以取消授权', async () => {
    installIndexedDbStub();
    const folder = fakeFolder('生活备份');
    stubDirectoryPicker(folder.handle);
    useTaskStore.getState().addTask('写周报', '', 'medium', '2026-09-29');

    renderSettings();

    await userEvent.click(await screen.findByRole('button', { name: '选择文件夹' }));

    expect(await screen.findByText('已授权')).toBeInTheDocument();
    expect(screen.getByText('生活备份')).toBeInTheDocument();
    // 写出去的是「导出 JSON」同一套格式，能直接再导入回来
    expect(folder.files.get(FOLDER_BACKUP_FILE)).toContain('写周报');
    expect(await screen.findByText('已写入备份文件夹')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '立即写入' }));
    expect(await screen.findByText('已更新备份文件')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '取消授权' }));

    expect(await screen.findByRole('button', { name: '选择文件夹' })).toBeInTheDocument();
    // 取消授权只是忘掉句柄，已经写出去的文件留在原地
    expect(folder.files.has(FOLDER_BACKUP_FILE)).toBe(true);
  });

  it('授权失效时提示重新授权，手动写入后会恢复', async () => {
    installIndexedDbStub();
    const folder = fakeFolder('移动硬盘');
    stubDirectoryPicker(folder.handle);

    const first = renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: '选择文件夹' }));
    expect(await screen.findByText('已授权')).toBeInTheDocument();

    // 浏览器长时间不用之后把授权收回成 prompt，此时重开设置页会显示「需要重新授权」
    folder.state.permission = 'prompt';
    first.unmount();
    renderSettings();

    expect(await screen.findByText('需要重新授权')).toBeInTheDocument();
    expect(screen.getByText('文件夹授权已失效')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '立即写入' }));
    expect(await screen.findByText('已授权')).toBeInTheDocument();
  });

  it('从外部导入：Goodreads CSV 先预览再写入，去重跳过已有书', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route
            path="/settings"
            element={
              <ToastProvider>
                <SettingsPage />
              </ToastProvider>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('从外部导入')).toBeInTheDocument();

    const fileInput = screen.getByLabelText('选择 CSV 文件');
    const csv = [
      'Title,Author,Date Read,Bookshelves',
      '新的一本书,某作者,2024/5/1,read',
      '1984,Orwell,,to-read',
    ].join('\n');
    const file = new File([csv], 'goodreads.csv', { type: 'text/csv' });
    // 1984 已在库里（beforeEach 铺的种子没有，这里直接种一本）
    useBookStore.getState().addBook('1984', 'Orwell', '');
    fireEvent.change(fileInput, { target: { files: [file] } });

    // 预览出现：新增 1、去重跳过 1
    expect(await screen.findByText('将新增 1 条')).toBeInTheDocument();
    expect(screen.getByText('去重跳过 1 条')).toBeInTheDocument();
    expect(screen.getByText('新的一本书')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '导入 1 条' }));

    const titles = useBookStore.getState().books.map((book) => book.title);
    expect(titles).toContain('新的一本书');
    expect(titles.filter((title) => title === '1984')).toHaveLength(1);
    const added = useBookStore.getState().books.find((book) => book.title === '新的一本书')!;
    expect(added.status).toBe('finished');
  });

  it('设置页随时可以载入/清除示例数据（有真实数据也出载入口）', async () => {
    // 库里先有一条真实书（非全空 → 首页引导卡不会出现，但设置页仍可用）
    useBookStore.getState().addBook('真实书', '', '');

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route
            path="/settings"
            element={
              <ToastProvider>
                <SettingsPage />
              </ToastProvider>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('示例数据')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '载入示例数据' }));

    expect(useBookStore.getState().books.some((book) => book.id.startsWith('demo-'))).toBe(true);
    expect(screen.getByRole('button', { name: '清除示例数据' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '清除示例数据' }));
    expect(useBookStore.getState().books.some((book) => book.id.startsWith('demo-'))).toBe(false);
    // 真实书还在
    expect(useBookStore.getState().books.some((book) => book.title === '真实书')).toBe(true);
  });
});

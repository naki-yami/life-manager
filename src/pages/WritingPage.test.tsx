import React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WritingPage } from './WritingPage';
import { ToastProvider } from '../components/ui';
import { useWritingStore } from '../store/writingStore';
import { WritingStatus } from '../types';
import { requestPaletteFocus, resetPaletteFocus } from '../hooks/usePaletteFocus';
import { MASTER_DETAIL_QUERY } from '../components/layout';
import { mockMediaQueries } from '../test/matchMedia';
import { DOCX_MIME } from '../utils/docx';

beforeEach(() => {
  useWritingStore.setState({ projects: [] });
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() }),
  );
});

/** 选中项进 URL（`?project=`）之后，页面必须在 Router 里渲染 */
const renderWriting = (): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={['/study/writing']}>
      <WritingPage />
    </MemoryRouter>,
  );

const projectOf = (title: string) =>
  useWritingStore.getState().projects.find((project) => project.title === title)!;

describe('WritingPage 从命令面板打开', () => {
  afterEach(() => {
    resetPaletteFocus();
  });

  it('聚焦某篇稿件时直接打开编辑器', () => {
    useWritingStore.getState().addProject('周报模板', 'article');
    renderWriting();

    act(() => {
      requestPaletteFocus('/study/writing', projectOf('周报模板').id);
    });

    expect(screen.getByRole('dialog', { name: '《周报模板》编辑正文' })).toBeInTheDocument();
  });

  it('聚焦一篇不存在的稿件时不弹编辑器', () => {
    renderWriting();

    act(() => {
      requestPaletteFocus('/study/writing', 'missing');
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

/** 统计卡片的整块文本，避免多个卡片出现相同数字时选择器歧义 */
const statText = (label: string): string =>
  screen.getByText(label).closest('div.rounded-lg')?.textContent ?? '';

const setStatus = (title: string, status: WritingStatus): void => {
  useWritingStore.getState().updateStatus(projectOf(title).id, status);
};

describe('WritingPage', () => {
  it('空态引导新建第一个项目', async () => {
    renderWriting();
    expect(screen.getByText('还没有写作项目')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: '新建项目' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '新建写作项目' });

    await userEvent.type(within(dialog).getByLabelText(/^标题/), '我的第一本书');
    await userEvent.click(within(dialog).getByRole('button', { name: '创建' }));

    expect(useWritingStore.getState().projects).toHaveLength(1);
    expect(useWritingStore.getState().projects[0]!.title).toBe('我的第一本书');
    expect(useWritingStore.getState().projects[0]!.status).toBe('draft');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('新建项目弹窗里在标题框按回车直接提交（U7）', async () => {
    renderWriting();

    await userEvent.click(screen.getAllByRole('button', { name: '新建项目' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '新建写作项目' });

    await userEvent.type(within(dialog).getByLabelText(/^标题/), '回车建的书{Enter}');

    expect(useWritingStore.getState().projects[0]!.title).toBe('回车建的书');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('新建项目时标题为空则不能提交', () => {
    renderWriting();

    return userEvent.click(screen.getAllByRole('button', { name: '新建项目' })[0]!).then(() => {
      const dialog = screen.getByRole('dialog', { name: '新建写作项目' });
      expect(within(dialog).getByRole('button', { name: '创建' })).toBeDisabled();
      expect(useWritingStore.getState().projects).toHaveLength(0);
    });
  });

  it('统计卡片汇总项目状态与累计字数', () => {
    const store = useWritingStore.getState();
    store.addProject('长文', 'article');
    useWritingStore.getState().addProject('文案', 'copy');
    useWritingStore.getState().addProject('书稿', 'book');

    setStatus('长文', 'in-progress');
    setStatus('文案', 'completed');
    useWritingStore.getState().updateWordCount(projectOf('长文').id, 1200);
    useWritingStore.getState().updateWordCount(projectOf('文案').id, 800);

    renderWriting();

    expect(statText('项目总数')).toContain('3');
    expect(statText('进行中项目')).toContain('1');
    expect(statText('已完成项目')).toContain('1');
    expect(statText('累计字数')).toContain('2,000');
  });

  it('可以按标题和创作笔记搜索', async () => {
    const store = useWritingStore.getState();
    store.addProject('人类简史读书笔记', 'article');
    useWritingStore.getState().addProject('新品发布文案', 'copy');
    useWritingStore.getState().updateNotes(projectOf('新品发布文案').id, '主打轻量化的卖点');

    renderWriting();

    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), '简史');
    expect(screen.getByText('人类简史读书笔记')).toBeInTheDocument();
    expect(screen.queryByText('新品发布文案')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole('textbox', { name: '搜索' }));
    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), '轻量化');
    expect(screen.getByText('新品发布文案')).toBeInTheDocument();
    expect(screen.queryByText('人类简史读书笔记')).not.toBeInTheDocument();
  });

  it('按状态筛选并显示数量', async () => {
    const store = useWritingStore.getState();
    store.addProject('A', 'article');
    useWritingStore.getState().addProject('B', 'article');
    useWritingStore.getState().addProject('C', 'article');
    setStatus('A', 'completed');

    renderWriting();

    expect(screen.getByRole('button', { name: /全部/ })).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: /^已完成/ })).toHaveTextContent('1');

    await userEvent.click(screen.getByRole('button', { name: /^已完成/ }));
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
    expect(screen.queryByText('C')).not.toBeInTheDocument();
  });

  it('字数是只读展示（由正文自动统计），可以改目标字数、状态与一键标记完成', async () => {
    useWritingStore.getState().addProject('长文', 'article');
    renderWriting();

    expect(screen.getByText('已写 0 字')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: '「长文」的字数' })).not.toBeInTheDocument();

    const target = screen.getByRole('spinbutton', { name: '「长文」的目标字数' });
    await userEvent.clear(target);
    await userEvent.type(target, '10000');
    expect(projectOf('长文').targetWords).toBe(10000);

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '调整「长文」的状态' }),
      'in-progress',
    );
    expect(projectOf('长文').status).toBe('in-progress');

    await userEvent.click(screen.getByRole('button', { name: '标记完成' }));
    expect(projectOf('长文').status).toBe('completed');
    expect(screen.queryByRole('button', { name: '标记完成' })).not.toBeInTheDocument();
  });

  it('创作笔记可以保存与清空', async () => {
    useWritingStore.getState().addProject('长文', 'article');
    renderWriting();

    await userEvent.click(screen.getByRole('button', { name: '创作笔记' }));
    const dialog = screen.getByRole('dialog', { name: /长文/ });
    /*
     * 每次重新查，不要缓存元素：抽屉里的 textarea 会随重渲染换节点，
     * 缓存的引用点不动（userEvent.clear 会报 "could not be focused"）。
     * 抽屉里只有一个 textbox，按 role 拿即可。
     */
    const openBox = (): HTMLElement =>
      within(screen.getByRole('dialog', { name: /长文/ })).getByRole('textbox');

    await userEvent.type(openBox(), '第二章要加一个反转');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(projectOf('长文').notes).toBe('第二章要加一个反转');

    // 窄屏存完抽屉会收起（宽屏右栏才是常驻的），再点一次打开，草稿应从 store 回填
    await userEvent.click(screen.getByRole('button', { name: '创作笔记' }));
    expect(openBox()).toHaveValue('第二章要加一个反转');

    await userEvent.clear(openBox());
    await userEvent.click(
      within(screen.getByRole('dialog', { name: /长文/ })).getByRole('button', { name: '保存' }),
    );

    expect(projectOf('长文').notes).toBe('');
    expect(screen.getByText('还没有创作笔记')).toBeInTheDocument();
  });

  it('删除项目要二次确认，文案里提示笔记会一起删', async () => {
    useWritingStore.getState().addProject('长文', 'article');
    useWritingStore.getState().updateNotes(projectOf('长文').id, '一些笔记');

    renderWriting();
    await userEvent.click(screen.getByRole('button', { name: '删除《长文》' }));

    const dialog = screen.getByRole('dialog', { name: '删除写作项目' });
    expect(within(dialog).getByText(/创作笔记也会一起删除/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(useWritingStore.getState().projects).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: '删除《长文》' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: '删除写作项目' })).getByRole('button', {
        name: '删除',
      }),
    );
    expect(useWritingStore.getState().projects).toHaveLength(0);
  });

  it('筛选无结果时提供清除筛选', async () => {
    useWritingStore.getState().addProject('长文', 'article');
    renderWriting();

    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), 'zzz');
    expect(screen.getByText('没有符合条件的项目')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(screen.getByText('长文')).toBeInTheDocument();
  });

  it('编辑正文保存后字数同步并留快照，可回滚', async () => {
    useWritingStore.getState().addProject('新文章', 'article');
    const id = projectOf('新文章').id;
    useWritingStore.getState().setTargetWords(id, 100);
    renderWriting();

    await userEvent.click(screen.getByRole('button', { name: '编辑正文' }));
    const dialog = screen.getByRole('dialog', { name: /编辑正文/ });
    await userEvent.type(within(dialog).getByLabelText('正文'), '第一段内容');
    expect(within(dialog).getByText('字数 5')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(projectOf('新文章').wordCount).toBe(5);
    expect(projectOf('新文章').snapshots).toHaveLength(1);

    // 目标进度条出现
    expect(screen.getByText('目标 100 字')).toBeInTheDocument();
  });

  it('快照可以载回编辑器', async () => {
    useWritingStore.getState().addProject('新文章', 'article');
    const id = projectOf('新文章').id;
    useWritingStore.getState().updateContent(id, '第一版');
    useWritingStore.getState().updateContent(id, '第二版更长一些');
    renderWriting();

    await userEvent.click(screen.getByRole('button', { name: '编辑正文' }));
    const dialog = screen.getByRole('dialog', { name: /编辑正文/ });
    // 快照列表里有两版，回滚到第一版
    await userEvent.click(within(dialog).getAllByRole('button', { name: '回滚到此版' })[1]!);
    expect(within(dialog).getByLabelText('正文')).toHaveValue('第一版');
  });

  it('达到目标字数时弹庆祝提示', async () => {
    useWritingStore.getState().addProject('新文章', 'article');
    useWritingStore.getState().setTargetWords(projectOf('新文章').id, 5);
    render(
      <MemoryRouter initialEntries={['/study/writing']}>
        <ToastProvider>
          <WritingPage />
        </ToastProvider>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('button', { name: '编辑正文' }));
    const dialog = screen.getByRole('dialog', { name: /编辑正文/ });
    await userEvent.type(within(dialog).getByLabelText('正文'), '正好五个字');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(screen.getByText(/《新文章》达标了！/)).toBeInTheDocument();
  });

  it('导出会生成 Markdown 下载', async () => {
    useWritingStore.getState().addProject('可导出的稿子', 'article');
    useWritingStore.getState().updateContent(projectOf('可导出的稿子').id, '正文内容');
    renderWriting();

    await userEvent.click(screen.getByRole('button', { name: '导出《可导出的稿子》为 Markdown' }));

    const createObjectURL = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('WritingPage 标签', () => {
  it('新建项目时能打标签，卡片上会显示', async () => {
    renderWriting();

    await userEvent.click(screen.getAllByRole('button', { name: '新建项目' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '新建写作项目' });
    await userEvent.type(within(dialog).getByLabelText(/^标题/), '专栏稿');
    await userEvent.type(within(dialog).getByLabelText('标签'), '专栏{Enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: '创建' }));

    expect(projectOf('专栏稿').tags).toEqual(['专栏']);
    expect(screen.getByText('#专栏')).toBeInTheDocument();
  });

  it('卡片上可以就地补标签，标签会写回 store', async () => {
    useWritingStore.getState().addProject('专栏稿', 'article');
    renderWriting();

    await userEvent.click(screen.getByRole('button', { name: '添加标签' }));
    await userEvent.type(screen.getByLabelText('编辑标签'), '专栏{Enter}');
    await userEvent.click(screen.getByRole('button', { name: '完成' }));

    expect(projectOf('专栏稿').tags).toEqual(['专栏']);
    expect(screen.getByText('#专栏')).toBeInTheDocument();
  });

  it('搜索框里输入 #标签 能筛出对应的稿件', async () => {
    const store = useWritingStore.getState();
    store.addProject('专栏稿', 'article', ['专栏']);
    store.addProject('产品文案', 'copy', ['工作']);
    renderWriting();

    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), '#专栏');

    expect(screen.getByText('专栏稿')).toBeInTheDocument();
    expect(screen.queryByText('产品文案')).not.toBeInTheDocument();
  });
});
describe('WritingPage 宽屏双栏', () => {
  afterEach(() => {
    resetPaletteFocus();
  });

  const expectWideLayout = (): void => mockMediaQueries({ [MASTER_DETAIL_QUERY]: true });
  const panel = (name = '《长文》的创作笔记'): HTMLElement =>
    screen.getByRole('complementary', { name });

  /*
   * 「右栏选完就空」是设计文档点名要改掉的反模式，写作页是最后一处。
   * 现在默认选中第一个可见项目，右栏一进来就有内容；一个稿件都没有时才走空态。
   */
  it('宽屏右栏常驻，默认选中第一个可见项目', () => {
    useWritingStore.getState().addProject('长文', 'article');
    expectWideLayout();

    renderWriting();

    expect(panel()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '长文' })).toHaveAttribute('aria-current', 'true');
  });

  it('一个稿件都没有时右栏给空态引导', () => {
    expectWideLayout();

    renderWriting();

    expect(screen.getByRole('complementary', { name: '创作笔记' })).toHaveTextContent('还没有稿件');
  });

  it('点「创作笔记」在右栏就地写，不再弹对话框', async () => {
    useWritingStore.getState().addProject('长文', 'article');
    expectWideLayout();

    renderWriting();
    await userEvent.click(screen.getByRole('button', { name: '创作笔记' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const aside = panel();
    await userEvent.type(within(aside).getByLabelText('创作笔记'), '第二章要加一个反转');
    await userEvent.click(within(aside).getByRole('button', { name: '保存' }));

    expect(projectOf('长文').notes).toBe('第二章要加一个反转');
    // 同一段文案在列表预览里也有一份，断言收窄到右栏
    expect(within(aside).getByLabelText('创作笔记')).toHaveValue('第二章要加一个反转');
    // 存完右栏不关（常驻），仍停在这个项目上
    expect(panel()).toBeInTheDocument();
  });

  it('「取消」只清草稿，不写回 store', async () => {
    useWritingStore.getState().addProject('长文', 'article');
    expectWideLayout();

    renderWriting();
    await userEvent.click(screen.getByRole('button', { name: '创作笔记' }));

    const aside = panel();
    await userEvent.type(within(aside).getByLabelText('创作笔记'), '不该被保存');
    await userEvent.click(within(aside).getByRole('button', { name: '取消' }));

    expect(projectOf('长文').notes).toBe('');
    expect(panel()).toBeInTheDocument();
  });

  it('再点另一个项目的「创作笔记」，右栏换成那一个', async () => {
    const store = useWritingStore.getState();
    store.addProject('长文', 'article');
    store.addProject('专栏稿', 'article');
    store.updateNotes(projectOf('长文').id, '原来的笔记');
    expectWideLayout();

    renderWriting();
    /** 卡片上的「创作笔记」按钮，按项目标题定位，避免多个项目时选到别的卡 */
    const noteButtonOf = (title: string): HTMLElement =>
      within(screen.getByText(title).closest('li') as HTMLElement).getByRole('button', {
        name: '创作笔记',
      });

    await userEvent.click(noteButtonOf('长文'));
    expect(within(panel('《长文》的创作笔记')).getByLabelText('创作笔记')).toHaveValue(
      '原来的笔记',
    );

    await userEvent.click(noteButtonOf('专栏稿'));
    expect(within(panel('《专栏稿》的创作笔记')).getByLabelText('创作笔记')).toHaveValue('');
  });

  it('正文编辑仍走宽弹窗 —— 它要的是整屏宽度，不是右栏', async () => {
    useWritingStore.getState().addProject('长文', 'article');
    expectWideLayout();

    renderWriting();
    await userEvent.click(screen.getByRole('button', { name: '编辑正文' }));

    // 这一条是刻意的：正文编辑器占的是「写作面积」，塞进 24rem 右栏反而更难写
    expect(screen.getByRole('dialog', { name: '《长文》编辑正文' })).toBeInTheDocument();
    // 右栏不受影响：它常驻在创作笔记上（弹窗是叠加的，不是替换右栏）
    expect(panel()).toBeInTheDocument();
  });

  it('宽屏下命令面板聚焦某篇稿子，还是打开编辑器', () => {
    useWritingStore.getState().addProject('长文', 'article');
    expectWideLayout();

    renderWriting();
    act(() => {
      requestPaletteFocus('/study/writing', projectOf('长文').id);
    });

    expect(screen.getByRole('dialog', { name: '《长文》编辑正文' })).toBeInTheDocument();
  });
});

describe('WritingPage 正文 Markdown', () => {
  it('正文编辑器可以切到预览看排版', async () => {
    useWritingStore.getState().addProject('新文章', 'article');
    renderWriting();

    await userEvent.click(screen.getByRole('button', { name: '编辑正文' }));
    const dialog = screen.getByRole('dialog', { name: /编辑正文/ });
    await userEvent.type(within(dialog).getByLabelText('正文'), '## 小节标题');
    await userEvent.click(within(dialog).getByRole('button', { name: '预览' }));

    expect(within(dialog).getByRole('heading', { level: 2, name: '小节标题' })).toBeInTheDocument();
  });

  it('工具栏插入的标记会随「保存」一起写回正文', async () => {
    useWritingStore.getState().addProject('新文章', 'article');
    renderWriting();

    await userEvent.click(screen.getByRole('button', { name: '编辑正文' }));
    const dialog = screen.getByRole('dialog', { name: /编辑正文/ });
    const textarea = within(dialog).getByLabelText('正文') as HTMLTextAreaElement;
    await userEvent.type(textarea, '列表项');
    await userEvent.click(within(dialog).getByRole('button', { name: '无序列表' }));
    expect(textarea).toHaveValue('- 列表项');

    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(projectOf('新文章').content).toBe('- 列表项');
    expect(projectOf('新文章').wordCount).toBe(5);
  });
});

describe('WritingPage 专注模式', () => {
  it('「专注模式」把正文弹窗铺满视口，重开时复位', async () => {
    useWritingStore.getState().addProject('新文章', 'article');
    renderWriting();

    await userEvent.click(screen.getByRole('button', { name: '编辑正文' }));
    const dialog = screen.getByRole('dialog', { name: /编辑正文/ });
    expect(dialog).toHaveAttribute('data-size', 'lg');

    const focusButton = within(dialog).getByRole('button', { name: '专注模式' });
    await userEvent.click(focusButton);

    expect(dialog).toHaveAttribute('data-size', 'full');
    expect(focusButton).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '编辑正文' }));
    expect(screen.getByRole('dialog', { name: /编辑正文/ })).toHaveAttribute('data-size', 'lg');
  });

  it('专注模式下正文照常能写能存', async () => {
    useWritingStore.getState().addProject('新文章', 'article');
    renderWriting();

    await userEvent.click(screen.getByRole('button', { name: '编辑正文' }));
    const dialog = screen.getByRole('dialog', { name: /编辑正文/ });
    await userEvent.click(within(dialog).getByRole('button', { name: '专注模式' }));

    await userEvent.type(within(dialog).getByLabelText('正文'), '专注写下的字');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(projectOf('新文章').content).toBe('专注写下的字');
  });
});

describe('WritingPage 导出 Word', () => {
  /** 最近一次下载交给 createObjectURL 的 Blob —— 下载被禁的无头环境里，这是离产物最近的一手证据 */
  const lastBlob = (): Blob => {
    const createObjectURL = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    const calls = createObjectURL.mock.calls;
    return calls[calls.length - 1]![0] as Blob;
  };

  it('导出 Word 产出一个 docx 的 Blob', async () => {
    useWritingStore.getState().addProject('可导出的稿子', 'article');
    useWritingStore.getState().updateContent(projectOf('可导出的稿子').id, '正文内容');
    renderWriting();

    await userEvent.click(screen.getByRole('button', { name: '导出《可导出的稿子》为 Word' }));

    const createObjectURL = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = lastBlob();
    expect(blob.type).toBe(DOCX_MIME);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('空正文也能导出，不是零字节文件', async () => {
    useWritingStore.getState().addProject('空白稿', 'article');
    renderWriting();

    await userEvent.click(screen.getByRole('button', { name: '导出《空白稿》为 Word' }));

    const blob = lastBlob();
    expect(blob.type).toBe(DOCX_MIME);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('两个导出按钮各产出对应类型，互不串味', async () => {
    const store = useWritingStore.getState();
    store.addProject('同一篇', 'article');
    store.updateContent(projectOf('同一篇').id, '共同正文');
    renderWriting();

    await userEvent.click(screen.getByRole('button', { name: '导出《同一篇》为 Markdown' }));
    await userEvent.click(screen.getByRole('button', { name: '导出《同一篇》为 Word' }));

    const createObjectURL = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    const calls = createObjectURL.mock.calls;
    expect((calls[0]![0] as Blob).type).toContain('text/plain');
    expect(lastBlob().type).toBe(DOCX_MIME);
  });
});

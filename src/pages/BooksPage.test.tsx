import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BooksPage } from './BooksPage';
import { ToastProvider } from '../components/ui';
import { useBookStore } from '../store/bookStore';
import { requestPaletteFocus, resetPaletteFocus } from '../hooks/usePaletteFocus';
import { MASTER_DETAIL_QUERY } from '../components/layout';
import { mockMediaQueries } from '../test/matchMedia';

beforeEach(() => {
  useBookStore.setState({ books: [], sessions: [] });
});

const bookId = (title: string) => useBookStore.getState().books.find((b) => b.title === title)!.id;

describe('BooksPage 从命令面板打开', () => {
  afterEach(() => {
    resetPaletteFocus();
  });

  it('聚焦某本书时打开它的笔记面板', () => {
    useBookStore.getState().addBook('置身事内', '兰小欢', '');
    render(<BooksPage />);

    act(() => {
      requestPaletteFocus('/study/books', bookId('置身事内'));
    });

    expect(screen.getByRole('dialog', { name: '《置身事内》的笔记' })).toBeInTheDocument();
  });

  it('聚焦一本不存在的书时不弹面板', () => {
    render(<BooksPage />);

    act(() => {
      requestPaletteFocus('/study/books', 'missing');
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('BooksPage', () => {
  it('空态引导添加第一本书', async () => {
    render(<BooksPage />);
    expect(screen.getByText('书单还是空的')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: '添加书籍' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '添加书籍' });

    await userEvent.type(within(dialog).getByLabelText(/^书名/), '人类简史');
    await userEvent.click(within(dialog).getByRole('button', { name: '添加' }));

    expect(useBookStore.getState().books).toHaveLength(1);
    expect(useBookStore.getState().books[0]!.title).toBe('人类简史');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('按状态筛选并显示数量', async () => {
    const store = useBookStore.getState();
    store.addBook('A', '', '');
    store.addBook('B', '', '');
    store.addBook('C', '', '');
    useBookStore.getState().updateBookStatus(bookId('A'), 'reading');
    useBookStore.getState().updateBookStatus(bookId('B'), 'finished');

    render(<BooksPage />);

    expect(screen.getByRole('button', { name: /全部/ })).toHaveTextContent('3');

    await userEvent.click(screen.getByRole('button', { name: /在读/ }));
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });

  it('可以按作者搜索', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    useBookStore.getState().addBook('深入理解计算机系统', 'Randal', '技术');

    render(<BooksPage />);
    await userEvent.type(screen.getByRole('textbox', { name: '搜索' }), 'harari');

    expect(screen.getByText('人类简史')).toBeInTheDocument();
    expect(screen.queryByText('深入理解计算机系统')).not.toBeInTheDocument();
  });

  it('开始阅读后出现进度条，拖动能改进度', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    render(<BooksPage />);

    await userEvent.click(screen.getByRole('button', { name: '开始阅读' }));

    expect(useBookStore.getState().books[0]!.status).toBe('reading');
    const slider = screen.getByRole('slider', { name: '调整「人类简史」的阅读进度' });

    fireEvent.change(slider, { target: { value: '42' } });
    expect(useBookStore.getState().books[0]!.progress).toBe(42);
  });

  it('标记已读会把进度置为 100', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    render(<BooksPage />);

    await userEvent.click(screen.getByRole('button', { name: '标记已读' }));

    const book = useBookStore.getState().books[0]!;
    expect(book.status).toBe('finished');
    expect(book.progress).toBe(100);
  });

  it('笔记可以新增与删除，空内容有提示', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    render(<BooksPage />);

    await userEvent.click(screen.getByRole('button', { name: /笔记（0）/ }));
    const dialog = screen.getByRole('dialog', { name: /人类简史/ });

    await userEvent.click(within(dialog).getByRole('button', { name: '保存笔记' }));
    expect(within(dialog).getByText('笔记内容不能为空')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByRole('textbox', { name: '笔记内容' }), '认知革命很棒');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存笔记' }));

    expect(useBookStore.getState().books[0]!.notes).toHaveLength(1);
    expect(screen.getByText('认知革命很棒')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '删除这条笔记' }));
    expect(useBookStore.getState().books[0]!.notes).toHaveLength(0);
  });

  it('删除书籍要二次确认，文案里提示笔记会一起删', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    useBookStore.getState().addNote(bookId('人类简史'), '一句话笔记');

    render(<BooksPage />);
    await userEvent.click(screen.getByRole('button', { name: '删除《人类简史》' }));

    const dialog = screen.getByRole('dialog', { name: '删除书籍' });
    expect(within(dialog).getByText(/1 条笔记也会一起删除/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(useBookStore.getState().books).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: '删除《人类简史》' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: '删除书籍' })).getByRole('button', {
        name: '删除',
      }),
    );
    expect(useBookStore.getState().books).toHaveLength(0);
  });
  it('书单为空时不显示年度目标环', () => {
    render(<BooksPage />);

    expect(
      screen.queryByRole('progressbar', { name: '年度阅读目标完成度' }),
    ).not.toBeInTheDocument();
  });

  it('年度目标环只统计今年读完的书', () => {
    useBookStore.getState().addBook('人类简史', '赫拉利', '历史');
    useBookStore.getState().addBook('枪炮病菌与钢铁', '戴蒙德', '历史');
    useBookStore.getState().addBook('去年读的', '某人', '历史');
    useBookStore.getState().addBook('待读的书', '某人', '历史');
    const currentYear = new Date().getFullYear();

    useBookStore.getState().updateBookStatus(bookId('人类简史'), 'finished');
    // 标记已读后又改回在读，不算进年度目标
    useBookStore.getState().updateBookStatus(bookId('枪炮病菌与钢铁'), 'finished');
    useBookStore.getState().updateBookStatus(bookId('枪炮病菌与钢铁'), 'reading');
    // 模拟旧数据：状态是已读，但读完时间在去年
    useBookStore.getState().updateBookStatus(bookId('去年读的'), 'finished');
    useBookStore.setState({
      books: useBookStore
        .getState()
        .books.map((book) =>
          book.title === '去年读的'
            ? { ...book, finishedAt: `${currentYear - 1}-12-20T10:00:00.000Z` }
            : book,
        ),
    });

    render(<BooksPage />);

    expect(screen.getByRole('progressbar', { name: '年度阅读目标完成度' })).toHaveAttribute(
      'aria-valuenow',
      '8',
    );
    expect(screen.getByText('1/12')).toBeInTheDocument();
    expect(screen.getByText(`${currentYear} 年已读完 1 本，目标 12 本`)).toBeInTheDocument();
    expect(screen.getByText('已读 2 本')).toBeInTheDocument();
    expect(screen.getByText('在读 1 本')).toBeInTheDocument();
    expect(screen.getByText('想读 1 本')).toBeInTheDocument();
  });

  it('记录阅读会写入流水，近期阅读卡汇总时长', async () => {
    const store = useBookStore.getState();
    store.addBook('人类简史', '赫拉利', '历史');
    store.updateBookStatus(bookId('人类简史'), 'reading');
    render(<BooksPage />);

    await userEvent.click(screen.getByRole('button', { name: '记阅读' }));
    const dialog = screen.getByRole('dialog', { name: '记录阅读' });
    await userEvent.type(within(dialog).getByLabelText('备注'), '第一章');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    const { sessions } = useBookStore.getState();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.bookId).toBe(bookId('人类简史'));
    expect(sessions[0]!.minutes).toBe(30);

    expect(screen.getByText('近期阅读')).toBeInTheDocument();
    expect(screen.getByText(/累计 30 分钟 · 1 条记录/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /近 8 周每周阅读分钟/ })).toBeInTheDocument();
    expect(screen.getByText('第一章')).toBeInTheDocument();
  });

  it('填了总页数后用页码换算进度', async () => {
    const store = useBookStore.getState();
    store.addBook('深入理解计算机系统', '', '技术');
    store.updateBookStatus(bookId('深入理解计算机系统'), 'reading');
    store.updateBook(bookId('深入理解计算机系统'), { totalPages: 200 });
    render(<BooksPage />);

    // 逐位输入：1 -> 0.5%，10 -> 5%，100 -> 50%
    await userEvent.type(screen.getByLabelText('当前页码'), '100');

    expect(useBookStore.getState().books[0]!.totalPages).toBe(200);
    expect(useBookStore.getState().books[0]!.progress).toBe(50);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('删除阅读流水需要确认，且可以撤销', async () => {
    const store = useBookStore.getState();
    store.addBook('人类简史', '', '历史');
    store.addReadingSession(bookId('人类简史'), '2026-09-28', 45, '');
    render(
      <ToastProvider>
        <BooksPage />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: /删除 .* 的《人类简史》阅读记录/ }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: '删除阅读记录' })).getByRole('button', {
        name: '删除',
      }),
    );

    expect(useBookStore.getState().sessions).toHaveLength(0);
    expect(screen.getByText(/已删除 .* 的阅读记录/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(useBookStore.getState().sessions).toHaveLength(1);
  });

  it('开读超过 30 天未完会提醒', () => {
    const store = useBookStore.getState();
    store.addBook('明朝那些事儿', '', '历史');
    const id = bookId('明朝那些事儿');
    store.updateBookStatus(id, 'reading');
    // 把开始时间回拨 40 天，模拟一直没读完
    store.updateBook(id, {
      startedAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
      progress: 20,
    });

    render(<BooksPage />);
    expect(screen.getByText(/开读 40 天未完/)).toBeInTheDocument();
  });

  it('添加时能打标签，标签会显示在卡片上', async () => {
    render(<BooksPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '添加书籍' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '添加书籍' });

    await userEvent.type(within(dialog).getByLabelText(/^书名/), '置身事内');
    await userEvent.type(within(dialog).getByLabelText('标签'), '经济{Enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: '添加' }));

    expect(useBookStore.getState().books[0]!.tags).toEqual(['经济']);
    expect(screen.getByText('#经济')).toBeInTheDocument();
  });

  it('卡片上可以就地补标签，标签会写回 store', async () => {
    useBookStore.getState().addBook('置身事内', '兰小欢', '');
    render(<BooksPage />);

    await userEvent.click(screen.getByRole('button', { name: '添加标签' }));
    await userEvent.type(screen.getByLabelText('编辑标签'), '经济{Enter}');
    await userEvent.click(screen.getByRole('button', { name: '完成' }));

    expect(useBookStore.getState().books[0]!.tags).toEqual(['经济']);
    expect(screen.getByText('#经济')).toBeInTheDocument();
  });

  it('搜索框里输入 #标签 能筛出对应的书', async () => {
    const store = useBookStore.getState();
    store.addBook('置身事内', '兰小欢', '经济', ['经济']);
    store.addBook('人类简史', 'Harari', '历史', ['历史']);
    render(<BooksPage />);

    await userEvent.type(screen.getByRole('textbox', { name: /搜索/ }), '#经济');
    expect(screen.getByText('置身事内')).toBeInTheDocument();
    expect(screen.queryByText('人类简史')).not.toBeInTheDocument();
  });
});

describe('BooksPage 宽屏双栏', () => {
  afterEach(() => {
    resetPaletteFocus();
  });

  const expectWideLayout = (): void => mockMediaQueries({ [MASTER_DETAIL_QUERY]: true });

  it('宽屏右栏常驻，没选中书时是占位内容', () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    expectWideLayout();

    render(<BooksPage />);

    const panel = screen.getByRole('complementary', { name: '读书笔记' });
    expect(within(panel).getByText('还没有选中书')).toBeInTheDocument();
    expect(screen.getByText('人类简史')).toBeInTheDocument();
  });

  it('点「笔记」在右栏就地编辑，不再弹对话框', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    expectWideLayout();

    render(<BooksPage />);
    await userEvent.click(screen.getByRole('button', { name: /笔记（0）/ }));

    // 焦点没有被搬进对话框，列表也还在
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('人类简史')).toBeInTheDocument();

    const panel = screen.getByRole('complementary', { name: '《人类简史》的笔记' });
    await userEvent.type(within(panel).getByRole('textbox', { name: '笔记内容' }), '认知革命很棒');
    await userEvent.click(within(panel).getByRole('button', { name: '保存笔记' }));

    expect(useBookStore.getState().books[0]!.notes).toHaveLength(1);
    expect(within(panel).getByText('认知革命很棒')).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: '删除这条笔记' }));
    expect(useBookStore.getState().books[0]!.notes).toHaveLength(0);
  });

  it('宽屏下命令面板聚焦某本书，也直接进右栏', () => {
    useBookStore.getState().addBook('置身事内', '兰小欢', '');
    expectWideLayout();

    render(<BooksPage />);
    act(() => {
      requestPaletteFocus('/study/books', bookId('置身事内'));
    });

    expect(screen.getByRole('complementary', { name: '《置身事内》的笔记' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('再点另一本书的「笔记」，右栏换成那一本', async () => {
    const store = useBookStore.getState();
    store.addBook('置身事内', '兰小欢', '');
    store.addBook('人类简史', 'Harari', '历史');
    store.addNote(bookId('置身事内'), '地方政府的经济逻辑');
    expectWideLayout();

    render(<BooksPage />);
    await userEvent.click(screen.getByRole('button', { name: /笔记（1）/ }));

    let panel = screen.getByRole('complementary', { name: '《置身事内》的笔记' });
    expect(within(panel).getByText('地方政府的经济逻辑')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /笔记（0）/ }));
    panel = screen.getByRole('complementary', { name: '《人类简史》的笔记' });
    expect(within(panel).getByText('还没有笔记')).toBeInTheDocument();
  });
});

describe('BooksPage F11 条目化媒体库', () => {
  const expectWideLayout = (): void => mockMediaQueries({ [MASTER_DETAIL_QUERY]: true });
  const panelOf = (title: string): HTMLElement =>
    screen.getByRole('complementary', { name: `《${title}》的笔记` });
  const bookOf = (title: string) =>
    useBookStore.getState().books.find((book) => book.title === title)!;

  it('列表里的星标立即生效，评分以角标显示', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');

    render(<BooksPage />);

    expect(screen.queryByText('★ 9')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '收藏《人类简史》' }));
    expect(bookOf('人类简史').favorite).toBe(true);
    expect(screen.getByRole('button', { name: '取消收藏《人类简史》' })).toBeInTheDocument();

    act(() => {
      useBookStore.getState().updateBook(bookOf('人类简史').id, { rating: 9 });
    });
    expect(screen.getByText('★ 9')).toBeInTheDocument();
  });

  it('评分与短评随「保存」写入，「取消」不落盘', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    expectWideLayout();

    render(<BooksPage />);

    // 先点一堆草稿再取消
    await userEvent.click(screen.getByRole('button', { name: /笔记（0）/ }));
    let panel = panelOf('人类简史');
    await userEvent.click(within(panel).getByRole('button', { name: '7' }));
    await userEvent.type(within(panel).getByLabelText('短评'), '不该被保存');
    await userEvent.click(within(panel).getByRole('button', { name: '取消' }));
    expect(bookOf('人类简史').rating).toBe(0);
    expect(bookOf('人类简史').review).toBe('');

    // 重新打开：草稿按 store 现状初始化，上次那 7 分不该留着
    await userEvent.click(screen.getByRole('button', { name: /笔记（0）/ }));
    panel = panelOf('人类简史');
    expect(within(panel).getByRole('button', { name: '7' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await userEvent.click(within(panel).getByRole('button', { name: '7' }));
    await userEvent.type(within(panel).getByLabelText('短评'), '值得一读再读');
    await userEvent.click(within(panel).getByRole('button', { name: '保存' }));

    expect(bookOf('人类简史').rating).toBe(7);
    expect(bookOf('人类简史').review).toBe('值得一读再读');
  });

  it('状态时间线记录每次变更，重复设同一状态不重复记', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    const id = bookId('人类简史');
    act(() => {
      useBookStore.getState().updateBookStatus(id, 'reading');
      useBookStore.getState().updateBookStatus(id, 'reading');
      useBookStore.getState().updateBookStatus(id, 'finished');
    });
    expectWideLayout();

    render(<BooksPage />);
    await userEvent.click(screen.getByRole('button', { name: /笔记（0）/ }));

    const timeline = within(panelOf('人类简史')).getByText('状态时间线').parentElement!;
    expect(within(timeline).getByText('在读')).toBeInTheDocument();
    expect(within(timeline).getByText('已读')).toBeInTheDocument();
    expect(within(timeline).getAllByText('在读')).toHaveLength(1);
  });

  it('没改过状态的书不显示时间线，笔记仍是「立即保存」', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    expectWideLayout();

    render(<BooksPage />);
    await userEvent.click(screen.getByRole('button', { name: /笔记（0）/ }));

    const panel = panelOf('人类简史');
    expect(within(panel).queryByText('状态时间线')).not.toBeInTheDocument();

    // 笔记不经过「保存」按钮：点了 5 分但没保存，笔记照样落盘，评分仍是 0
    await userEvent.click(within(panel).getByRole('button', { name: '5' }));
    await userEvent.type(within(panel).getByRole('textbox', { name: '笔记内容' }), '认知革命很棒');
    await userEvent.click(within(panel).getByRole('button', { name: '保存笔记' }));

    expect(bookOf('人类简史').notes).toHaveLength(1);
    expect(bookOf('人类简史').rating).toBe(0);
  });

  it('「只看收藏」筛选：只留星标条目，角标跟着收藏数走', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    useBookStore.getState().addBook('1984', 'Orwell', '小说');
    expectWideLayout();

    render(<BooksPage />);
    expect(screen.getByText('人类简史')).toBeInTheDocument();
    expect(screen.getByText('1984')).toBeInTheDocument();

    // 收藏一本：按钮上的角标跟着变
    await userEvent.click(screen.getByRole('button', { name: '收藏《人类简史》' }));
    expect(screen.getByRole('button', { name: /只看收藏/ })).toHaveTextContent('1');

    // 打开筛选：只剩收藏过的那本
    await userEvent.click(screen.getByRole('button', { name: /只看收藏/ }));
    expect(screen.getByRole('button', { name: /只看收藏/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('人类简史')).toBeInTheDocument();
    expect(screen.queryByText('1984')).not.toBeInTheDocument();

    // 再点一次：两本都回来
    await userEvent.click(screen.getByRole('button', { name: /只看收藏/ }));
    expect(screen.queryByText('1984')).toBeInTheDocument();
  });

  it('一条收藏都没有时，收藏筛选筛空要能一键清除', async () => {
    useBookStore.getState().addBook('人类简史', 'Harari', '历史');
    expectWideLayout();

    render(<BooksPage />);
    await userEvent.click(screen.getByRole('button', { name: /只看收藏/ }));

    // 有数据、被筛空 → 走「没有符合条件」，而不是「书单还是空的」
    expect(screen.getByText('没有符合条件的书')).toBeInTheDocument();
    expect(screen.queryByText('书单还是空的')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '清除筛选' }));
    expect(screen.getByRole('button', { name: /只看收藏/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText('人类简史')).toBeInTheDocument();
  });
});

describe('BooksPage 批量操作', () => {
  const seed = (): void => {
    const store = useBookStore.getState();
    store.addBook('置身事内', '兰小欢', '经济');
    store.addBook('1984', 'Orwell', '小说');
    store.addBook('人类简史', 'Harari', '历史');
  };

  const bar = () => within(screen.getByRole('toolbar', { name: '批量操作' }));

  it('点「批量」进入批量模式，单条删除图标藏起来', async () => {
    seed();
    render(<BooksPage />);

    expect(screen.queryByRole('toolbar', { name: '批量操作' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '批量' }));

    expect(screen.getByRole('toolbar', { name: '批量操作' })).toBeInTheDocument();
    expect(bar().getByText('1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除《1984》' })).not.toBeInTheDocument();
  });

  it('全选后批量改阅读状态', async () => {
    seed();
    render(<BooksPage />);
    await userEvent.click(screen.getByRole('button', { name: '批量' }));
    await userEvent.click(screen.getByRole('button', { name: '全选' }));

    expect(bar().getByText('3')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('批量修改阅读状态'), 'finished');

    expect(useBookStore.getState().books.every((book) => book.status === 'finished')).toBe(true);
  });

  it('批量打标签只影响选中的那几本', async () => {
    seed();
    render(<BooksPage />);
    await userEvent.click(screen.getByRole('button', { name: '批量' }));

    // 只勾一本，验证「批量」不会顺手改到没选的
    await userEvent.click(screen.getByLabelText('选中《1984》'));
    await userEvent.click(screen.getByRole('button', { name: '打标签' }));

    const dialog = screen.getByRole('dialog', { name: '批量打标签' });
    expect(within(dialog).getByText(/将对选中的 2 本书生效/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('textbox', { name: '标签' }), '反乌托邦{enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: '应用' }));

    const store = useBookStore.getState();
    expect(store.books.find((book) => book.title === '1984')!.tags).toEqual(['反乌托邦']);
    expect(store.books.find((book) => book.title === '人类简史')!.tags).toEqual([]);
  });

  it('批量删除要二次确认，删完能整体撤销', async () => {
    seed();
    render(
      <ToastProvider>
        <BooksPage />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: '批量' }));
    await userEvent.click(screen.getByRole('button', { name: '全选' }));
    await userEvent.click(screen.getByRole('button', { name: '删除' }));

    const dialog = screen.getByRole('dialog', { name: '批量删除书籍' });
    expect(within(dialog).getByText(/选中的 3 本书/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: '删除' }));

    expect(useBookStore.getState().books).toHaveLength(0);
    expect(screen.queryByRole('toolbar', { name: '批量操作' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(useBookStore.getState().books).toHaveLength(3);
  });

  it('「只看收藏」把已选中的书筛掉后，它自动退出选中集', async () => {
    seed();
    render(<BooksPage />);
    await userEvent.click(screen.getByRole('button', { name: '批量' }));
    await userEvent.click(screen.getByRole('button', { name: '全选' }));
    expect(bar().getByText('3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /只看收藏/ }));

    expect(screen.queryByRole('toolbar', { name: '批量操作' })).not.toBeInTheDocument();
  });

  it('添加书籍弹窗里按回车直接提交（U7）', async () => {
    render(<BooksPage />);

    await userEvent.click(screen.getAllByRole('button', { name: '添加书籍' })[0]!);
    const dialog = screen.getByRole('dialog', { name: '添加书籍' });

    await userEvent.type(within(dialog).getByLabelText(/^书名/), '回车添加的书{Enter}');

    expect(useBookStore.getState().books[0]!.title).toBe('回车添加的书');
  });
});

describe('BooksPage 行间键盘导航（U8）', () => {
  it('j / k 在书之间走，x 就地进批量模式 —— 全程不用碰 Tab', async () => {
    const user = userEvent.setup();
    useBookStore.getState().addBook('置身事内', '兰小欢', '');
    useBookStore.getState().addBook('万历十五年', '黄仁宇', '');
    render(<BooksPage />);

    const notes = screen.getAllByRole('button', { name: /^笔记/ });
    expect(notes).toHaveLength(2);

    // 只聚焦不点击：点「笔记」会打开笔记面板，焦点会被搬进抽屉
    notes[0]!.focus();
    await user.keyboard('j');
    expect(notes[1]).toHaveFocus();

    await user.keyboard('k');
    expect(notes[0]).toHaveFocus();

    // x = 选中当前这一行；焦点留在原处，用户接着按 j / x 就能连选
    await user.keyboard('x');
    expect(screen.getByRole('checkbox', { name: '选中《置身事内》' })).toBeChecked();
    expect(notes[0]).toHaveFocus();
  });
});

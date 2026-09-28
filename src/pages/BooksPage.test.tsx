import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BooksPage } from './BooksPage';
import { useBookStore } from '../store/bookStore';

beforeEach(() => {
  useBookStore.setState({ books: [] });
});

const bookId = (title: string) => useBookStore.getState().books.find((b) => b.title === title)!.id;

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
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MarkdownEditor } from './MarkdownEditor';

/** 受控组件：外面套一个持有状态的壳，模拟写作页里的用法 */
const setup = (initial = ''): HTMLTextAreaElement => {
  const Holder: React.FC = () => {
    const [value, setValue] = React.useState(initial);
    return <MarkdownEditor label="正文" value={value} onChange={setValue} />;
  };
  render(<Holder />);
  return screen.getByLabelText('正文') as HTMLTextAreaElement;
};

const toolbarButtons = (): HTMLElement[] =>
  Array.from(screen.getByRole('toolbar', { name: 'Markdown 快捷插入' }).querySelectorAll('button'));

describe('MarkdownEditor', () => {
  it('有选区时按「加粗」包住选中文字，焦点与选区都留在正文里', async () => {
    const textarea = setup('这是一段测试文字');
    textarea.setSelectionRange(2, 4);

    await userEvent.click(screen.getByRole('button', { name: '加粗' }));

    expect(textarea).toHaveValue('这是**一段**测试文字');
    expect(textarea.selectionStart).toBe(4);
    expect(textarea.selectionEnd).toBe(6);
    expect(document.activeElement).toBe(textarea);
  });

  it('没有选区时插入占位内容并选中它，接着打字就能覆盖', async () => {
    const textarea = setup('');
    await userEvent.click(screen.getByRole('button', { name: '斜体' }));

    expect(textarea).toHaveValue('*斜体文本*');
    expect(textarea.selectionStart).toBe(1);
    expect(textarea.selectionEnd).toBe(5);
  });

  it('「无序列表」把选区覆盖到的行变成列表项', async () => {
    const textarea = setup('甲\n乙');
    textarea.setSelectionRange(0, 3);

    await userEvent.click(screen.getByRole('button', { name: '无序列表' }));

    expect(textarea).toHaveValue('- 甲\n- 乙');
  });

  it('空文档里按下列表按钮会先起一个项目符号', async () => {
    const textarea = setup('');
    await userEvent.click(screen.getByRole('button', { name: '有序列表' }));

    expect(textarea).toHaveValue('1. ');
    expect(textarea.selectionStart).toBe(3);
  });

  it('「链接」把选中文字放进文字位，光标停在地址位', async () => {
    const textarea = setup('文档');
    textarea.setSelectionRange(0, 2);

    await userEvent.click(screen.getByRole('button', { name: '链接' }));

    expect(textarea).toHaveValue('[文档](https://)');
    expect(textarea.selectionStart).toBe(5);
    expect(textarea.selectionEnd).toBe(13);
  });

  it('切到「预览」后渲染标题与粗体，工具栏收起', async () => {
    setup('# 标题\n\n**粗**');

    await userEvent.click(screen.getByRole('button', { name: '预览' }));

    expect(screen.getByRole('heading', { level: 1, name: '标题' })).toBeInTheDocument();
    expect(screen.getByText('粗').tagName).toBe('STRONG');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('预览不会执行正文里的 HTML', async () => {
    setup('<script>alert(1)</script>');

    await userEvent.click(screen.getByRole('button', { name: '预览' }));

    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('「分栏」同时显示编辑框与预览', async () => {
    setup('# 标题');

    await userEvent.click(screen.getByRole('button', { name: '分栏' }));

    expect(screen.getByLabelText('正文')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: '标题' })).toBeInTheDocument();
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('每个快捷插入按钮都有可读名称', () => {
    setup();
    expect(toolbarButtons().map((button) => button.getAttribute('aria-label'))).toEqual([
      '标题',
      '加粗',
      '斜体',
      '删除线',
      '行内代码',
      '无序列表',
      '有序列表',
      '引用',
      '链接',
      '代码块',
    ]);
  });
});

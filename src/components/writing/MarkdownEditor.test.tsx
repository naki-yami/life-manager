import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

/** 40 行正文，用来验证打字机滚动的落点 */
const LONG_DOC = Array.from({ length: 40 }, (_, i) => `第${i}行`).join('\n');

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

  it('打开「打字机滚动」会把光标行滚到可视区中线附近', async () => {
    const textarea = setup(LONG_DOC);
    // jsdom 没有排版，可视区高度与滚动位置都得自己造出来
    Object.defineProperty(textarea, 'clientHeight', { value: 240, configurable: true });
    Object.defineProperty(textarea, 'scrollTop', { value: 0, writable: true, configurable: true });
    const caret = LONG_DOC.split('\n').slice(0, 30).join('\n').length + 1;
    textarea.setSelectionRange(caret, caret);

    const toggle = screen.getByRole('button', { name: '打字机滚动' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(textarea.scrollTop).toBeGreaterThan(0);
  });

  it('开着时方向键移动光标也会把光标行带回中线（不只靠开开关那一下）', async () => {
    const textarea = setup(LONG_DOC);
    Object.defineProperty(textarea, 'clientHeight', { value: 240, configurable: true });
    Object.defineProperty(textarea, 'scrollTop', { value: 0, writable: true, configurable: true });

    await userEvent.click(screen.getByRole('button', { name: '打字机滚动' }));

    textarea.scrollTop = 0;
    const caret = LONG_DOC.split('\n').slice(0, 30).join('\n').length + 1;
    textarea.setSelectionRange(caret, caret);
    fireEvent.keyUp(textarea);

    expect(textarea.scrollTop).toBeGreaterThan(0);
  });

  it('关掉「打字机滚动」后光标移动不再自动滚', async () => {
    const textarea = setup(LONG_DOC);
    Object.defineProperty(textarea, 'clientHeight', { value: 240, configurable: true });
    Object.defineProperty(textarea, 'scrollTop', { value: 0, writable: true, configurable: true });

    const toggle = screen.getByRole('button', { name: '打字机滚动' });
    await userEvent.click(toggle);
    await userEvent.click(toggle);

    textarea.scrollTop = 7;
    fireEvent.keyUp(textarea);

    expect(textarea.scrollTop).toBe(7);
  });

  it('没传 onToggleFocus 时不渲染「专注模式」按钮', () => {
    setup();
    expect(screen.queryByRole('button', { name: '专注模式' })).not.toBeInTheDocument();
  });

  it('传了 onToggleFocus 才有「专注模式」按钮，按下态跟着 focus 走', async () => {
    const onToggle = vi.fn();
    const Holder: React.FC = () => {
      const [value, setValue] = React.useState('');
      const [focus, setFocus] = React.useState(false);
      return (
        <MarkdownEditor
          label="正文"
          value={value}
          onChange={setValue}
          focus={focus}
          onToggleFocus={() => {
            onToggle();
            setFocus((on) => !on);
          }}
        />
      );
    };
    render(<Holder />);

    expect(screen.getByRole('button', { name: '专注模式' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await userEvent.click(screen.getByRole('button', { name: '专注模式' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '专注模式' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

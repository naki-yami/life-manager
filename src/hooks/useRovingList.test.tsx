import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ROW_FOCUS_PROP, rowProps, useRovingList } from './useRovingList';

/**
 * 大多数用例都用这一份：三行，每行一个标了锚点的「笔记」按钮 ——
 * 正好对应「书房 / 游戏那一行点开详情」的真实形状。
 */
const ListHarness: React.FC<{
  ids?: string[];
  onToggleSelect?: (id: string) => void;
  renderRow?: (id: string) => React.ReactNode;
}> = ({ ids = ['a', 'b', 'c'], onToggleSelect, renderRow }) => {
  const list = useRovingList({ ids, onToggleSelect });
  return (
    // 与页面上的用法一致：handler 挂在列表容器上
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <ul aria-label="书单" onKeyDown={list.onKeyDown}>
      {ids.map((id) => (
        <li key={id} {...rowProps(id)}>
          {renderRow ? (
            renderRow(id)
          ) : (
            <button type="button" {...ROW_FOCUS_PROP}>
              {`笔记 ${id}`}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
};

const anchor = (id: string): HTMLElement => screen.getByRole('button', { name: `笔记 ${id}` });

describe('useRovingList', () => {
  it('j / k 与上下方向键在行之间移动焦点，落在行内标了 data-row-focus 的控件上', async () => {
    const user = userEvent.setup();
    render(<ListHarness />);

    await user.click(anchor('a'));

    await user.keyboard('j');
    expect(anchor('b')).toHaveFocus();
    await user.keyboard('j');
    expect(anchor('c')).toHaveFocus();

    await user.keyboard('k');
    expect(anchor('b')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(anchor('c')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(anchor('b')).toHaveFocus();
  });

  it('Home / End 直接到首尾', async () => {
    const user = userEvent.setup();
    render(<ListHarness />);

    await user.click(anchor('b'));
    await user.keyboard('{End}');
    expect(anchor('c')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(anchor('a')).toHaveFocus();
  });

  it('到头了停住，不越界也不把上下键漏给页面', async () => {
    const user = userEvent.setup();
    render(<ListHarness />);

    await user.click(anchor('a'));
    await user.keyboard('k');
    expect(anchor('a')).toHaveFocus();

    const event = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    anchor('c').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('行里没标锚点时退到第一个可聚焦控件', async () => {
    const user = userEvent.setup();
    render(<ListHarness renderRow={(id) => <button type="button">{`打开 ${id}`}</button>} />);

    await user.click(screen.getByRole('button', { name: '打开 a' }));
    await user.keyboard('j');

    expect(screen.getByRole('button', { name: '打开 b' })).toHaveFocus();
  });

  it('行里一个可聚焦控件都没有时，焦点落在行本身（行是 tabIndex=-1 的）', async () => {
    const user = userEvent.setup();
    render(<ListHarness renderRow={(id) => <span>{`纯文本 ${id}`}</span>} />);

    const first = screen.getByText('纯文本 a').closest('li');
    const second = screen.getByText('纯文本 b').closest('li');
    expect(first).toHaveAttribute('tabindex', '-1');

    (first as HTMLElement).focus();
    await user.keyboard('j');

    expect(second).toHaveFocus();
  });

  it('x 把当前行交给页面去切换选中，且不拦回车（回车留给锚点自己的动作）', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    render(<ListHarness onToggleSelect={onToggleSelect} />);

    await user.click(anchor('b'));
    await user.keyboard('x');

    expect(onToggleSelect).toHaveBeenCalledWith('b');
    // 回车没被吞掉：焦点还在锚点上，浏览器自己会激活它
    await user.keyboard('{Enter}');
    expect(anchor('b')).toHaveFocus();
  });

  it('没传 onToggleSelect 时 x 什么都不做 —— 没有批量操作的列表不该假装有', async () => {
    const user = userEvent.setup();
    render(<ListHarness />);

    await user.click(anchor('a'));
    await user.keyboard('x');

    expect(anchor('a')).toHaveFocus();
  });

  it('在行内的输入框里打字时，j / k / x 全部让路', async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    render(
      <ListHarness
        onToggleSelect={onToggleSelect}
        renderRow={(id) => (
          <>
            <input aria-label={`备注 ${id}`} />
            <button type="button" {...ROW_FOCUS_PROP}>
              {`笔记 ${id}`}
            </button>
          </>
        )}
      />,
    );

    const input = screen.getByLabelText('备注 a');
    await user.click(input);
    await user.keyboard('jkx');

    expect(input).toHaveValue('jkx');
    expect(input).toHaveFocus();
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it('按住 Ctrl / ⌘ 时不接管 —— 那是浏览器快捷键的地盘', async () => {
    const user = userEvent.setup();
    render(<ListHarness />);

    await user.click(anchor('a'));
    await user.keyboard('{Control>}j{/Control}');

    expect(anchor('a')).toHaveFocus();
  });
});

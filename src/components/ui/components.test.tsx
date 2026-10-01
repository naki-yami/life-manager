import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  Badge,
  BADGE_TONES,
  Button,
  ConfirmDialog,
  Drawer,
  EmptyState,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Slider,
  StatStrip,
  Switch,
  ToastProvider,
  Tooltip,
  useToast,
} from './index';

import type { BadgeTone } from './index';

describe('Badge', () => {
  const TONES: BadgeTone[] = ['default', 'accent', 'success', 'warning', 'danger', 'info'];

  it('六个档位都有配色类名，并会渲染到元素上', () => {
    expect(Object.keys(BADGE_TONES).sort()).toEqual([...TONES].sort());

    for (const tone of TONES) {
      const { container } = render(<Badge tone={tone}>徽章</Badge>);
      expect(container.firstElementChild!.className).toContain(BADGE_TONES[tone]);
    }
  });

  it('不传 tone 时用 default 档', () => {
    const { container } = render(<Badge>徽章</Badge>);
    expect(container.firstElementChild!.className).toContain(BADGE_TONES.default);
  });
});

describe('Button', () => {
  it('loading 时禁用点击并标记 aria-busy', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        提交
      </Button>,
    );

    const button = screen.getByRole('button', { name: /提交/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('默认 type 是 button，避免误触发表单提交', () => {
    render(<Button>普通</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('IconButton', () => {
  it('把 label 同时用作 aria-label 与 title（图标按钮必须有可读名字）', () => {
    render(<IconButton label="删除任务" icon={<span>×</span>} />);
    const button = screen.getByRole('button', { name: '删除任务' });
    expect(button).toHaveAttribute('title', '删除任务');
  });
});

describe('Input', () => {
  it('错误态：aria-invalid + role=alert', () => {
    render(<Input label="名称" value="" onChange={() => {}} error="不能为空" />);
    const input = screen.getByLabelText(/名称/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('不能为空');
  });

  it('帮助文本通过 aria-describedby 关联', () => {
    render(<Input label="名称" value="" onChange={() => {}} hint="最多 50 字" />);
    const input = screen.getByLabelText(/名称/);
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('最多 50 字');
  });

  it('multiline 时渲染 textarea', () => {
    render(<Input label="备注" value="" onChange={() => {}} multiline rows={2} />);
    expect(screen.getByLabelText(/备注/).tagName).toBe('TEXTAREA');
  });
});

describe('Switch', () => {
  it('点击切换并同步 aria-checked', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="自动保存" />);

    const control = screen.getByRole('switch', { name: '自动保存' });
    expect(control).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Slider', () => {
  it('拖动时回传数值', () => {
    const onChange = vi.fn();
    render(<Slider label="进度" value={10} onChange={onChange} min={0} max={100} />);

    fireEvent.change(screen.getByLabelText('进度'), { target: { value: '55' } });
    expect(onChange).toHaveBeenCalledWith(55);
  });
});

describe('SegmentedControl', () => {
  it('用 aria-pressed 表达当前选中项', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="切换视图"
        value="list"
        onChange={onChange}
        options={[
          { value: 'list', label: '列表' },
          { value: 'board', label: '看板' },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: '列表' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '看板' })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: '看板' }));
    expect(onChange).toHaveBeenCalledWith('board');
  });

  it('默认是胶囊皮肤：页内筛选还是老样子', () => {
    render(
      <SegmentedControl
        label="切换视图"
        value="list"
        onChange={() => {}}
        options={[{ value: 'list', label: '列表' }]}
      />,
    );

    const group = screen.getByRole('group', { name: '切换视图' });
    expect(group.className).toContain('bg-inset');
    expect(group.className).not.toContain('border-b ');
  });

  it('underline 皮肤：同样一组 aria-pressed 按钮，但换成「文字 + 下方指示线」', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="书房内的页面"
        variant="underline"
        value="books"
        onChange={onChange}
        options={[
          { value: 'books', label: '读书' },
          { value: 'writing', label: '写作' },
        ]}
      />,
    );

    // 语义没变：还是一组切换按钮，不是 tab
    const group = screen.getByRole('group', { name: '书房内的页面' });
    expect(group).toHaveClass('border-b');
    // 但不再是胶囊底 —— 那正是页内筛选的样子，导航要能一眼分清
    expect(group.className).not.toContain('bg-inset');

    expect(screen.getByRole('button', { name: '读书' }).className).toContain('border-accent');
    expect(screen.getByRole('button', { name: '写作' }).className).toContain('border-transparent');

    await userEvent.click(screen.getByRole('button', { name: '写作' }));
    expect(onChange).toHaveBeenCalledWith('writing');
  });
});

describe('Modal', () => {
  it('打开时把焦点移到弹层内，Esc 触发关闭', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="确认导入">
        <p>内容</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('size 为 full 时铺满视口，留给写作专注模式', () => {
    render(
      <Modal isOpen onClose={() => {}} title="专注写作" size="full">
        <p>正文</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-size', 'full');
    expect(dialog.className).toContain('h-full');
    expect(dialog.className).not.toContain('max-w-2xl');
    // 全屏态不留外边距，背景的侧栏才被整块盖住
    expect((dialog.parentElement as HTMLElement).className).toContain('p-0');
    expect((dialog.parentElement as HTMLElement).className).not.toContain('sm:p-page');
  });

  it('关闭时不渲染任何内容', () => {
    render(
      <Modal isOpen={false} onClose={() => {}} title="隐藏的弹层">
        <p>内容</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('requireText 未输入正确确认词前禁用确认按钮', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        onClose={() => {}}
        onConfirm={onConfirm}
        title="清空数据"
        requireText="清空"
      />,
    );

    const confirm = screen.getByRole('button', { name: '确认' });
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/请输入/), '清空');
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('Toast', () => {
  const Trigger: React.FC = () => {
    const { toast } = useToast();
    const [count, setCount] = useState(0);
    return (
      <>
        <button type="button" onClick={() => toast({ title: '已保存', tone: 'success' })}>
          保存
        </button>
        <button
          type="button"
          onClick={() =>
            toast({
              title: '已删除',
              action: { label: '撤销', onClick: () => setCount((c) => c + 1) },
            })
          }
        >
          删除
        </button>
        <span data-testid="undo-count">{count}</span>
      </>
    );
  };

  it('推送后显示，超时自动消失', async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
    });
    expect(screen.getByText('已保存')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('action 按钮可触发回调并关闭通知', async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '删除' }));
    });

    await userEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(screen.getByTestId('undo-count')).toHaveTextContent('1');
  });

  it('useToast 在 Provider 之外使用时给出明确报错', () => {
    // 用 renderToString 触发：纯同步抛错，不经过 react-dom 客户端的伪事件通道，
    // 因此不会把错误额外报告给 jsdom 的虚拟控制台。
    expect(() => renderToString(<Trigger />)).toThrow(/ToastProvider/);
  });
});
describe('Tooltip', () => {
  it('聚焦时通过 aria-describedby 暴露说明文字', () => {
    render(
      <Tooltip content="补充说明">
        <button type="button">目标</button>
      </Tooltip>,
    );

    const target = screen.getByRole('button', { name: '目标' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.focus(target);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('补充说明');
    expect(target).toHaveAttribute('aria-describedby', tooltip.id);
  });
});

describe('EmptyState / ErrorState', () => {
  it('EmptyState 提供操作入口', () => {
    render(
      <EmptyState title="还没有书" description="添加第一本书" action={<Button>添加</Button>} />,
    );
    expect(screen.getByText('还没有书')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加' })).toBeInTheDocument();
  });

  it('titleAs 可以换成 h1，供整页空态当主标题用', () => {
    render(<EmptyState titleAs="h1" title="找不到这个页面" description="地址可能写错了" />);

    const heading = screen.getByRole('heading', { level: 1, name: '找不到这个页面' });
    expect(heading).toHaveClass('text-2xl');
  });
});

describe('StatStrip', () => {
  const ITEMS = [
    { label: '待办任务', value: 3, unit: '项', tone: 'accent' as const, hint: '已完成 1 项' },
    { label: '今日完成率', value: 100, unit: '%', tone: 'success' as const },
    { label: '连续打卡', value: 0, unit: '天' },
    { label: '近 7 天完成', value: 12, unit: '项', trend: { value: 50, label: '较上一周' } },
  ];

  it('四项排成一条，整组带可读名字', () => {
    render(<StatStrip label="概览统计" items={ITEMS} />);

    const group = screen.getByRole('group', { name: '概览统计' });
    expect(group.children).toHaveLength(4);
    for (const label of ['待办任务', '今日完成率', '连续打卡', '近 7 天完成']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('数字按 tone 上色，单位跟在数字后面', () => {
    render(<StatStrip label="概览统计" items={ITEMS} />);

    expect(screen.getByText('3')).toHaveClass('text-accent');
    expect(screen.getByText('100')).toHaveClass('text-success');
    expect(screen.getByText('0')).toHaveClass('text-content');
    expect(screen.getAllByText('项')).toHaveLength(2);
    expect(screen.getByText('天')).toBeInTheDocument();
  });

  it('环比带正负号与百分号，涨跌换色', () => {
    render(<StatStrip label="概览统计" items={ITEMS} />);
    expect(screen.getByText('+50%')).toHaveClass('tabular');
    expect(screen.getByText('较上一周')).toBeInTheDocument();

    render(
      <StatStrip label="环比" items={[{ label: '日均完成', value: 2, trend: { value: -25 } }]} />,
    );
    expect(screen.getByText('-25%')).toBeInTheDocument();
  });

  it('hint 渲染在数字下方，可以塞自定义节点', () => {
    render(
      <StatStrip
        label="概览统计"
        items={[{ label: '近 7 天完成', value: 12, hint: <span>迷你趋势图</span> }]}
      />,
    );

    expect(screen.getByText('迷你趋势图')).toBeInTheDocument();
  });
});

describe('窄屏适配', () => {
  it('Modal 在窄屏用固定外边距，回到 sm 后再跟随密度令牌', () => {
    render(
      <Modal isOpen onClose={() => {}} title="窄屏弹层">
        <p>内容</p>
      </Modal>,
    );

    const wrapper = screen.getByRole('dialog').parentElement as HTMLElement;
    expect(wrapper.className).toContain('p-4');
    expect(wrapper.className).toContain('sm:p-page');
  });

  it('SegmentedControl 允许选项换行，选项多时不会撑破容器', () => {
    render(
      <SegmentedControl
        label="切换视图"
        value="all"
        onChange={() => {}}
        options={[
          { value: 'all', label: '全部', count: 12 },
          { value: 'playing', label: '在玩', count: 3 },
          { value: 'completed', label: '已通关', count: 5 },
        ]}
      />,
    );

    expect(screen.getByRole('group', { name: '切换视图' }).className).toContain('flex-wrap');
  });

  it('Drawer 面板不超过视口宽度，窄屏上也能看到遮罩', () => {
    render(
      <Drawer isOpen onClose={() => {}} title="导航">
        <p>内容</p>
      </Drawer>,
    );

    expect(screen.getByRole('dialog', { name: '导航' }).className).toContain('max-w-[85vw]');
  });
});

/**
 * 浮层关闭后的焦点归还（U8）。
 *
 * 三个浮层共用 useFocusTrap 的同一份实现，所以这里也共用一套写法：点「打开」的那个按钮
 * 就是待会儿要收回焦点的那个 —— 焦点丢到 body 上时，键盘用户下一步按 Tab 是从整页开头
 * 重新走，等于把刚才的位置弄丢了。
 */
describe('浮层关闭后的焦点归还（U8）', () => {
  const ModalHarness: React.FC = () => {
    const [isOpen, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          打开编辑弹窗
        </button>
        <Modal isOpen={isOpen} onClose={() => setOpen(false)} title="编辑书籍">
          <p>表单</p>
        </Modal>
      </>
    );
  };

  const DrawerHarness: React.FC = () => {
    const [isOpen, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          打开导航抽屉
        </button>
        <Drawer isOpen={isOpen} onClose={() => setOpen(false)} title="导航">
          <p>书签</p>
        </Drawer>
      </>
    );
  };

  const ConfirmHarness: React.FC = () => {
    const [isOpen, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          删除这本书
        </button>
        <ConfirmDialog
          isOpen={isOpen}
          onClose={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
          title="删除书籍"
          tone="danger"
        />
      </>
    );
  };

  it('Modal：点关闭按钮后焦点回到触发它的那个按钮', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const trigger = screen.getByRole('button', { name: '打开编辑弹窗' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: '编辑书籍' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '关闭' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('Modal：Esc 关闭后焦点也回到触发按钮', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const trigger = screen.getByRole('button', { name: '打开编辑弹窗' });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('Modal：点背景遮罩关闭后焦点也回到触发按钮', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const trigger = screen.getByRole('button', { name: '打开编辑弹窗' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: '编辑书籍' });
    // 遮罩是弹层根容器的第一个孩子：点它等于「点外面」
    const backdrop = dialog.parentElement?.firstElementChild;
    expect(backdrop).toHaveAttribute('aria-hidden');
    await user.click(backdrop as HTMLElement);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('Drawer：关闭后焦点回到触发按钮', async () => {
    const user = userEvent.setup();
    render(<DrawerHarness />);

    const trigger = screen.getByRole('button', { name: '打开导航抽屉' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: '导航' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '关闭' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('触发元素在浮层里被删掉时，焦点退回主内容区，不掉到 body 上', async () => {
    const user = userEvent.setup();
    // 真实场景：确认删除 → 弹窗关掉的同时，打开它的那一行也没了。
    // 不兜这一下的话焦点落到 body，下一步 Tab 从整页开头重来。
    const DeleteHarness: React.FC = () => {
      const [isOpen, setOpen] = useState(false);
      const [hasRow, setHasRow] = useState(true);
      return (
        <main id="main-content" tabIndex={-1}>
          {hasRow && (
            <button type="button" onClick={() => setOpen(true)}>
              删除这本书
            </button>
          )}
          <Modal
            isOpen={isOpen}
            onClose={() => setOpen(false)}
            title="删除书籍"
            footer={
              <button
                type="button"
                onClick={() => {
                  setHasRow(false);
                  setOpen(false);
                }}
              >
                确认删除
              </button>
            }
          >
            <p>删掉就找不回来了</p>
          </Modal>
        </main>
      );
    };
    render(<DeleteHarness />);

    await user.click(screen.getByRole('button', { name: '删除这本书' }));
    expect(screen.getByRole('dialog', { name: '删除书籍' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '确认删除' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除这本书' })).not.toBeInTheDocument();
    expect(document.getElementById('main-content')).toHaveFocus();
  });

  it('ConfirmDialog：点取消后焦点回到触发按钮', async () => {
    const user = userEvent.setup();
    render(<ConfirmHarness />);

    const trigger = screen.getByRole('button', { name: '删除这本书' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: '删除书籍' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

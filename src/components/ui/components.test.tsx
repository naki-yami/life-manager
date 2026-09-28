import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  Button,
  ConfirmDialog,
  Drawer,
  EmptyState,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Slider,
  Switch,
  ToastProvider,
  Tooltip,
  useToast,
} from './index';

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

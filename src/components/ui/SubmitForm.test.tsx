import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Input } from './Input';
import { SubmitForm } from './SubmitForm';

/** 一个最小的用法：表单树里放一个受控输入 + footer 里用 form= 关联的提交按钮 */
const Harness: React.FC<{ onSubmit: () => void; disabled?: boolean }> = ({
  onSubmit,
  disabled = false,
}) => {
  const [title, setTitle] = useState('');
  return (
    <>
      <SubmitForm id="harness-form" onSubmit={onSubmit}>
        <Input label="标题" value={title} onChange={(event) => setTitle(event.target.value)} />
      </SubmitForm>
      <Button type="submit" form="harness-form" disabled={disabled}>
        保存
      </Button>
    </>
  );
};

describe('SubmitForm', () => {
  it('在输入框里按回车触发提交（隐式提交需要一个树内的提交按钮）', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.click(screen.getByLabelText('标题'));
    await userEvent.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('点 footer 里 form= 关联的按钮也触发提交，而且只触发一次', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    // 树内那个 sr-only 按钮不该再顶一次：footer 的按钮没有 onClick，submit 事件只来一趟
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('多行输入里按回车是换行，不是提交', async () => {
    const onSubmit = vi.fn();

    const Multiline = (): React.ReactElement => {
      const [text, setText] = useState('');
      return (
        <SubmitForm id="multiline-form" onSubmit={onSubmit}>
          <Input
            label="备注"
            multiline
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </SubmitForm>
      );
    };
    render(<Multiline />);

    await userEvent.click(screen.getByLabelText('备注'));
    await userEvent.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('footer 按钮禁用也拦不住回车 —— 拦不拦由页面自己的 guard 决定', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} disabled />);

    await userEvent.click(screen.getByLabelText('标题'));
    await userEvent.keyboard('{Enter}');

    // 隐式提交走的是表单树内那个 sr-only 按钮，footer 的按钮 disabled 影响不到它。
    // 所以空标题按回车时 handleAdd 照样会被叫一次 —— 真正拦住它的是页面里的 if (!title.trim()) return。
    // 这条用例锁的就是这个分工：壳子不替页面做判断，页面也不能只靠按钮的 disabled 兜底。
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('输入框的原生约束不满足时照样提交（noValidate 的护栏）', async () => {
    const onSubmit = vi.fn();

    // 热量那种 step=10 的框，人随手填 233（不整除）就该能存；
    // 浏览器默认会拿 stepMismatch 静默拦下提交 —— 连 submit 事件都不发，点保存毫无反应。
    const Stepped = (): React.ReactElement => {
      const [calories, setCalories] = useState('233');
      return (
        <>
          <SubmitForm id="stepped-form" onSubmit={onSubmit}>
            <input
              aria-label="热量"
              type="number"
              min={0}
              step={10}
              required
              value={calories}
              onChange={(event) => setCalories(event.target.value)}
            />
          </SubmitForm>
          <Button type="submit" form="stepped-form">
            保存
          </Button>
        </>
      );
    };
    const { container } = render(<Stepped />);

    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    expect(form?.noValidate).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

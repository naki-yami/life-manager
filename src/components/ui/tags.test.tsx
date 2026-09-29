import React, { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TagChips, TagEditor, TagInput } from './Tags';
import { MAX_TAG_COUNT, tagTone } from '../../utils/tags';
import { BADGE_TONES } from './badgeTones';

/** 受控组件在测试里要有个真实的状态holder，不然打进去的标签立刻会被原样渲染回来 */
const ControlledTagInput: React.FC<{
  initial?: string[];
  suggestions?: string[];
  onChange?: (tags: string[]) => void;
}> = ({ initial = [], suggestions = [], onChange }) => {
  const [tags, setTags] = useState<string[]>(initial);
  return (
    <TagInput
      label="标签"
      value={tags}
      suggestions={suggestions}
      onChange={(next) => {
        setTags(next);
        onChange?.(next);
      }}
    />
  );
};

describe('TagChips', () => {
  it('没有标签时什么都不渲染', () => {
    const { container } = render(<TagChips tags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('渲染 #标签', () => {
    render(<TagChips tags={['工作', '健身']} />);
    expect(screen.getByText('#工作')).toBeInTheDocument();
    expect(screen.getByText('#健身')).toBeInTheDocument();
  });

  it('配色与徽章共用同一套类名，同名标签到哪都是同一个颜色', () => {
    render(<TagChips tags={['工作']} />);
    expect(screen.getByText('#工作').className).toContain(BADGE_TONES[tagTone('工作')]);
  });

  it('超过上限时折叠成 +N', () => {
    render(<TagChips tags={['a', 'b', 'c', 'd', 'e']} max={3} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.queryByText('#e')).not.toBeInTheDocument();
  });

  it('传了 onTagClick 就变成按钮，点一下把标签报出去', async () => {
    const onTagClick = vi.fn();
    render(<TagChips tags={['工作']} onTagClick={onTagClick} />);

    await userEvent.click(screen.getByRole('button', { name: '#工作' }));
    expect(onTagClick).toHaveBeenCalledWith('工作');
  });
});

describe('TagInput', () => {
  it('回车收下标签并清空输入', async () => {
    const onChange = vi.fn();
    render(<ControlledTagInput onChange={onChange} />);

    const input = screen.getByLabelText('标签');
    await userEvent.type(input, '工作{Enter}');

    expect(onChange).toHaveBeenLastCalledWith(['工作']);
    expect(input).toHaveValue('');
    expect(screen.getByText('#工作')).toBeInTheDocument();
  });

  it('逗号也能当分隔符，# 前缀会被去掉', async () => {
    const onChange = vi.fn();
    render(<ControlledTagInput onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('标签'), '#工作,健身，');
    expect(onChange).toHaveBeenLastCalledWith(['工作', '健身']);
  });

  it('空白与重复标签不会被收下', async () => {
    const onChange = vi.fn();
    render(<ControlledTagInput initial={['工作']} onChange={onChange} />);

    const input = screen.getByLabelText('标签');
    await userEvent.type(input, '   {Enter}');
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.type(input, '工作{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('输入框为空时退格删掉最后一个标签', async () => {
    const onChange = vi.fn();
    render(<ControlledTagInput initial={['工作', '健身']} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('标签'), '{Backspace}');
    expect(onChange).toHaveBeenLastCalledWith(['工作']);
  });

  it('点 × 移除指定标签，× 有可访问名称', async () => {
    const onChange = vi.fn();
    render(<ControlledTagInput initial={['工作', '健身']} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: '移除标签 工作' }));
    expect(onChange).toHaveBeenLastCalledWith(['健身']);
  });

  it('失焦时把没回车的内容也收下，Escape 丢掉草稿', async () => {
    const onChange = vi.fn();
    render(<ControlledTagInput onChange={onChange} />);

    const input = screen.getByLabelText('标签');
    await userEvent.type(input, '工作');
    await userEvent.keyboard('{Escape}');
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.type(input, '健身');
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith(['健身']);
  });

  it('达到上限后输入框禁用', () => {
    const many = Array.from({ length: MAX_TAG_COUNT }, (_, index) => `t${index}`);
    render(<ControlledTagInput initial={many} />);
    expect(screen.getByLabelText('标签')).toBeDisabled();
  });

  it('点「用过」里的标签直接加上，已用的与不匹配草稿的不会出现', async () => {
    const onChange = vi.fn();
    render(
      <ControlledTagInput
        initial={['工作']}
        suggestions={['工作', '健身', '读书']}
        onChange={onChange}
      />,
    );

    const suggestions = screen.getByText('用过：').parentElement!;
    expect(within(suggestions).queryByRole('button', { name: '#工作' })).not.toBeInTheDocument();
    expect(within(suggestions).getByRole('button', { name: '#健身' })).toBeInTheDocument();

    await userEvent.click(within(suggestions).getByRole('button', { name: '#读书' }));
    expect(onChange).toHaveBeenLastCalledWith(['工作', '读书']);
  });

  it('没有 label 时用 ariaLabel 兜底可访问名称', () => {
    render(<TagInput value={[]} onChange={() => {}} ariaLabel="编辑标签" />);
    expect(screen.getByLabelText('编辑标签')).toBeInTheDocument();
  });
});

describe('TagEditor', () => {
  it('收起时显示标签与入口，展开后可以加标签', async () => {
    const onChange = vi.fn();
    render(<TagEditor tags={['工作']} onChange={onChange} />);

    expect(screen.getByText('#工作')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '编辑标签' }));

    await userEvent.type(screen.getByLabelText('编辑标签'), '健身{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['工作', '健身']);

    await userEvent.click(screen.getByRole('button', { name: '完成' }));
    // 收起后输入框消失，只剩「编辑标签」入口按钮
    expect(screen.queryByRole('textbox', { name: '编辑标签' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑标签' })).toBeInTheDocument();
  });

  it('没有标签时入口叫「添加标签」', () => {
    render(<TagEditor tags={[]} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '添加标签' })).toBeInTheDocument();
  });
});

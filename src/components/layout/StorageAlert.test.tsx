import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { StorageAlert } from './StorageAlert';
import { clearStorageFailure, reportStorageFailure } from '../../store/storage';

function quotaError(): Error {
  const error = new Error('存储空间不足');
  error.name = 'QuotaExceededError';
  return error;
}

afterEach(() => {
  clearStorageFailure();
});

describe('StorageAlert', () => {
  it('一切正常时不渲染任何内容', () => {
    const { container } = render(<StorageAlert />);
    expect(container).toBeEmptyDOMElement();
  });

  it('空间写满时提示去导出备份', () => {
    render(<StorageAlert />);

    act(() => {
      reportStorageFailure('lm:tasks', quotaError());
    });

    expect(screen.getByText('数据没有写入本地存储')).toBeInTheDocument();
    expect(screen.getByText(/本地存储空间已满/)).toBeInTheDocument();
    expect(screen.getByText(/导出备份/)).toBeInTheDocument();
  });

  it('非配额类失败时给出另一种解释', () => {
    render(<StorageAlert />);

    act(() => {
      reportStorageFailure('lm:tasks', new Error('隐私模式'));
    });

    expect(screen.getByText(/隐私模式/)).toBeInTheDocument();
  });

  it('读不出来时说明「空白不等于你没录过」，并引导回滚', () => {
    render(<StorageAlert />);

    act(() => {
      reportStorageFailure('lm:tasks', new Error('不是合法 JSON'), 'read');
    });

    expect(screen.getByText('本地数据读不出来')).toBeInTheDocument();
    expect(screen.getByText(/并不代表你没录过/)).toBeInTheDocument();
    expect(screen.getByText(/自动备份/)).toBeInTheDocument();
  });

  it('可以手动关掉', async () => {
    render(<StorageAlert />);
    act(() => {
      reportStorageFailure('lm:tasks', quotaError());
    });

    await userEvent.click(screen.getByRole('button', { name: '关闭提示' }));

    expect(screen.queryByText('数据没有写入本地存储')).not.toBeInTheDocument();
  });
});

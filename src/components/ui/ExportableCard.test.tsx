import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportableCard } from './ExportableCard';
import { ToastProvider } from './Toast';
import { todayKey } from '../../utils/date';
import { restoreFakeCanvas, stubFakeCanvas, stubMissingCanvas } from '../../test/fakeCanvas';

const EXPORT_BUTTON = '导出「任务完成趋势」为 PNG';

const exportButton = () => screen.getByRole('button', { name: EXPORT_BUTTON });

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  restoreFakeCanvas();
});

describe('ExportableCard', () => {
  it('操作区有导出按钮，按钮自己带跳过标记，不会被拍进图里', () => {
    render(<ExportableCard title="任务完成趋势">内容</ExportableCard>);

    expect(exportButton()).toHaveAttribute('data-export-skip');
  });

  it('导出成功后提示落地的文件名', async () => {
    stubFakeCanvas();
    render(
      <ToastProvider>
        <ExportableCard title="任务完成趋势">内容</ExportableCard>
      </ToastProvider>,
    );

    await userEvent.click(exportButton());

    expect(await screen.findByText('已导出图片')).toBeInTheDocument();
    expect(screen.getByText(`life-manager-任务完成趋势-${todayKey()}.png`)).toBeInTheDocument();
  });

  it('导出失败时只提示不抛错，页面照常', async () => {
    stubMissingCanvas();
    render(
      <ToastProvider>
        <ExportableCard title="任务完成趋势">内容</ExportableCard>
      </ToastProvider>,
    );

    await userEvent.click(exportButton());

    expect(await screen.findByText('图表导出失败')).toBeInTheDocument();
    expect(screen.getByText('内容')).toBeInTheDocument();
  });

  it('出图期间按钮禁用，避免连点重复下载', async () => {
    stubFakeCanvas();
    let finish: BlobCallback = () => {};
    HTMLCanvasElement.prototype.toBlob = ((callback: BlobCallback) => {
      finish = callback;
    }) as typeof HTMLCanvasElement.prototype.toBlob;
    render(<ExportableCard title="任务完成趋势">内容</ExportableCard>);

    await userEvent.click(exportButton());
    expect(exportButton()).toBeDisabled();

    await act(async () => {
      finish(new Blob(['png'], { type: 'image/png' }));
    });
    expect(exportButton()).toBeEnabled();
  });

  it('没有 ToastProvider 时也照常渲染，不会因为提示而崩', async () => {
    stubMissingCanvas();
    render(<ExportableCard title="任务完成趋势">内容</ExportableCard>);

    await userEvent.click(exportButton());

    expect(screen.getByText('内容')).toBeInTheDocument();
  });
});

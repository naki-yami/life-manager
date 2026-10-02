import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { useDietStore } from '../store/dietStore';
import { DEFAULT_DIET_GOALS } from '../utils/diet';

beforeEach(() => {
  useDietStore.setState({ records: [], goals: { ...DEFAULT_DIET_GOALS }, water: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * 拦下浏览器下载，把每次导出的内容收进数组。
 *
 * 抢救导出的验收点是「文件里到底有没有那些模块」，不是「有没有调用 createObjectURL」。
 */
const stubDownload = (): Blob[] => {
  const blobs: Blob[] = [];
  // 只替换两个方法，别整个换掉 URL —— 动态 import 的实现内部要用 `new URL(...)`，
  // 把它换成普通对象会让 import 直接抛「URL is not a constructor」。
  vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
    if (obj instanceof Blob) {
      blobs.push(obj);
    }
    return 'blob:mock';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  return blobs;
};

function Boom(): React.ReactNode {
  throw new Error('渲染炸了');
}

describe('ErrorBoundary 抢救导出', () => {
  it('饮食目标与饮水打卡一起写进备份文件', async () => {
    useDietStore.setState({
      records: [],
      goals: { calories: 2450, protein: 130 },
      water: { '2026-10-01': 7, '2026-10-02': 3 },
    });
    const blobs = stubDownload();
    // React 捕获到异常后会往 console.error 打两份堆栈（浏览器里是预期行为），
    // 这里静音掉，免得测试输出被误导性的「报错」淹没。
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText('页面出错了')).toBeInTheDocument();
    screen.getByRole('button', { name: /导出数据抢救/ }).click();

    await waitFor(() => expect(blobs).toHaveLength(1));
    const envelope = JSON.parse(await blobs[0]!.text()) as { data: Record<string, unknown> };
    expect(envelope.data.dietGoals).toEqual({ calories: 2450, protein: 130 });
    expect(envelope.data.dietWater).toEqual({ '2026-10-01': 7, '2026-10-02': 3 });
  });
});

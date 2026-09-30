import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  elementToPngBlob,
  exportElementAsPng,
  pngFileNameOf,
  snapshotToSvgMarkup,
} from './chartExport';
import { todayKey } from './date';
import { restoreFakeCanvas, stubFakeCanvas, stubMissingCanvas } from '../test/fakeCanvas';

afterEach(() => {
  restoreFakeCanvas();
});

/** 造一张最简卡片，返回根节点 */
const cardOf = (html: string): HTMLElement => {
  document.body.innerHTML = `<div id="card">${html}</div>`;
  return document.getElementById('card') as HTMLElement;
};

describe('pngFileNameOf', () => {
  it('文件名带上图表名与日期', () => {
    expect(pngFileNameOf('任务完成趋势', '2026-09-30')).toBe(
      'life-manager-任务完成趋势-2026-09-30.png',
    );
  });

  it('默认落到今天，方便和截图当天的数据对上', () => {
    expect(pngFileNameOf('活动构成')).toBe(`life-manager-活动构成-${todayKey()}.png`);
  });

  it('标题里的分隔符与路径字符收成一个连字符，不往文件名里塞非法字符', () => {
    expect(pngFileNameOf('读书 · 阅读时长', '2026-01-02')).toBe(
      'life-manager-读书-阅读时长-2026-01-02.png',
    );
    expect(pngFileNameOf('热量/趋势: 日', '2026-01-02')).toBe(
      'life-manager-热量-趋势-日-2026-01-02.png',
    );
  });

  it('标题全是空白时退回 chart，不让文件名只剩日期', () => {
    expect(pngFileNameOf('   ', '2026-01-02')).toBe('life-manager-chart-2026-01-02.png');
  });
});

describe('snapshotToSvgMarkup', () => {
  it('DOM 副本装进 foreignObject，字体与配色来自计算样式而不是原样式表', () => {
    const svg = snapshotToSvgMarkup(cardOf('<span style="color: red">甲</span>'));

    expect(svg).toContain('<foreignObject');
    expect(svg).toContain('viewBox="0 0 ');
    expect(svg).toContain('甲');
    // 原标记写的是 red，副本里是计算样式的 rgb(...)，说明确实抄了一遍计算值
    expect(svg).toMatch(/color:\s*rgb\(255,\s*0,\s*0\)/);
  });

  it('导出按钮这类节点被剔掉，不会自己出现在图里', () => {
    const svg = snapshotToSvgMarkup(
      cardOf('<span>甲</span><button data-export-skip="true">导出「甲」为 PNG</button>'),
    );

    expect(svg).toContain('甲');
    expect(svg).not.toContain('data-export-skip');
  });

  it('正文里的特殊字符按 XML 转义，SVG 不会被撑破', () => {
    const svg = snapshotToSvgMarkup(cardOf('<p>价格 &lt; 5 &amp; 库存 &gt; 0</p>'));

    expect(svg).toContain('&lt;');
    expect(svg).toContain('&amp;');
    expect(svg).not.toContain('价格 < 5');
  });
});

describe('elementToPngBlob', () => {
  it('拿不到 canvas 上下文时抛出能读懂的错，而不是让页面白屏', async () => {
    stubMissingCanvas();

    await expect(elementToPngBlob(cardOf('甲'))).rejects.toThrow(/canvas/);
  });

  it('按倍数出图：默认 2 倍，可指定', async () => {
    const context = stubFakeCanvas();

    const blob = await elementToPngBlob(cardOf('甲'));

    expect(blob.type).toBe('image/png');
    expect(context.scale).toHaveBeenLastCalledWith(2, 2);
    expect(context.drawImage).toHaveBeenCalledTimes(1);

    await elementToPngBlob(cardOf('甲'), { scale: 3 });
    expect(context.scale).toHaveBeenLastCalledWith(3, 3);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
  });
});

describe('exportElementAsPng', () => {
  it('按图表名与日期落成下载文件', async () => {
    stubFakeCanvas();
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    const fileName = await exportElementAsPng(cardOf('甲'), '任务完成趋势');

    expect(fileName).toBe(`life-manager-任务完成趋势-${todayKey()}.png`);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect((createObjectURL.mock.calls[0]![0] as Blob).type).toBe('image/png');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});

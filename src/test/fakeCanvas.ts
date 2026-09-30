import { vi } from 'vitest';

export interface FakeCanvasContext {
  scale: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillStyle: string;
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalToBlob = HTMLCanvasElement.prototype.toBlob;

/** 「一赋 src 就立刻加载成功」的图片替身：jsdom 不会真的去解码 data: URL */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

/**
 * jsdom 的 canvas 是空壳：没有 2d 上下文，也没有 PNG 编码器，
 * 所以「DOM → SVG → 位图」这条链路在测试里跑不到底。
 * 这里把这两件事换成会记账的替身，用完调 restoreFakeCanvas 还原。
 */
export function stubFakeCanvas(): FakeCanvasContext {
  const context: FakeCanvasContext = {
    scale: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    fillStyle: '',
  };
  HTMLCanvasElement.prototype.getContext = (() =>
    context) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = ((callback: BlobCallback) =>
    callback(
      new Blob(['fake-png'], { type: 'image/png' }),
    )) as typeof HTMLCanvasElement.prototype.toBlob;
  vi.stubGlobal('Image', FakeImage);
  return context;
}

/** 只让 getContext 交白卷，模拟「浏览器不给 canvas」，顺带避开 jsdom 的 not-implemented 噪音 */
export function stubMissingCanvas(): void {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

export function restoreFakeCanvas(): void {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  HTMLCanvasElement.prototype.toBlob = originalToBlob;
}

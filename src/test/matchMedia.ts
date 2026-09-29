import { vi } from 'vitest';

/**
 * 覆盖 `window.matchMedia`。
 *
 * `test/setup.ts` 里的默认实现对所有查询都返回 false —— 也就是「小屏 + 浅色主题」，
 * 这是最保守的一档。要验证宽屏（MasterDetail 双栏）或深色主题分支的用例，
 * 用它覆盖成期望的结果；`afterEach` 的 `vi.restoreAllMocks()` 会自动还原。
 */
export function mockMediaQueries(matchers: Record<string, boolean>): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: matchers[query] ?? false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

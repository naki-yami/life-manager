import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * 「当前选中哪一条」放进 URL（`?<param>=<id>`）。
 *
 * 开发页的 `?project=` 与任务页的 `?task=` 是同一套模式，这里抽出来给
 * 读书 / 游戏 / 写作三页共用。三条约定：
 *
 * 1. **URL 里的 id 必须在当前可见列表里**才认。筛选一变，右栏不该留着一个
 *    屏幕上根本看不到的条目 —— 这种情况回落到第一条。
 * 2. 没传参数（或认不出）时**回落到第一条可见项**：右栏常驻有内容，
 *    不再等着用户先点一下（「选完就空」正是要改掉的那个反模式）。
 * 3. 列表为空时返回 `null`，交给调用方走空态。
 *
 * 只读不写：`setSearchParams` 走函数式更新，不会把别的查询参数冲掉，
 * 所以和 `?range=` 这类筛选参数可以并存。
 */
export function useUrlSelection(
  param: string,
  visibleIds: readonly string[],
): [selectedId: string | null, select: (id: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedId = useMemo(() => {
    const fromUrl = searchParams.get(param);
    if (fromUrl && visibleIds.includes(fromUrl)) return fromUrl;
    return visibleIds[0] ?? null;
  }, [searchParams, param, visibleIds]);

  const select = (id: string): void => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(param, id);
      return next;
    });
  };

  return [selectedId, select];
}

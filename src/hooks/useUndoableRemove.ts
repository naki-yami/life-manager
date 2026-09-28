import { useCallback, useContext } from 'react';
import { ToastContext } from '../components/ui/toastContext';

export interface UndoableRemoveOptions<T> {
  /** 提示标题，例如「已删除任务」 */
  message: string;
  /** 删除前的完整列表快照，撤销时整表还原 */
  snapshot: readonly T[];
  /** 各 store 的 replaceX，用来把快照写回去 */
  restore: (items: T[]) => void;
  /** 补充说明，例如删掉的是哪一条 */
  description?: string;
}

export type UndoableRemove = <T>(options: UndoableRemoveOptions<T>) => void;

/**
 * 删除后弹一条带「撤销」的提示。
 *
 * 撤销走的是整表还原（各 store 的 replaceX），
 * 这样不需要给每个 store 再加一套「按 id 插回原位」的接口，
 * 也天然保住了列表顺序。
 *
 * 单测里经常只渲染一个页面、没有 ToastProvider，
 * 这时删除照常生效，只是不弹提示，避免为了一个提示把所有用例都包一层 Provider。
 */
export const useUndoableRemove = (): UndoableRemove => {
  const context = useContext(ToastContext);

  return useCallback<UndoableRemove>(
    ({ message, snapshot, restore, description }) => {
      const copy = [...snapshot];
      context?.toast({
        tone: 'success',
        title: message,
        description,
        // 撤销要留出反应时间，比普通提示长一些
        duration: 8000,
        action: {
          label: '撤销',
          onClick: () => restore(copy),
        },
      });
    },
    [context],
  );
};

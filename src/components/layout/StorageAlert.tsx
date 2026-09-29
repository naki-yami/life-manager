import React, { useEffect, useState } from 'react';
import { Alert } from '../ui';
import {
  getStorageFailure,
  subscribeStorageFailure,
  type StorageFailure,
} from '../../store/storage';

/**
 * 写入本地存储失败时的兜底提示。
 *
 * 失败时应用仍然能继续用（数据留在内存里），但刷新就会丢 —— 所以这里不能只写
 * 「保存失败」，而要明确告诉用户「现在去导出备份」。提示可以关闭，但下一次新的
 * 写入失败会重新弹出来。
 */
export const StorageAlert: React.FC = () => {
  const [failure, setFailure] = useState<StorageFailure | null>(() => getStorageFailure());
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);

  useEffect(() => subscribeStorageFailure(setFailure), []);

  if (!failure || dismissedAt === failure.at) return null;

  return (
    <Alert
      tone="danger"
      title="数据没有写入本地存储"
      onDismiss={() => setDismissedAt(failure.at)}
      className="mb-4"
    >
      刚才的改动只留在内存里，刷新或关掉页面就会丢。
      {failure.quotaExceeded
        ? '本地存储空间已满：先到「数据与设置」导出备份，再清理不需要的自动快照或历史数据。'
        : '浏览器拒绝了本次写入（可能是隐私模式，或站点存储被禁用），建议立即导出备份。'}
    </Alert>
  );
};

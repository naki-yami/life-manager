import React, { useEffect, useState } from 'react';
import { Alert } from '../ui';
import {
  getStorageFailure,
  subscribeStorageFailure,
  type StorageFailure,
} from '../../store/storage';

/**
 * 本地存储出问题时的兜底提示。
 *
 * 写失败时应用仍然能继续用（数据留在内存里），但刷新就会丢 —— 所以这里不能只写
 * 「保存失败」，而要明确告诉用户「现在去导出备份」。读失败是另一码事：那说明本地
 * 那份数据已经坏了，界面上的空白并不是「你没有录过」。
 *
 * 提示可以关闭，但下一次新的失败会重新弹出来。
 */
export const StorageAlert: React.FC = () => {
  const [failure, setFailure] = useState<StorageFailure | null>(() => getStorageFailure());
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);

  useEffect(() => subscribeStorageFailure(setFailure), []);

  if (!failure || dismissedAt === failure.at) return null;

  if (failure.kind === 'read') {
    return (
      <Alert
        tone="danger"
        title="本地数据读不出来"
        onDismiss={() => setDismissedAt(failure.at)}
        className="mb-4"
      >
        保存的内容没能解析成功（可能已经损坏），这一块已经按空白启动了 ——
        也就是说，现在看到的「没有数据」
        并不代表你没录过。先别继续录入：立即导出一份备份，再到「数据与设置 →
        自动备份」回滚到之前的状态。
      </Alert>
    );
  }

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

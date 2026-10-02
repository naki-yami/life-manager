import React, { useState } from 'react';
import { Button } from './Button';
import { Modal, ConfirmDialog } from './Modal';
import { TagInput } from './Tags';
import { SegmentedControl } from './SegmentedControl';

export interface BulkTagDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** 选中了几条，写进弹窗描述 */
  count: number;
  /** 量词，例如「本」「款」「条」 */
  unit: string;
  /** 已用过的标签，喂给输入的联想 */
  suggestions?: readonly string[];
  /** 点「应用」：把这一组标签按 add / remove 应用到选中的那批 */
  onApply: (tags: string[], remove: boolean) => void;
}

/**
 * 批量打标签弹窗。
 *
 * 读书 / 游戏 / 任务三页原来各写了一份，**除了量词与联想来源之外完全一样**。
 *
 * 为什么用弹窗而不是行内输入：一次要改的可能是十几条，行内的话用户没法确认
 * 「加」还是「去」，也看不到将要应用的那组标签。
 *
 * 草稿与「加 / 去」收在组件内部：以前由各页各持三份 `useState`、打开前还得手动清一遍；
 * 现在调用方只剩「应用」这一个出口。（`Modal` 关闭时卸载内容，状态随之重置。）
 */
export const BulkTagDialog: React.FC<BulkTagDialogProps> = ({
  isOpen,
  onClose,
  count,
  unit,
  suggestions = [],
  onApply,
}) => {
  const [draft, setDraft] = useState<string[]>([]);
  const [remove, setRemove] = useState(false);

  const close = (): void => {
    setDraft([]);
    setRemove(false);
    onClose();
  };

  const apply = (): void => {
    if (draft.length === 0) return;
    onApply(draft, remove);
    setDraft([]);
    setRemove(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="批量打标签"
      description={`将对选中的 ${count} ${unit}生效`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            取消
          </Button>
          <Button onClick={apply} disabled={draft.length === 0}>
            应用
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SegmentedControl
          label="标签处理方式"
          value={remove ? 'remove' : 'add'}
          onChange={(value) => setRemove(value === 'remove')}
          options={[
            { value: 'add', label: '添加' },
            { value: 'remove', label: '移除' },
          ]}
        />
        <TagInput
          label="标签"
          hint="回车或逗号分隔；添加是并集，移除只影响已选中的这批"
          value={draft}
          suggestions={suggestions}
          onChange={setDraft}
        />
      </div>
    </Modal>
  );
};

export interface BulkDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** 选中了几条 */
  count: number;
  /** 量词，例如「本」「款」「条」 */
  unit: string;
  /** 标题里的对象名，例如「书籍」「游戏」「任务」 */
  noun: string;
  /** 额外要说清的话，例如「连同它们的笔记一起删除」 */
  extra?: string;
}

/**
 * 批量删除的二次确认。与 `BulkTagDialog` 是同一套批量流程的配对件，
 * 所以放在一起 —— 三页原来也是各写一份，连「删完可以点撤销全部放回去」都一字不差。
 */
export const BulkDeleteDialog: React.FC<BulkDeleteDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  count,
  unit,
  noun,
  extra,
}) => (
  <ConfirmDialog
    isOpen={isOpen}
    onClose={onClose}
    onConfirm={onConfirm}
    title={`批量删除${noun}`}
    description={`确定要删除选中的 ${count} ${unit}吗？${extra ? `${extra}，` : ''}删完可以点「撤销」全部放回去。`}
    confirmText="删除"
    tone="danger"
  />
);

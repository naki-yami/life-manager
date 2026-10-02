import React from 'react';
import { Button } from './Button';
import { Input, NumberInput, Textarea } from './Input';
import { Modal } from './Modal';
import { Select } from './Select';
import { SubmitForm } from './SubmitForm';

export interface SessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** 弹窗标题，例如「记录阅读」 */
  title: string;
  /** 标题下那行说明 */
  description: string;
  /** 表单 id：确认按钮靠 `form=` 提交，所以必须与调用方的 SubmitForm 对上 */
  formId: string;
  onSubmit: () => void;
  /** 选哪一条业务对象（书 / 游戏 / 项目） */
  entity: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
  };
  date: { value: string; onChange: (value: string) => void };
  /** 时长：`unit` 与 `step` 是三个模块唯一的差别（分钟 / 小时） */
  duration: {
    label: string;
    value: number | '';
    onChange: (value: number | '') => void;
    unit: string;
    step: number;
  };
  note: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    /** 单行还是三行；阅读页用的是单行 */
    multiline?: boolean;
  };
  canSave: boolean;
}

/**
 * 「记一笔流水」弹窗。读书 / 游戏 / 开发三页共用。
 *
 * 三处的结构逐字相同 —— 选一条业务对象 + 日期 + 时长 + 备注 —— 差别只有
 * 标题、那个下拉的标签、时长的单位与步长、备注的占位文案与行数。
 * 这些全部收成 props，调用方只负责「填进去什么、存下去干什么」。
 */
export const SessionDialog: React.FC<SessionDialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  formId,
  onSubmit,
  entity,
  date,
  duration,
  note,
  canSave,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    description={description}
    footer={
      <>
        <Button variant="secondary" onClick={onClose}>
          取消
        </Button>
        <Button type="submit" form={formId} disabled={!canSave}>
          保存
        </Button>
      </>
    }
  >
    <SubmitForm id={formId} onSubmit={onSubmit} className="space-y-4">
      <Select
        label={entity.label}
        value={entity.value}
        onChange={entity.onChange}
        options={entity.options}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="日期"
          type="date"
          value={date.value}
          onChange={(event) => date.onChange(event.target.value)}
        />
        <NumberInput
          label={duration.label}
          value={duration.value}
          onChange={duration.onChange}
          min={0}
          step={duration.step}
          suffix={duration.unit}
        />
      </div>
      {note.multiline ? (
        <Textarea
          label="备注"
          value={note.value}
          onChange={(event) => note.onChange(event.target.value)}
          rows={3}
          placeholder={note.placeholder}
        />
      ) : (
        <Input
          label="备注"
          value={note.value}
          onChange={(event) => note.onChange(event.target.value)}
          placeholder={note.placeholder}
        />
      )}
    </SubmitForm>
  </Modal>
);

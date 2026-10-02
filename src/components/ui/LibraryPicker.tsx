import React from 'react';
import { Input } from './Input';
import { Modal } from './Modal';
import { Select } from './Select';

export interface LibraryPickerFilter {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  /** 下拉宽度类，例如 `w-36` / `w-28` */
  width?: string;
}

export interface LibraryPickerRecent {
  name: string;
  /** 名字右边那截小字，例如「133 kcal」 */
  detail?: string;
  onPick: () => void;
}

export interface LibraryPickerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  search: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  };
  filters?: readonly LibraryPickerFilter[];
  /** 只在「没搜索、没筛」时才摆出来 —— 有筛选条件时「最近使用」跟当前语境无关 */
  recent?: readonly LibraryPickerRecent[];
  /** 列表内容与「存一条自建的」区块，由调用方给（两边的列与字段不一样） */
  children: React.ReactNode;
}

/**
 * 从库里挑一条（食物 / 动作）的外壳。饮食页与健身页两个选择器共用。
 *
 * 共同的部分：搜索框 + 若干筛选下拉 + 「最近使用」快捷 chips + 一个 `size="lg"` 弹窗。
 * 差异都留给调用方：列表里每行显示哪几列、自建表单有哪几个字段。
 *
 * 「最近使用」的显隐条件写在这里而不是让调用方各判一次 —— 两处原来都是
 * 「没搜索 && 全部筛选项都是默认值」，多一个筛选维度就多一处漏判的机会。
 */
export const LibraryPicker: React.FC<LibraryPickerProps> = ({
  isOpen,
  onClose,
  title,
  description,
  search,
  filters = [],
  recent = [],
  children,
}) => {
  const untouched =
    search.value.trim() === '' &&
    filters.every((filter) => filter.value === filter.options[0]?.value);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} description={description} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <Input
              label="搜索"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder}
            />
          </div>
          {filters.map((filter) => (
            <div key={filter.label} className={filter.width ?? 'w-28'}>
              <Select
                label={filter.label}
                value={filter.value}
                onChange={filter.onChange}
                options={filter.options}
              />
            </div>
          ))}
        </div>

        {untouched && recent.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-content-secondary">最近使用</p>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={item.onPick}
                  className="inline-flex items-center gap-1 rounded-full bg-inset px-3 py-1 text-xs text-content-secondary transition-colors duration-fast ease-standard hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
                >
                  {item.name}
                  {item.detail && (
                    <span className="text-2xs text-content-tertiary tabular">{item.detail}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {children}
      </div>
    </Modal>
  );
};

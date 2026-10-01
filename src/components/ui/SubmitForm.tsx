import React from 'react';

export interface SubmitFormProps {
  /** 表单 id：footer 里的提交按钮用 `form={id}` 关联过来 */
  id: string;
  /** 提交时做什么 —— 点击与回车都走这里 */
  onSubmit: () => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * 「回车即提交」的表单壳。
 *
 * 为什么不能只给保存按钮挂 onClick：Input / Select / 日期这些字段里按回车会触发**隐式提交**，
 * 而隐式提交的前提是**表单树里存在一个提交按钮**。只把 footer 的按钮用 `form=` 关联过来，
 * 覆盖的只有「点击」那条路径 —— 回车仍然什么都不会发生（jsdom 与真浏览器行为一致）。
 *
 * 所以这里在表单树里放了一个 `sr-only` 的提交按钮：对浏览器而言它就在表单里，
 * 对人而言它不可见、不进 Tab 序、读屏也不念。
 *
 * 配套约定：footer 里那个按钮写成 `type="submit" form={id}`，**不要再挂 onClick** ——
 * 两条路径都通到同一个 submit 事件，挂上 onClick 会提交两次。
 *
 * `noValidate` 不能省：表单里那些 `min` / `step` / `required` 是给输入框自己用的提示，
 * 但浏览器会拿它们做**原生校验**，一旦不满足就静默拦下提交 —— 连 submit 事件都不发。
 * 典型翻车：热量框 `step=10` 填了 233（不整除），点保存毫无反应，人只会以为按钮坏了。
 * 校验本来就归页面自己管（`canSave` 那一套），所以这里把原生校验关掉。
 */
export function SubmitForm({
  id,
  onSubmit,
  className,
  children,
}: SubmitFormProps): React.ReactElement {
  return (
    <form
      id={id}
      className={className}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      {children}
    </form>
  );
}

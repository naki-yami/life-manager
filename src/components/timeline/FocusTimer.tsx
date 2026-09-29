import React, { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { Button, SegmentedControl, Select } from '../ui';
import type { ActiveFocus, FocusMode, FocusTarget } from '../../types';
import type { StartFocusInput } from '../../store/focusStore';
import {
  POMODORO_MINUTES,
  elapsedSeconds,
  formatFocusDuration,
  formatTimer,
} from '../../utils/focus';

/**
 * 专注计时（番茄钟 / 正计时）。
 *
 * 三个取舍：
 * - **不提供暂停**：暂停之后「这次专注到底算多久」就得靠猜；要停就结束，
 *   时长照样会记下来，只是不再往计划时间上凑；
 * - **番茄钟到点自动结束**：到点了还让人手动点一下，等于把「专注」变成「盯表」；
 * - **倒计时按秒显示**：整分钟跳动会让人怀疑表停了。
 */

export interface FocusOption {
  /** 选择器的值：`${target}:${entityId}` */
  key: string;
  title: string;
  target: FocusTarget;
  entityId: string;
  /** 下拉里的分组前缀，例如「任务」「书籍」 */
  group: string;
}

export interface FocusTimerProps {
  active: ActiveFocus | null;
  options: readonly FocusOption[];
  onStart: (input: StartFocusInput) => void;
  onFinish: () => void;
  onCancel: () => void;
}

const PLAN_OPTIONS = [
  { value: '25', label: '25 分钟' },
  { value: '45', label: '45 分钟' },
  { value: '60', label: '60 分钟' },
];

export const FocusTimer: React.FC<FocusTimerProps> = ({
  active,
  options,
  onStart,
  onFinish,
  onCancel,
}) => {
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState('');
  const [mode, setMode] = useState<FocusMode>('pomodoro');
  const [plan, setPlan] = useState(String(POMODORO_MINUTES));
  /** 记下已经因为「到点」自动结束过的那一次，避免重复写记录 */
  const autoFinished = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const elapsed = active ? elapsedSeconds(active.startedAt, now) : 0;
  const remaining = active ? Math.max(0, active.plannedMinutes * 60 - elapsed) : 0;

  useEffect(() => {
    if (!active || active.mode !== 'pomodoro' || remaining > 0) return;
    if (autoFinished.current === active.startedAt) return;
    autoFinished.current = active.startedAt;
    onFinish();
  }, [active, remaining, onFinish]);

  if (active) {
    const counting = active.mode === 'pomodoro' ? remaining : elapsed;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded border border-accent bg-accent-soft px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-2xs text-content-secondary">
            {active.mode === 'pomodoro' ? '番茄钟' : '正计时'} · 正在专注
          </p>
          <p className="truncate text-sm font-medium text-content">{active.title}</p>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xs text-content-tertiary">
            {active.mode === 'pomodoro' ? '剩余' : '已专注'}
          </span>
          <span className="tabular text-2xl font-semibold text-accent">
            {formatTimer(counting)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" icon={<Square size={13} aria-hidden />} onClick={onFinish}>
            结束并记录
          </Button>
          <Button size="sm" variant="secondary" onClick={onCancel}>
            放弃
          </Button>
        </div>
      </div>
    );
  }

  const handleStart = (): void => {
    const option = options.find((item) => item.key === picked);
    if (!option) return;
    onStart({
      entityId: option.entityId,
      title: option.title,
      target: option.target,
      mode,
      plannedMinutes: Number(plan),
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded border border-dashed border-line px-3 py-2">
      <div className="min-w-[11rem] flex-1">
        <Select
          label="专注对象"
          value={picked}
          placeholder={options.length > 0 ? '选一个…' : '目前没有可以专注的对象'}
          disabled={options.length === 0}
          onChange={setPicked}
          options={options.map((option) => ({
            value: option.key,
            label: `${option.group} · ${option.title}`,
          }))}
        />
      </div>
      <SegmentedControl
        label="计时方式"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'pomodoro' as FocusMode, label: '番茄钟' },
          { value: 'stopwatch' as FocusMode, label: '正计时' },
        ]}
      />
      {mode === 'pomodoro' && (
        <div className="w-28">
          <Select label="计划时长" value={plan} onChange={setPlan} options={PLAN_OPTIONS} />
        </div>
      )}
      <Button icon={<Play size={14} aria-hidden />} disabled={!picked} onClick={handleStart}>
        开始专注
      </Button>
      <p className="w-full text-2xs text-content-tertiary">
        正计时适合不知道会做多久的事；番茄钟到点会自动记一笔。共 {options.length}{' '}
        个可专注对象，单次最长记 {formatFocusDuration(600)}。
      </p>
    </div>
  );
};

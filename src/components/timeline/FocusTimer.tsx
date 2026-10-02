import React, { useEffect, useRef, useState } from 'react';
import { Play, Square } from 'lucide-react';
import { Button, ProgressRing, SegmentedControl, Select } from '../ui';
import type { ActiveFocus, FocusMode, FocusTarget } from '../../types';
import type { StartFocusInput } from '../../store/focusStore';
import { POMODORO_MINUTES, elapsedSeconds, formatTimer } from '../../utils/focus';

/**
 * 专注计时（番茄钟 / 正计时）。
 *
 * 三个取舍：
 * - **不提供暂停**：暂停之后「这次专注到底算多久」就得靠猜；要停就结束，
 *   时长照样会记下来，只是不再往计划时间上凑；
 * - **番茄钟到点自动结束**：到点了还让人手动点一下，等于把「专注」变成「盯表」；
 * - **倒计时按秒显示**：整分钟跳动会让人怀疑表停了。
 *
 * 版式上，环和「开始专注」是这张卡的主角，选对象 / 计时方式 / 时长退到下面一行 ——
 * 「现在要不要开始」是一眼要看到的，「开始做什么、做多久」是想改的时候才去改的。
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

const MODE_OPTIONS: Array<{ value: FocusMode; label: string }> = [
  { value: 'pomodoro', label: '番茄钟' },
  { value: 'stopwatch', label: '正计时' },
];

/** 环的尺寸。直径与内圈文字的搭配是照着「一眼能读出分钟数」定的 */
const DIAL_SIZE = 76;
const DIAL_STROKE = 7;

/** 环中央那串时间。比 ProgressRing 默认的 text-sm 大一档，才配得上 76px 的直径 */
const DialTime: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[15px] font-semibold tracking-tight tabular">{children}</span>
);

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
    const plannedSeconds = active.plannedMinutes * 60;

    return (
      <div>
        <div className="flex items-center gap-3.5">
          <ProgressRing
            size={DIAL_SIZE}
            strokeWidth={DIAL_STROKE}
            // 番茄钟填的是「已经过去了多少」；正计时没有终点可填，环就空着不假装进度
            value={active.mode === 'pomodoro' ? plannedSeconds - remaining : 0}
            max={plannedSeconds}
            tone="accent"
            label={
              active.mode === 'pomodoro'
                ? `番茄钟剩余 ${formatTimer(remaining)}`
                : `正计时已过 ${formatTimer(elapsed)}`
            }
            className="shrink-0"
          >
            <DialTime>{formatTimer(counting)}</DialTime>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-content-tertiary">
              {active.mode === 'pomodoro' ? '番茄钟 · 正在专注' : '正计时 · 正在专注'}
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-content">{active.title}</p>
            <p className="mt-0.5 text-2xs text-content-tertiary">
              {active.mode === 'pomodoro' ? '剩余' : '已专注'}
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex items-center gap-2">
          <Button className="flex-1" icon={<Square size={13} aria-hidden />} onClick={onFinish}>
            结束并记录
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            放弃
          </Button>
        </div>
      </div>
    );
  }

  const option = options.find((item) => item.key === picked) ?? null;
  const plannedMinutes = Number(plan);

  const handleStart = (): void => {
    if (!option) return;
    onStart({
      entityId: option.entityId,
      title: option.title,
      target: option.target,
      mode,
      plannedMinutes,
    });
  };

  /**
   * 「换一个」：在可专注的对象里往后挪一格。
   *
   * 和下面那个下拉不是重复 —— 下拉是「我就要做那一件」，换一个是「随便给我一件，
   * 别再让我选」。挑不出东西的时候，第二个才是能救场的那一个。
   */
  const cycle = (): void => {
    if (options.length === 0) return;
    const index = options.findIndex((item) => item.key === picked);
    const next = options[(index + 1) % options.length];
    if (next) setPicked(next.key);
  };

  return (
    <div>
      <div className="flex items-center gap-3.5">
        <ProgressRing
          size={DIAL_SIZE}
          strokeWidth={DIAL_STROKE}
          // 还没开始，环空着；中央先把这一轮要走的分钟数摆出来
          value={0}
          max={plannedMinutes}
          tone="accent"
          label={option ? `本次专注对象：${option.title}` : '尚未选择专注对象'}
          className="shrink-0"
        >
          <DialTime>{mode === 'pomodoro' ? formatTimer(plannedMinutes * 60) : '00:00'}</DialTime>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-content">
            {option ? option.title : '先挑一件事'}
          </p>
          <p className="mt-0.5 text-xs text-content-tertiary">
            {mode === 'pomodoro' ? `番茄钟 ${plan} 分钟` : '正计时，停下来才记一笔'}
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-2">
        <Button
          className="flex-1"
          icon={<Play size={14} aria-hidden />}
          disabled={!option}
          onClick={handleStart}
        >
          开始专注
        </Button>
        <Button variant="secondary" disabled={options.length === 0} onClick={cycle}>
          换一个
        </Button>
      </div>

      {/*
       * 配置一行流：计时方式 / 计划时长 / 专注对象并排，不挂可见标签。
       * 「怎么计、做多久、做哪件」都是想改的时候才去改的东西，不该占三行。
       */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <SegmentedControl label="计时方式" value={mode} onChange={setMode} options={MODE_OPTIONS} />
        {mode === 'pomodoro' && (
          <Select
            aria-label="计划时长"
            className="w-24"
            value={plan}
            onChange={setPlan}
            options={PLAN_OPTIONS}
          />
        )}
        <Select
          aria-label="专注对象"
          className="min-w-0 flex-1 basis-40"
          value={picked}
          placeholder={options.length > 0 ? '选一件事…' : '没有可专注的对象'}
          disabled={options.length === 0}
          onChange={setPicked}
          options={options.map((item) => ({
            value: item.key,
            label: `${item.group} · ${item.title}`,
          }))}
        />
      </div>
    </div>
  );
};

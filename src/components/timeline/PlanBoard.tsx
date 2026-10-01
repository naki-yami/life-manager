import React, { useMemo } from 'react';
import { Card, CardBody, CardHeader } from '../ui';
import { DayTimeline, type TimelineEntry } from './DayTimeline';
import { FocusTimer } from './FocusTimer';
import { useFocusSession } from './useFocusSession';
import { useTaskStore } from '../../store/taskStore';
import { todayKey } from '../../utils/date';
import { POMODORO_MINUTES, formatFocusDuration, timeboxedTasks } from '../../utils/focus';

/**
 * 今日时间轴：把今天的任务排进时间盒子，再从盒子上直接开始专注。
 *
 * 它原来挂在首页，和「待办」「快速添加」抢同一屏 —— 首页要回答的是「今天先做什么」，
 * 「排在几点」属于计划这件事，所以整块搬到「今日计划」页。
 */
export const PlanBoard: React.FC = () => {
  const tasks = useTaskStore((state) => state.tasks);
  const setTimebox = useTaskStore((state) => state.setTimebox);
  const focus = useFocusSession();
  const today = todayKey();

  /** 今日时间轴上已排的任务（已按开始时间排好） */
  const entries = useMemo<TimelineEntry[]>(
    () =>
      timeboxedTasks(tasks, today).map(({ task, timebox }) => ({
        id: task.id,
        title: task.title,
        start: timebox.start,
        minutes: timebox.minutes,
        done: task.status === 'completed',
      })),
    [tasks, today],
  );

  /**
   * 还没排进今天的任务：今天到期、已经逾期，或干脆没定截止日期。
   * 未来的任务不往这里塞 —— 时间轴说的是「今天做什么」，不是「以后做什么」。
   */
  const candidates = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            task.status === 'pending' &&
            task.timebox?.date !== today &&
            (!task.dueDate || task.dueDate <= today),
        )
        .map((task) => ({ id: task.id, title: task.title })),
    [tasks, today],
  );

  /**
   * 排进时间轴。新建的盒子给 1 小时 —— 比 30 分钟更接近「一件事」的实际体量，
   * 长了短了都能用盒子上的 ± 按钮就地调。
   */
  const handleSchedule = (taskId: string, start: string): void => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    setTimebox(taskId, { date: today, start, minutes: task.timebox?.minutes ?? 60 });
  };

  const handleResize = (taskId: string, minutes: number): void => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task?.timebox) return;
    setTimebox(taskId, { ...task.timebox, minutes });
  };

  const handleRemove = (taskId: string): void => setTimebox(taskId, null);

  /** 从时间轴的盒子上直接开始番茄钟，计划时长就取这个盒子排的时长 */
  const handleFocusBox = (taskId: string): void => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    focus.start({
      entityId: task.id,
      title: task.title,
      target: 'task',
      mode: 'pomodoro',
      plannedMinutes: task.timebox?.minutes ?? POMODORO_MINUTES,
    });
  };

  return (
    <Card>
      <CardHeader
        title="今日时间轴"
        subtitle={
          focus.today.count > 0
            ? `今天已专注 ${focus.today.count} 次、共 ${formatFocusDuration(focus.today.minutes)}`
            : '把任务排到时间轴上，再从盒子上直接开始专注'
        }
      />
      <CardBody>
        <div className="mb-4">
          <FocusTimer
            active={focus.active}
            options={focus.options}
            onStart={focus.start}
            onFinish={focus.finish}
            onCancel={focus.cancel}
          />
        </div>
        <DayTimeline
          label={`${today} 的时间轴`}
          entries={entries}
          candidates={candidates}
          onSchedule={handleSchedule}
          onResize={handleResize}
          onRemove={handleRemove}
          onFocus={handleFocusBox}
          activeId={focus.active?.entityId ?? null}
        />
      </CardBody>
    </Card>
  );
};

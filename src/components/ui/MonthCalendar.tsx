import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface CalendarMark {
  /** 该天的记录条数（决定点的深浅） */
  count: number;
  /** 悬停/无障碍说明，如「2 次训练」 */
  label?: string;
}

export interface MonthCalendarProps {
  /** 初始月份 YYYY-MM，默认当前月 */
  initialMonth?: string;
  /** 选中的日期键 YYYY-MM-DD */
  selected?: string;
  /** 点某一天 */
  onSelect?: (dateKey: string) => void;
  /** 有记录的日期 -> 标记 */
  marks?: Record<string, CalendarMark>;
  /** 无障碍名称 */
  label: string;
  className?: string;
}

const WEEKDAY_HEADERS = ['一', '二', '三', '四', '五', '六', '日'];

function monthOf(key: string): { year: number; month: number } {
  const parts = key.split('-').map((part) => Number(part));
  return { year: parts[0] ?? 1970, month: parts[1] ?? 1 };
}

function buildMonthDays(year: number, month: number): Array<{ key: string; inMonth: boolean }> {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // 周一为一周之始
  const leading = (first.getDay() + 6) % 7;
  const pad = (value: number): string => String(value).padStart(2, '0');
  const days: Array<{ key: string; inMonth: boolean }> = [];
  // 上个月的补位
  for (let i = leading; i > 0; i -= 1) {
    const date = new Date(year, month - 1, 1 - i);
    days.push({
      key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      inMonth: false,
    });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push({ key: `${year}-${pad(month)}-${pad(day)}`, inMonth: true });
  }
  // 补齐到整周
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1]!.key;
    const parts = last.split('-').map((part) => Number(part));
    const date = new Date(parts[0]!, parts[1]! - 1, parts[2]! + 1);
    days.push({
      key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      inMonth: false,
    });
  }
  return days;
}

/**
 * 月历：健身 / 饮食共用的日历视图。
 * 有记录的日子显示一个深浅不同的圆点，点任意一天触发 onSelect。
 */
export function MonthCalendar({
  initialMonth,
  selected,
  onSelect,
  marks = {},
  label,
  className = '',
}: MonthCalendarProps): React.ReactElement {
  const today = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const [monthKey, setMonthKey] = useState(initialMonth ?? `${today.getFullYear()}-${pad(today.getMonth() + 1)}`);
  const { year, month } = monthOf(monthKey);

  const days = useMemo(() => buildMonthDays(year, month), [year, month]);

  const shiftMonth = (delta: number): void => {
    const next = new Date(year, month - 1 + delta, 1);
    setMonthKey(`${next.getFullYear()}-${pad(next.getMonth() + 1)}`);
  };

  const maxCount = Math.max(1, ...Object.values(marks).map((mark) => mark.count));

  return (
    <div className={className} role="group" aria-label={label}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="上一月"
          onClick={() => shiftMonth(-1)}
          className="rounded p-1 text-content-tertiary hover:text-content-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
        >
          <ChevronLeft size={16} aria-hidden />
        </button>
        <p className="text-sm font-semibold text-content">
          {year} 年 {month} 月
        </p>
        <button
          type="button"
          aria-label="下一月"
          onClick={() => shiftMonth(1)}
          className="rounded p-1 text-content-tertiary hover:text-content-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus"
        >
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_HEADERS.map((weekday) => (
          <span key={weekday} className="text-2xs text-content-tertiary">
            {weekday}
          </span>
        ))}
        {days.map(({ key, inMonth }) => {
          const mark = marks[key];
          const level = mark ? Math.ceil((mark.count / maxCount) * 3) : 0;
          const isSelected = key === selected;
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect?.(key)}
              aria-label={`${key}${mark?.label ? `，${mark.label}` : ''}${isSelected ? '，已选中' : ''}`}
              aria-pressed={isSelected}
              className={`relative flex h-10 flex-col items-center justify-center rounded text-xs transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${
                isSelected
                  ? 'bg-selected text-accent font-semibold'
                  : inMonth
                    ? 'text-content-secondary hover:bg-hover'
                    : 'text-content-tertiary/50 hover:bg-hover'
              } ${isToday && !isSelected ? 'ring-1 ring-line-strong' : ''}`}
            >
              {Number(key.slice(8, 10))}
              {mark && mark.count > 0 && (
                <span
                  aria-hidden
                  className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${
                    level >= 3 ? 'bg-accent' : level === 2 ? 'bg-accent/70' : 'bg-accent/40'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

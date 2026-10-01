import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { StatTone } from './Card';

export interface StatStripItem {
  label: string;
  value: React.ReactNode;
  unit?: string;
  icon?: React.ReactNode;
  tone?: StatTone;
  /** 环比变化，单位是百分数（100 就是 +100%），正数向上 */
  trend?: { value: number; label?: string };
  /** 数字下方的一行小字，也可以塞迷你趋势图 */
  hint?: React.ReactNode;
}

export interface StatStripProps {
  items: readonly StatStripItem[];
  /** 整条的组名，读屏会念出来 */
  label: string;
  className?: string;
}

const TONE: Record<StatTone, string> = {
  default: 'text-content',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/**
 * 一排统计数字。
 *
 * 首页原来是四张各自带边框与阴影的 StatCard：四个盒子并排，彼此没有关系，
 * 一屏里的「盒子数」也下不去。收成一条之后是一条外壳、组间一根竖线，
 * 数字彼此对齐，可以直接横着比。窄屏自动改竖排，分隔线从竖线换成横线。
 *
 * 环比之所以带上 `%`：`changeRate` 返回的就是百分数，
 * 老 StatCard 直接打印数字，读起来像个不伦不类的「+100」。
 */
export const StatStrip: React.FC<StatStripProps> = ({ items, label, className = '' }) => (
  <div
    role="group"
    aria-label={label}
    className={`flex flex-col overflow-hidden rounded-lg border border-line-subtle bg-surface shadow-xs sm:flex-row ${className}`}
  >
    {items.map((item) => (
      <div
        key={item.label}
        className="min-w-0 flex-1 border-t border-line-subtle px-4 py-3 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0"
      >
        <p className="flex items-center gap-1.5 text-xs font-medium text-content-tertiary">
          {item.icon}
          <span className="truncate">{item.label}</span>
        </p>
        <div className="mt-1 flex items-baseline gap-1">
          <span className={`text-xl font-semibold tabular ${TONE[item.tone ?? 'default']}`}>
            {item.value}
          </span>
          {item.unit && <span className="text-xs text-content-tertiary">{item.unit}</span>}
        </div>
        {(item.trend || item.hint) && (
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-content-tertiary">
            {item.trend && (
              <span
                className={`flex items-center gap-0.5 ${
                  item.trend.value >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {item.trend.value >= 0 ? (
                  <ArrowUpRight size={12} aria-hidden />
                ) : (
                  <ArrowDownRight size={12} aria-hidden />
                )}
                <span className="tabular">
                  {item.trend.value >= 0 ? '+' : ''}
                  {item.trend.value}%
                </span>
              </span>
            )}
            {item.trend?.label && <span>{item.trend.label}</span>}
            {item.hint}
          </div>
        )}
      </div>
    ))}
  </div>
);

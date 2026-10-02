import React, { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { BarChart } from '../../components/charts';
import { Card, CardBody, CardHeader, EmptyState, IconButton } from '../ui';
import type { DevProject, WorkSession } from '../../types';
import { formatNumber, formatShortDate, todayKey } from '../../utils/date';
import { seriesByWeek } from '../../utils/stats';

/** 投入图表画最近几周，最后一格是包含今天的那一周 */
const WEEK_COUNT = 8;

/** 最多列几条工时流水 */
const SESSION_PREVIEW_COUNT = 6;

export interface InvestmentCardProps {
  project: DevProject;
  /** 该项目的全部工时流水（调用方先按 projectId 筛好） */
  projectSessions: WorkSession[];
  /** 点删除只负责上报 id，确认弹窗由页面统一管 */
  onRequestDeleteSession: (sessionId: string) => void;
}

/**
 * 近期投入（按项目）：近 8 周柱图 + 最近几条流水。
 * 全站汇总数字收在页头，这里只看当前项目自己的投入。
 */
export const InvestmentCard: React.FC<InvestmentCardProps> = ({
  project,
  projectSessions,
  onRequestDeleteSession,
}) => {
  const today = todayKey();

  const weeklyHours = useMemo(
    () =>
      seriesByWeek(
        projectSessions,
        WEEK_COUNT,
        today,
        (session) => session.date,
        (session) => session.hours,
      ),
    [projectSessions, today],
  );

  const recentSessions = useMemo(
    () =>
      [...projectSessions]
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, SESSION_PREVIEW_COUNT),
    [projectSessions],
  );

  const totalHours = projectSessions.reduce((sum, session) => sum + session.hours, 0);

  return (
    <Card>
      <CardHeader
        title="近期投入"
        subtitle={
          projectSessions.length > 0
            ? `累计 ${formatNumber(Math.round(totalHours * 10) / 10)} 小时 · ${projectSessions.length} 条记录`
            : '还没有工时记录，点「记录工时」开始'
        }
      />
      <CardBody className="space-y-4">
        {projectSessions.length === 0 ? (
          <EmptyState
            title="还没有工时记录"
            description="记一次工时，投入就会出现在这里和图表里。"
          />
        ) : (
          <>
            <BarChart
              data={weeklyHours}
              label={`「${project.name}」近 8 周每周投入工时`}
              formatValue={(value) => `${formatNumber(value)} 小时`}
              formatDate={formatShortDate}
            />

            <ul className="divide-y divide-line-subtle rounded-lg border border-line-subtle">
              {recentSessions.map((session) => (
                <li
                  key={session.id}
                  className="flex items-center gap-3 px-3 py-2 transition-colors duration-fast ease-standard hover:bg-hover"
                >
                  <span className="shrink-0 text-xs text-content-tertiary tabular">
                    {formatShortDate(session.date)}
                  </span>
                  <span className="shrink-0 text-sm text-content tabular">
                    {formatNumber(session.hours)} 小时
                  </span>
                  {session.note && (
                    <span className="min-w-0 flex-1 truncate text-xs text-content-tertiary">
                      {session.note}
                    </span>
                  )}
                  <IconButton
                    label={`删除 ${formatShortDate(session.date)} 的工时记录`}
                    size="sm"
                    icon={<Trash2 size={13} />}
                    onClick={() => onRequestDeleteSession(session.id)}
                    className="hover:text-danger"
                  />
                </li>
              ))}
            </ul>

            {projectSessions.length > recentSessions.length && (
              <p className="text-xs text-content-tertiary">
                只显示最近 {recentSessions.length} 条，共 {projectSessions.length} 条记录。
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
};

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Code2,
  Dumbbell,
  Gamepad2,
  ListTodo,
  NotebookPen,
  PenTool,
  Send,
  Trash2,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckboxRow,
  EmptyState,
  IconButton,
  Input,
  StatCard,
} from '../components/ui';
import { PageHeader } from '../components/layout';
import { useTaskStore } from '../store/taskStore';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useWritingStore } from '../store/writingStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useDietStore } from '../store/dietStore';
import { useGameStore } from '../store/gameStore';
import { formatLongDate, formatNumber, todayKey } from '../utils/date';
import type { Priority } from '../types';

type ModuleTone = 'accent' | 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASS: Record<ModuleTone, string> = {
  accent: 'bg-accent-soft text-accent',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

const PRIORITY_BADGE: Record<Priority, { tone: 'danger' | 'warning' | 'default'; label: string }> = {
  high: { tone: 'danger', label: '紧急' },
  medium: { tone: 'warning', label: '中等' },
  low: { tone: 'default', label: '较低' },
};

interface ModuleCard {
  icon: LucideIcon;
  label: string;
  stat: string;
  detail: string;
  tone: ModuleTone;
  path: string;
}

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { tasks, memos, addMemo, deleteMemo, toggleTaskStatus } = useTaskStore();
  const books = useBookStore((state) => state.books);
  const devProjects = useDevStore((state) => state.projects);
  const writingProjects = useWritingStore((state) => state.projects);
  const workoutRecords = useFitnessStore((state) => state.records);
  const mealRecords = useDietStore((state) => state.records);
  const games = useGameStore((state) => state.games);

  const [memoInput, setMemoInput] = useState('');
  const [memoError, setMemoError] = useState<string | undefined>();

  const pendingTasks = useMemo(() => tasks.filter((task) => task.status === 'pending'), [tasks]);
  const completedCount = tasks.length - pendingTasks.length;
  const urgentTasks = pendingTasks.filter((task) => task.priority === 'high');
  const todayTasks = pendingTasks.slice(0, 5);
  const completionRate = tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100);

  const moduleCards = useMemo<ModuleCard[]>(() => {
    const today = todayKey();
    const reading = books.filter((book) => book.status === 'reading').length;
    const activeProjects = devProjects.filter((project) => project.status === 'in-progress').length;
    const totalWords = writingProjects.reduce((sum, project) => sum + project.wordCount, 0);
    const caloriesToday = mealRecords
      .filter((record) => record.date === today)
      .reduce((sum, record) => sum + record.totalCalories, 0);
    const playing = games.filter((game) => game.status === 'playing').length;

    return [
      {
        icon: BookOpen,
        label: '读书',
        stat: `${reading} 本在读`,
        detail: `书库共 ${books.length} 本`,
        tone: 'info',
        path: '/books',
      },
      {
        icon: Code2,
        label: '开发工作',
        stat: `${activeProjects} 个进行中`,
        detail: `项目共 ${devProjects.length} 个`,
        tone: 'accent',
        path: '/dev',
      },
      {
        icon: PenTool,
        label: '写作',
        stat: `${formatNumber(totalWords)} 字`,
        detail: `稿件共 ${writingProjects.length} 篇`,
        tone: 'success',
        path: '/writing',
      },
      {
        icon: Dumbbell,
        label: '健身计划',
        stat: `累计 ${workoutRecords.length} 次`,
        detail:
          workoutRecords.length > 0
            ? `最近一次 ${workoutRecords[workoutRecords.length - 1]!.date}`
            : '还没有训练记录',
        tone: 'warning',
        path: '/fitness',
      },
      {
        icon: UtensilsCrossed,
        label: '饮食计划',
        stat: `${formatNumber(caloriesToday)} kcal`,
        detail: '今日已记录',
        tone: 'danger',
        path: '/diet',
      },
      {
        icon: Gamepad2,
        label: '游戏娱乐',
        stat: `${playing} 款在玩`,
        detail: `库中共 ${games.length} 款`,
        tone: 'info',
        path: '/games',
      },
    ];
  }, [books, devProjects, writingProjects, workoutRecords, mealRecords, games]);

  const handleAddMemo = (): void => {
    const content = memoInput.trim();
    if (!content) {
      setMemoError('先写点什么再保存');
      return;
    }
    addMemo(content);
    setMemoInput('');
    setMemoError(undefined);
  };

  return (
    <div className="space-y-section">
      <PageHeader
        title="你好 👋"
        description={`今天是 ${formatLongDate()}`}
        actions={
          <Button variant="secondary" onClick={() => navigate('/tasks')}>
            管理今日计划
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="待办任务"
          value={pendingTasks.length}
          tone="accent"
          icon={<ListTodo size={16} aria-hidden />}
          footer={`已完成 ${completedCount} 项`}
        />
        <StatCard
          label="完成率"
          value={completionRate}
          unit="%"
          tone="success"
          icon={<CheckCircle2 size={16} aria-hidden />}
        />
        <StatCard
          label="备忘条"
          value={memos.length}
          icon={<NotebookPen size={16} aria-hidden />}
        />
        <StatCard
          label="紧急任务"
          value={urgentTasks.length}
          tone={urgentTasks.length > 0 ? 'danger' : 'default'}
          icon={<AlertTriangle size={16} aria-hidden />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="今日待办"
            subtitle={`${pendingTasks.length} 个待完成`}
            action={
              <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
                查看全部
              </Button>
            }
          />
          <CardBody>
            {todayTasks.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={20} aria-hidden />}
                title="待办清空了"
                description="今天的任务都处理完了，可以去「今日计划」添加新的。"
                className="py-6"
              />
            ) : (
              <ul className="space-y-1">
                {todayTasks.map((task) => (
                  <li key={task.id} className="flex items-center gap-3 rounded px-1.5 py-1">
                    <CheckboxRow
                      className="min-w-0 flex-1"
                      checked={task.status === 'completed'}
                      onChange={() => toggleTaskStatus(task.id)}
                      label={task.title}
                    />
                    <Badge tone={PRIORITY_BADGE[task.priority].tone} dot>
                      {PRIORITY_BADGE[task.priority].label}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="快速备忘" subtitle="回车即可保存" />
          <CardBody>
            <div className="mb-3 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label="备忘内容"
                  value={memoInput}
                  onChange={(event) => {
                    setMemoInput(event.target.value);
                    if (memoError) setMemoError(undefined);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleAddMemo();
                    }
                  }}
                  placeholder="输入备忘内容…"
                  error={memoError}
                />
              </div>
              <IconButton
                label="保存备忘"
                variant="primary"
                icon={<Send size={16} />}
                onClick={handleAddMemo}
              />
            </div>

            {memos.length === 0 ? (
              <EmptyState
                icon={<NotebookPen size={20} aria-hidden />}
                title="还没有备忘"
                description="随手记下临时想法，回车就保存。"
                className="py-6"
              />
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {memos.slice(0, 10).map((memo) => (
                  <li
                    key={memo.id}
                    className="group flex items-start gap-2 rounded bg-inset px-3 py-2"
                  >
                    <p className="min-w-0 flex-1 text-sm text-content-secondary">{memo.content}</p>
                    <IconButton
                      label="删除备忘"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={() => deleteMemo(memo.id)}
                      className="opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-visible:opacity-100"
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-content">模块概览</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {moduleCards.map((module) => {
            const Icon = module.icon;
            return (
              <Card key={module.path} onClick={() => navigate(module.path)} className="p-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONE_CLASS[module.tone]}`}
                  >
                    <Icon size={20} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-content">{module.label}</p>
                    <p className="truncate text-xs text-content-secondary">{module.stat}</p>
                    <p className="truncate text-2xs text-content-tertiary">{module.detail}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
};

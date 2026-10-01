import React, { useMemo, useState } from 'react';
import { Button, Card, CardBody, useOptionalToast } from './ui';
import { useBookStore } from '../store/bookStore';
import { useDevStore } from '../store/devStore';
import { useDietStore } from '../store/dietStore';
import { useFitnessStore } from '../store/fitnessStore';
import { useGameStore } from '../store/gameStore';
import { useTaskStore } from '../store/taskStore';
import { useWritingStore } from '../store/writingStore';
import {
  appIsEmpty,
  clearDemoData,
  demoDataExists,
  seedDemoData,
  type DemoModules,
} from '../data/demoData';

export interface DemoDataCardProps {
  /**
   * home：冷启动引导——有真实数据时整块隐藏（首页不打扰）。
   * settings：随时可用——没 demo 就能载入，有 demo 就能清除。
   */
  variant: 'home' | 'settings';
}

/**
 * 示例数据卡（原 7.7）：一键载入 / 一键清除带 demo 前缀标记的样本记录。
 * 自行订阅七个模块，调用方不需要传任何数据。
 */
export const DemoDataCard: React.FC<DemoDataCardProps> = ({ variant }) => {
  const toast = useOptionalToast();
  const [busy, setBusy] = useState(false);

  const tasks = useTaskStore((state) => state.tasks);
  const books = useBookStore((state) => state.books);
  const devProjects = useDevStore((state) => state.projects);
  const writingProjects = useWritingStore((state) => state.projects);
  const workoutRecords = useFitnessStore((state) => state.records);
  const dietRecords = useDietStore((state) => state.records);
  const games = useGameStore((state) => state.games);

  const modules = useMemo<DemoModules>(
    () => ({ tasks, books, devProjects, writingProjects, workoutRecords, dietRecords, games }),
    [tasks, books, devProjects, writingProjects, workoutRecords, dietRecords, games],
  );
  const appEmpty = useMemo(() => appIsEmpty(modules), [modules]);
  const demoLoaded = useMemo(() => demoDataExists(modules), [modules]);

  // 首页变体：有真实数据时保持安静（冷启动引导是它唯一的职责）
  if (variant === 'home' && !appEmpty && !demoLoaded) return null;

  const handleSeed = (): void => {
    setBusy(true);
    try {
      seedDemoData();
      toast?.toast({
        tone: 'success',
        title: '示例数据已载入',
        description: '各模块都有了两三条样本（id 带 demo 前缀），随时可以一键清除。',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleClear = (): void => {
    clearDemoData();
    toast?.toast({
      tone: 'success',
      title: '示例数据已清除',
      description: '只删了带 demo 前缀的记录，你记的真实数据没有动。',
    });
  };

  const settingsVariant = variant === 'settings';

  // settings 变体在有真实数据、没 demo 时给一个安静的「载入」入口
  if (settingsVariant && !demoLoaded && !appEmpty) {
    return (
      <Card>
        <CardBody className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-content">示例数据</p>
            <p className="mt-0.5 text-xs text-content-tertiary">
              会往各模块追加两三条 id 带 demo 前缀的样本记录，看完随时清除，真实数据不受影响。
            </p>
          </div>
          <Button variant="secondary" disabled={busy} onClick={handleSeed}>
            载入示例数据
          </Button>
        </CardBody>
      </Card>
    );
  }

  if (demoLoaded) {
    return (
      <Card>
        <CardBody className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-content">示例数据还在</p>
            <p className="mt-0.5 text-xs text-content-tertiary">
              id 带 demo 前缀的记录就是示例数据；清除只删这些，后来记的真实数据不受影响。
            </p>
          </div>
          <Button variant="secondary" onClick={handleClear}>
            清除示例数据
          </Button>
        </CardBody>
      </Card>
    );
  }

  // 冷启动引导（settings 变体在全空时与首页同一份文案）
  return (
    <Card>
      <CardBody className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-content">
            第一次用？载入一份示例数据看看各页面长什么样
          </p>
          <p className="mt-0.5 text-xs text-content-tertiary">
            会往每个模块写两三条带 demo 标记的样本记录，随时可以一键清除，不会和真实数据混在一起。
          </p>
        </div>
        <Button variant="secondary" disabled={busy} onClick={handleSeed}>
          一键载入示例数据
        </Button>
      </CardBody>
    </Card>
  );
};

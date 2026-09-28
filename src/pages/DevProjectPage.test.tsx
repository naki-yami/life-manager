import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { DevProjectPage } from './DevProjectPage';
import { useDevStore } from '../store/devStore';
import { todayKey } from '../utils/date';

beforeEach(() => {
  useDevStore.setState({ projects: [], sessions: [] });
});

const projectId = (name: string) =>
  useDevStore.getState().projects.find((project) => project.name === name)!.id;

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dev/:id" element={<DevProjectPage />} />
        <Route path="/dev" element={<div>项目列表</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('DevProjectPage', () => {
  it('项目不存在时给出空态与返回入口', () => {
    renderAt('/dev/no-such-id');
    expect(screen.getByText('项目不存在或已被删除')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /返回项目列表/ })).toHaveAttribute('href', '/dev');
  });

  it('渲染项目信息，任务按状态分到看板三列', () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '一个写作辅助工具');
    const pid = projectId('写作助手');
    store.addTask(pid, '待办任务', 'high');
    store.addTask(pid, '进行中任务', 'medium');
    store.addTask(pid, '已完成任务', 'low');
    const tasks = useDevStore.getState().projects[0]!.tasks;
    store.updateTaskStatus(pid, tasks[1]!.id, 'in-progress');
    store.updateTaskStatus(pid, tasks[2]!.id, 'done');
    store.updateProject(pid, { techStack: ['React'], repoUrl: 'https://example.com/repo' });

    renderAt(`/dev/${pid}`);

    expect(screen.getByRole('heading', { name: '写作助手' })).toBeInTheDocument();
    expect(screen.getByText('一个写作辅助工具')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '打开「写作助手」的仓库地址' }),
    ).toHaveAttribute('href', 'https://example.com/repo');

    const columnOf = (heading: string) =>
      screen.getByRole('heading', { name: heading }).closest('div')!.parentElement!;
    expect(within(columnOf('待办')).getByText('待办任务')).toBeInTheDocument();
    expect(within(columnOf('进行中')).getByText('进行中任务')).toBeInTheDocument();
    expect(within(columnOf('已完成')).getByText('已完成任务')).toBeInTheDocument();
  });

  it('在看板表单里添加任务会写入 store', async () => {
    useDevStore.getState().addProject('写作助手', '');
    const pid = projectId('写作助手');
    renderAt(`/dev/${pid}`);

    await userEvent.type(screen.getByLabelText('新任务'), '写导出接口');
    await userEvent.click(screen.getByRole('button', { name: '添加任务' }));

    const tasks = useDevStore.getState().projects[0]!.tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.title).toBe('写导出接口');
    expect(tasks[0]!.status).toBe('todo');
    expect(screen.getByText('写导出接口')).toBeInTheDocument();
  });

  it('在看板里改任务状态会写回 store', async () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addTask(projectId('写作助手'), '写导出接口', 'medium');
    const pid = projectId('写作助手');
    renderAt(`/dev/${pid}`);

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '调整任务「写导出接口」的状态' }),
      'in-progress',
    );

    expect(useDevStore.getState().projects[0]!.tasks[0]!.status).toBe('in-progress');
  });

  it('记录工时会写入流水并累加到项目', async () => {
    useDevStore.getState().addProject('写作助手', '');
    const pid = projectId('写作助手');
    renderAt(`/dev/${pid}`);

    await userEvent.click(screen.getByRole('button', { name: '记录工时' }));
    const dialog = screen.getByRole('dialog', { name: '记录工时' });
    await userEvent.type(within(dialog).getByLabelText('备注'), '搭好骨架');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    const { sessions, projects } = useDevStore.getState();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.projectId).toBe(pid);
    expect(sessions[0]!.date).toBe(todayKey());
    expect(projects[0]!.hoursSpent).toBe(1);
    expect(screen.getByText('搭好骨架')).toBeInTheDocument();
  });

  it('活动日志按日期列出工时流水', () => {
    const store = useDevStore.getState();
    store.addProject('写作助手', '');
    store.addSession(projectId('写作助手'), '2026-09-20', 2, '第一章');
    store.addSession(projectId('写作助手'), todayKey(), 1.5, '');

    renderAt(`/dev/${projectId('写作助手')}`);

    expect(screen.getByText(/共 2 条 · 累计 3\.5 小时/)).toBeInTheDocument();
    expect(screen.getByText('第一章')).toBeInTheDocument();
  });
});

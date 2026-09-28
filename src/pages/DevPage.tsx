import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardBody, Button, Input, Modal, Select } from '../components/ui';
import { useDevStore } from '../store/devStore';
import { DevProjectStatus, DevTaskStatus, Priority } from '../types';

export const DevPage: React.FC = () => {
  const { projects, addProject, deleteProject, updateProjectStatus, addTask, updateTaskStatus, deleteTask } = useDevStore();
  const [showAddProject, setShowAddProject] = useState(false);
  const [showAddTask, setShowAddTask] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [taskForm, setTaskForm] = useState({ title: '', priority: 'medium' as Priority });
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddProject = () => {
    if (!projectForm.name.trim()) return;
    addProject(projectForm.name, projectForm.description);
    setProjectForm({ name: '', description: '' });
    setShowAddProject(false);
  };

  const handleAddTask = () => {
    if (showAddTask && taskForm.title.trim()) {
      addTask(showAddTask, taskForm.title, taskForm.priority);
      setTaskForm({ title: '', priority: 'medium' });
      setShowAddTask(null);
    }
  };

  const statusLabels: Record<DevProjectStatus, string> = {
    'planning': '规划中', 'in-progress': '进行中', 'completed': '已完成', 'paused': '已暂停',
  };

  const taskStatusLabels: Record<DevTaskStatus, string> = {
    'todo': '待办', 'in-progress': '进行中', 'done': '已完成',
  };

  const taskStatusColors: Record<DevTaskStatus, string> = {
    'todo': 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    'in-progress': 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    'done': 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">开发工作</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">管理你的开发项目</p>
        </div>
        <Button onClick={() => setShowAddProject(true)}>
          <Plus size={16} className="mr-2" /> 新建项目
        </Button>
      </div>

      <div className="space-y-4">
        {projects.length === 0 ? (
          <Card className="p-8 text-center"><p className="text-gray-400">暂无项目</p></Card>
        ) : (
          projects.map((project) => (
            <Card key={project.id}>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleExpand(project.id)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {expandedProjects.has(project.id) ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{project.name}</h3>
                      <Select
                        value={project.status}
                        onChange={(v) => updateProjectStatus(project.id, v as DevProjectStatus)}
                        options={Object.entries(statusLabels).map(([k, l]) => ({ value: k, label: l }))}
                        className="w-auto"
                      />
                    </div>
                    {project.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{project.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setShowAddTask(project.id)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-green-500 transition-colors">
                      <Plus size={16} />
                    </button>
                    <button onClick={() => deleteProject(project.id)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {expandedProjects.has(project.id) && (
                <div className="border-t border-gray-100 dark:border-gray-700 p-4 pt-3">
                  {project.tasks.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-2">暂无任务</p>
                  ) : (
                    <div className="space-y-2">
                      {project.tasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                          <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{task.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${taskStatusColors[task.status]}`}>
                            {taskStatusLabels[task.status]}
                          </span>
                          <select
                            value={task.status}
                            onChange={(e) => updateTaskStatus(project.id, task.id, e.target.value as DevTaskStatus)}
                            className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                          >
                            {Object.entries(taskStatusLabels).map(([k, l]) => (
                              <option key={k} value={k}>{l}</option>
                            ))}
                          </select>
                          <button onClick={() => deleteTask(project.id, task.id)} className="text-gray-400 hover:text-red-500">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Add Project Modal */}
      <Modal isOpen={showAddProject} onClose={() => setShowAddProject(false)} title="新建项目">
        <div className="space-y-4">
          <Input label="项目名称" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} placeholder="输入项目名称" />
          <Input label="描述" value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })} placeholder="项目描述" multiline rows={3} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddProject(false)}>取消</Button>
            <Button onClick={handleAddProject}>创建</Button>
          </div>
        </div>
      </Modal>

      {/* Add Task Modal */}
      <Modal isOpen={!!showAddTask} onClose={() => setShowAddTask(null)} title="添加任务">
        <div className="space-y-4">
          <Input label="任务标题" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="输入任务标题" />
          <Select
            label="优先级"
            value={taskForm.priority}
            onChange={(v) => setTaskForm({ ...taskForm, priority: v as Priority })}
            options={[{ value: 'high', label: '紧急' }, { value: 'medium', label: '中等' }, { value: 'low', label: '低' }]}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddTask(null)}>取消</Button>
            <Button onClick={handleAddTask}>添加</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

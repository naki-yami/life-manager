import React, { useState } from 'react';
import { Plus, Trash2, History } from 'lucide-react';
import { Card, CardHeader, CardBody, Button, Input, Modal, Select } from '../components/ui';
import { useFitnessStore } from '../store/fitnessStore';
import { Exercise } from '../types';

export const FitnessPage: React.FC = () => {
  const { plans, records, addPlan, deletePlan, addRecord, deleteRecord } = useFitnessStore();
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [showLogWorkout, setShowLogWorkout] = useState(false);
  const [planForm, setPlanForm] = useState({ name: '', description: '' });
  const [workoutForm, setWorkoutForm] = useState({
    planName: '',
    date: new Date().toISOString().split('T')[0],
    exercises: [{ name: '', sets: 3, reps: 10, weight: 0 }] as Array<{ name: string; sets: number; reps: number; weight: number }>,
    notes: '',
  });

  const handleAddPlan = () => {
    if (!planForm.name.trim()) return;
    addPlan(planForm.name, planForm.description);
    setPlanForm({ name: '', description: '' });
    setShowAddPlan(false);
  };

  const addExerciseField = () => {
    setWorkoutForm({
      ...workoutForm,
      exercises: [...workoutForm.exercises, { name: '', sets: 3, reps: 10, weight: 0 }],
    });
  };

  const updateExercise = (index: number, field: string, value: string | number) => {
    setWorkoutForm({
      ...workoutForm,
      exercises: workoutForm.exercises.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex)),
    });
  };

  const handleLogWorkout = () => {
    const validExercises = workoutForm.exercises.filter((e) => e.name.trim());
    if (validExercises.length === 0) return;
    addRecord(workoutForm.planName, workoutForm.date, validExercises, workoutForm.notes);
    setWorkoutForm({
      planName: '',
      date: new Date().toISOString().split('T')[0],
      exercises: [{ name: '', sets: 3, reps: 10, weight: 0 }],
      notes: '',
    });
    setShowLogWorkout(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">健身计划</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">记录你的训练数据</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowLogWorkout(true)}>
            <History size={16} className="mr-2" /> 记录训练
          </Button>
          <Button onClick={() => setShowAddPlan(true)}>
            <Plus size={16} className="mr-2" /> 新建计划
          </Button>
        </div>
      </div>

      {/* Plans */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">训练计划</h2>
        <div className="grid gap-3">
          {plans.length === 0 ? (
            <Card className="p-6 text-center"><p className="text-gray-400">暂无训练计划</p></Card>
          ) : (
            plans.map((plan) => (
              <Card key={plan.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">{plan.name}</h3>
                    {plan.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{plan.description}</p>}
                  </div>
                  <button onClick={() => deletePlan(plan.id)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Workout History */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">训练记录</h2>
        <div className="space-y-3">
          {records.length === 0 ? (
            <Card className="p-6 text-center"><p className="text-gray-400">暂无训练记录</p></Card>
          ) : (
            records.map((record) => (
              <Card key={record.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">{record.planName || '自由训练'}</h3>
                      <span className="text-xs text-gray-400">{record.date}</span>
                    </div>
                    <div className="space-y-1">
                      {record.exercises.map((ex) => (
                        <p key={ex.id} className="text-sm text-gray-600 dark:text-gray-400">
                          {ex.name}: {ex.sets}组 × {ex.reps}次 @ {ex.weight}kg
                        </p>
                      ))}
                    </div>
                    {record.notes && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 italic">{record.notes}</p>}
                  </div>
                  <button onClick={() => deleteRecord(record.id)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Add Plan Modal */}
      <Modal isOpen={showAddPlan} onClose={() => setShowAddPlan(false)} title="新建训练计划">
        <div className="space-y-4">
          <Input label="计划名称" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="如：增肌计划、减脂计划" />
          <Input label="描述" value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} placeholder="计划描述" multiline rows={3} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddPlan(false)}>取消</Button>
            <Button onClick={handleAddPlan}>创建</Button>
          </div>
        </div>
      </Modal>

      {/* Log Workout Modal */}
      <Modal isOpen={showLogWorkout} onClose={() => setShowLogWorkout(false)} title="记录训练">
        <div className="space-y-4">
          <Select
            label="选择计划"
            value={workoutForm.planName}
            onChange={(v) => setWorkoutForm({ ...workoutForm, planName: v })}
            options={[{ value: '', label: '自由训练' }, ...plans.map((p) => ({ value: p.name, label: p.name }))]}
          />
          <Input label="日期" type="date" value={workoutForm.date} onChange={(e) => setWorkoutForm({ ...workoutForm, date: e.target.value })} />
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">训练动作</label>
            {workoutForm.exercises.map((ex, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <input
                  value={ex.name}
                  onChange={(e) => updateExercise(i, 'name', e.target.value)}
                  placeholder="动作名"
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <input
                  type="number"
                  value={ex.sets}
                  onChange={(e) => updateExercise(i, 'sets', parseInt(e.target.value) || 0)}
                  placeholder="组"
                  className="w-14 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <input
                  type="number"
                  value={ex.reps}
                  onChange={(e) => updateExercise(i, 'reps', parseInt(e.target.value) || 0)}
                  placeholder="次"
                  className="w-14 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <input
                  type="number"
                  value={ex.weight}
                  onChange={(e) => updateExercise(i, 'weight', parseFloat(e.target.value) || 0)}
                  placeholder="kg"
                  className="w-16 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
            ))}
            <button onClick={addExerciseField} className="text-sm text-primary-600 hover:text-primary-700">
              + 添加动作
            </button>
          </div>

          <Input label="备注" value={workoutForm.notes} onChange={(e) => setWorkoutForm({ ...workoutForm, notes: e.target.value })} placeholder="训练感受..." multiline rows={2} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowLogWorkout(false)}>取消</Button>
            <Button onClick={handleLogWorkout}>保存记录</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

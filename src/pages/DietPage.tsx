import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardBody, Button, Input, Modal, Select } from '../components/ui';
import { useDietStore } from '../store/dietStore';
import { MealType, FoodItem } from '../types';

export const DietPage: React.FC = () => {
  const { records, addRecord, deleteRecord } = useDietStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [form, setForm] = useState({
    type: 'breakfast' as MealType,
    items: [{ name: '', category: '主食', calories: 0 }] as FoodItem[],
  });

  const handleAddItem = () => {
    setForm({ ...form, items: [...form.items, { name: '', category: '主食', calories: 0 }] });
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    setForm({
      ...form,
      items: form.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    });
  };

  const handleAdd = () => {
    const validItems = form.items.filter((i) => i.name.trim());
    if (validItems.length === 0) return;
    addRecord(selectedDate, form.type, validItems);
    setForm({ type: 'breakfast', items: [{ name: '', category: '主食', calories: 0 }] });
    setShowAddModal(false);
  };

  const dateRecords = records.filter((r) => r.date === selectedDate);

  const totalCalories = dateRecords.reduce((sum, r) => sum + r.totalCalories, 0);

  const mealTypeLabels: Record<MealType, string> = {
    breakfast: '早餐',
    lunch: '午餐',
    dinner: '晚餐',
    snack: '加餐',
  };

  const mealTypeIcons: Record<MealType, string> = {
    breakfast: '🌅',
    lunch: '☀️',
    dinner: '🌙',
    snack: '🍪',
  };

  const foodCategories = ['主食', '蛋白质', '蔬菜', '水果', '乳制品', '饮品', '零食', '其他'];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">饮食计划</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">记录每日饮食摄入</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus size={16} className="mr-2" /> 记录饮食
        </Button>
      </div>

      {/* Date Selector */}
      <div className="flex items-center gap-4">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <Card className="px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">当日总热量:</span>
            <span className="text-lg font-bold text-orange-600">{totalCalories} kcal</span>
          </div>
        </Card>
      </div>

      {/* Meal Records */}
      <div className="space-y-4">
        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mealType) => {
          const mealRecords = dateRecords.filter((r) => r.type === mealType);
          if (mealRecords.length === 0) return null;
          return (
            <Card key={mealType}>
              <CardHeader title={`${mealTypeIcons[mealType]} ${mealTypeLabels[mealType]}`} subtitle={`${mealRecords.reduce((s, r) => s + r.totalCalories, 0)} kcal`} />
              <CardBody>
                {mealRecords.map((record) => (
                  <div key={record.id} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700 last:border-0">
                    <div className="flex-1">
                      {record.items.map((item, i) => (
                        <span key={i} className="text-sm text-gray-700 dark:text-gray-300 mr-3">
                          {item.name} ({item.calories}kcal)
                        </span>
                      ))}
                    </div>
                    <button onClick={() => deleteRecord(record.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </CardBody>
            </Card>
          );
        })}
        {dateRecords.length === 0 && (
          <Card className="p-8 text-center"><p className="text-gray-400">当天暂无饮食记录</p></Card>
        )}
      </div>

      {/* Add Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="记录饮食">
        <div className="space-y-4">
          <Input label="日期" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          <Select
            label="餐次"
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v as MealType })}
            options={Object.entries(mealTypeLabels).map(([k, l]) => ({ value: k, label: l }))}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">食物</label>
            {form.items.map((item, i) => (
              <div key={i} className="flex gap-2 mb-2 items-center">
                <input
                  value={item.name}
                  onChange={(e) => updateItem(i, 'name', e.target.value)}
                  placeholder="食物名称"
                  className="flex-1 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <select
                  value={item.category}
                  onChange={(e) => updateItem(i, 'category', e.target.value)}
                  className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  {foodCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={item.calories}
                  onChange={(e) => updateItem(i, 'calories', parseFloat(e.target.value) || 0)}
                  placeholder="kcal"
                  className="w-20 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
            ))}
            <button onClick={handleAddItem} className="text-sm text-primary-600 hover:text-primary-700">
              + 添加食物
            </button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button onClick={handleAdd}>保存</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

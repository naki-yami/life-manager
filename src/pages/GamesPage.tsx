import React, { useState } from 'react';
import { Plus, Trash2, Trophy, Clock } from 'lucide-react';
import { Card, CardHeader, CardBody, Button, Input, Modal, Select } from '../components/ui';
import { useGameStore } from '../store/gameStore';
import { GamePlatform, GameStatus } from '../types';

export const GamesPage: React.FC = () => {
  const { games, addGame, deleteGame, updateGameStatus, updateHoursPlayed, addAchievement, toggleAchievement } = useGameStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAchievementModal, setShowAchievementModal] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', platform: 'PC' as GamePlatform });
  const [achievementForm, setAchievementForm] = useState({ name: '', description: '' });
  const [filterStatus, setFilterStatus] = useState<'all' | GameStatus>('all');

  const handleAdd = () => {
    if (!form.name.trim()) return;
    addGame(form.name, form.platform);
    setForm({ name: '', platform: 'PC' });
    setShowAddModal(false);
  };

  const handleAddAchievement = () => {
    if (showAchievementModal && achievementForm.name.trim()) {
      addAchievement(showAchievementModal, achievementForm.name, achievementForm.description);
      setAchievementForm({ name: '', description: '' });
    }
  };

  const filtered = games.filter((g) => filterStatus === 'all' || g.status === filterStatus);

  const statusLabels: Record<GameStatus, string> = {
    playing: '在玩',
    completed: '已通关',
    backlog: '搁置',
  };

  const statusColors: Record<GameStatus, string> = {
    playing: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    completed: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    backlog: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">游戏娱乐</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">管理你的游戏库</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus size={16} className="mr-2" /> 添加游戏
        </Button>
      </div>

      <div className="flex gap-2">
        {(['all', 'playing', 'completed', 'backlog'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilterStatus(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filterStatus === f
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {f === 'all' ? '全部' : statusLabels[f]}
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center"><p className="text-gray-400">暂无游戏</p></Card>
        ) : (
          filtered.map((game) => (
            <Card key={game.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{game.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">{game.platform}</span>
                    <Select
                      value={game.status}
                      onChange={(v) => updateGameStatus(game.id, v as GameStatus)}
                      options={Object.entries(statusLabels).map(([k, l]) => ({ value: k, label: l }))}
                      className="w-auto"
                    />
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-gray-400" />
                      <input
                        type="number"
                        value={game.hoursPlayed}
                        onChange={(e) => updateHoursPlayed(game.id, parseFloat(e.target.value) || 0)}
                        className="w-16 px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                      <span className="text-sm text-gray-500">小时</span>
                    </div>
                    {game.progress > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div className="bg-primary-500 h-2 rounded-full" style={{ width: `${game.progress}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{game.progress}%</span>
                      </div>
                    )}
                  </div>
                  {game.achievements.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {game.achievements.map((ach) => (
                        <button
                          key={ach.id}
                          onClick={() => toggleAchievement(game.id, ach.id)}
                          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${
                            ach.unlocked
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
                          }`}
                          title={ach.description}
                        >
                          <Trophy size={10} />
                          {ach.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => setShowAchievementModal(game.id)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-yellow-500 transition-colors"
                    title="管理成就"
                  >
                    <Trophy size={16} />
                  </button>
                  <button onClick={() => deleteGame(game.id)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Add Game Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="添加游戏">
        <div className="space-y-4">
          <Input label="游戏名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="输入游戏名称" />
          <Select
            label="平台"
            value={form.platform}
            onChange={(v) => setForm({ ...form, platform: v as GamePlatform })}
            options={(['PC', 'PS5', 'Xbox', 'Switch', 'Mobile', 'Other'] as GamePlatform[]).map((p) => ({ value: p, label: p }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>取消</Button>
            <Button onClick={handleAdd}>添加</Button>
          </div>
        </div>
      </Modal>

      {/* Achievement Modal */}
      <Modal isOpen={!!showAchievementModal} onClose={() => setShowAchievementModal(null)} title="管理成就">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              value={achievementForm.name}
              onChange={(e) => setAchievementForm({ ...achievementForm, name: e.target.value })}
              placeholder="成就名称"
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              value={achievementForm.description}
              onChange={(e) => setAchievementForm({ ...achievementForm, description: e.target.value })}
              placeholder="描述"
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <Button size="sm" onClick={handleAddAchievement}>添加</Button>
          </div>
          {showAchievementModal && games.find((g) => g.id === showAchievementModal)?.achievements.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">暂无成就</p>
          )}
        </div>
      </Modal>
    </div>
  );
};

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  CalendarCheck,
  BookOpen,
  Code2,
  PenTool,
  Dumbbell,
  UtensilsCrossed,
  Gamepad2,
  Settings,
} from 'lucide-react';

const navItems = [
  { path: '/', label: '首页总览', icon: Home },
  { path: '/tasks', label: '今日计划', icon: CalendarCheck },
  { path: '/books', label: '读书', icon: BookOpen },
  { path: '/dev', label: '开发工作', icon: Code2 },
  { path: '/writing', label: '写作', icon: PenTool },
  { path: '/fitness', label: '健身计划', icon: Dumbbell },
  { path: '/diet', label: '饮食计划', icon: UtensilsCrossed },
  { path: '/games', label: '游戏娱乐', icon: Gamepad2 },
  { path: '/settings', label: '数据与设置', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="w-56 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col shrink-0 h-full overflow-y-auto">
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

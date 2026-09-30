import {
  BarChart3,
  BookHeart,
  BookOpen,
  CalendarCheck,
  Code2,
  Dumbbell,
  Gamepad2,
  Home,
  LayoutGrid,
  NotebookPen,
  PenTool,
  Settings,
  Target,
  Trophy,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** 命令面板的额外匹配词（英文名 / 拼音缩写 / 别名） */
  keywords: string[];
  group: 'main' | 'system';
}

/**
 * 全局导航的唯一定义。
 * 侧栏、移动抽屉、命令面板都从这里取，避免三处各写一份导致不一致。
 */
export const NAV_ITEMS: NavItem[] = [
  {
    path: '/',
    label: '首页总览',
    description: '今日任务、备忘与各模块速览',
    icon: Home,
    keywords: ['home', 'shouye', 'dashboard', '总览'],
    group: 'main',
  },
  {
    path: '/tasks',
    label: '今日计划',
    description: '待办任务与优先级管理',
    icon: CalendarCheck,
    keywords: ['tasks', 'todo', 'jihua', '任务', '待办'],
    group: 'main',
  },
  {
    path: '/books',
    label: '读书',
    description: '在读进度、书摘与笔记',
    icon: BookOpen,
    keywords: ['books', 'reading', 'dushu', '阅读'],
    group: 'main',
  },
  {
    path: '/dev',
    label: '开发工作',
    description: '项目、任务与工时记录',
    icon: Code2,
    keywords: ['dev', 'code', 'project', 'kaifa', '项目'],
    group: 'main',
  },
  {
    path: '/writing',
    label: '写作',
    description: '稿件进度与字数统计',
    icon: PenTool,
    keywords: ['writing', 'xiezuo', '稿件', '文章'],
    group: 'main',
  },
  {
    path: '/fitness',
    label: '健身计划',
    description: '训练记录与身体指标',
    icon: Dumbbell,
    keywords: ['fitness', 'workout', 'jianshen', '健身', '训练', '运动', '体重', '体脂', '围度'],
    group: 'main',
  },
  {
    path: '/diet',
    label: '饮食计划',
    description: '三餐记录与热量统计',
    icon: UtensilsCrossed,
    keywords: ['diet', 'food', 'yinshi', '饮食', '热量'],
    group: 'main',
  },
  {
    path: '/games',
    label: '游戏娱乐',
    description: '时长统计与成就进度',
    icon: Gamepad2,
    keywords: ['games', 'youxi', '游戏', '娱乐'],
    group: 'main',
  },
  {
    path: '/stats',
    label: '统计',
    description: '活动热力图、趋势与各模块进度',
    icon: BarChart3,
    keywords: ['stats', 'chart', 'tongji', '统计', '图表', '趋势'],
    group: 'main',
  },
  {
    path: '/habits',
    label: '习惯养成',
    description: '每日打卡、节奏追踪与强度分数',
    icon: Target,
    keywords: ['habits', 'habit', 'xiguan', '习惯', '打卡'],
    group: 'main',
  },
  {
    path: '/review',
    label: '复盘',
    description: '每日 / 每周回顾：数字自动汇总，判断留给自己写',
    icon: NotebookPen,
    keywords: ['review', 'retro', 'fupan', '复盘', '周报', '总结', '回顾'],
    group: 'main',
  },
  {
    path: '/goals',
    label: '目标',
    description: '给指标定个数字，达成率从记录里自动算',
    icon: Trophy,
    keywords: ['goals', 'goal', 'mubiao', '目标', '达成率', '打卡'],
    group: 'main',
  },
  {
    path: '/journal',
    label: '日记与心情',
    description: '一天一条：写几句，记一个心情档位',
    icon: BookHeart,
    keywords: ['journal', 'diary', 'riji', '日记', '心情', 'mood'],
    group: 'main',
  },
  {
    path: '/settings',
    label: '数据与设置',
    description: '备份导入导出、外观与危险操作',
    icon: Settings,
    keywords: ['settings', 'shezhi', '设置', '数据', '备份'],
    group: 'system',
  },
  {
    path: '/ui',
    label: '组件预览',
    description: '设计系统 Kitchen Sink，改动后用来核对样式',
    icon: LayoutGrid,
    keywords: ['ui', 'kitchen', 'sink', 'zujian', '组件'],
    group: 'system',
  },
];

/** 当前路由命中的导航项（仅用于标题等展示，不参与激活态判断） */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.path === pathname);
}

/** 侧栏激活态：精确匹配，根路径也要求精确，避免所有页面都点亮首页 */
export function isNavItemActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

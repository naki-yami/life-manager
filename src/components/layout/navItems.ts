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
  /** 点击后的落点。合并出的宿主指向默认子页（如 /study/books），侧栏一步到位 */
  path: string;
  /**
   * 模块前缀，只有宿主项才有（如 /study）。
   * 它圈住宿主下的全部子页，决定侧栏高亮与顶栏标题的归属；缺省时等于 path。
   * 值与 MODULE_TABS 的键是同一个前缀。
   */
  host?: string;
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
    path: '/study/books',
    host: '/study',
    label: '书房',
    description: '读书与写作：在读进度、书摘笔记与稿件字数',
    icon: BookOpen,
    keywords: ['study', 'shufang', '书房', '读书', 'reading', 'dushu'],
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

/**
 * 宿主下的子页。
 *
 * 它和 NAV_ITEMS 是两种东西：子页只在一个模块内跳转，不进侧栏、底部 Tab、命令面板与 `g+数字`。
 * 所以另起一份，而不是往 NavItem 上加字段 —— 否则那四处都得加「排除子页」的判断。
 * 签条渲染、顶栏标题、读屏播报都从这一份取，别再写第二份子页清单。
 */
export interface ModuleTab {
  path: string;
  label: string;
  icon: LucideIcon;
  /**
   * 命令面板的额外匹配词（英文名 / 拼音 / 别名）。
   *
   * 默认子页（落点与宿主同一个地址的那条）**不用写** —— 它的词挂在宿主上，落点一样。
   * 其余子页必须写自己的：不写的话，搜「写作 / writing」只能找到宿主，回车落在默认子页
   * 读书上，进不了写作页（规划 §6.2 实测到的回退）。
   */
  keywords?: string[];
}

/** 宿主路径 → 子页清单 */
export const MODULE_TABS: Record<string, ModuleTab[]> = {
  '/study': [
    { path: '/study/books', label: '读书', icon: BookOpen },
    {
      path: '/study/writing',
      label: '写作',
      icon: PenTool,
      keywords: ['writing', 'xiezuo', '写作', '稿件', '文章'],
    },
  ],
};

/** 当前路径命中的子页。让顶栏与读屏播报念「读书」，而不是笼统的「书房」。 */
export function findModuleTab(pathname: string): ModuleTab | undefined {
  for (const tabs of Object.values(MODULE_TABS)) {
    const hit = tabs.find((tab) => tab.path === pathname);
    if (hit) return hit;
  }
  return undefined;
}

/** 导航项圈定的路径范围：宿主覆盖它的全部子页，其余就是自己那一页 */
function navItemScope(item: NavItem): string {
  return item.host ?? item.path;
}

/**
 * 侧栏与底部 Tab 的激活态。
 *
 * 收的是导航项而不是路径字符串 —— 宿主项得按 `host` 匹配，否则停在
 * `/study/writing` 时「书房」会在侧栏里灭掉。
 */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  const scope = navItemScope(item);
  if (scope === '/') return pathname === '/';
  return pathname === scope || pathname.startsWith(`${scope}/`);
}

/**
 * 当前路由归属的导航项，供顶栏标题与读屏播报取名字。
 *
 * 按最长前缀取：宿主覆盖自己的全部子页（`/study/books` → 书房），所以嵌套路径
 * 不会再落空 —— 落空就是标题与播报一起静默降级成「Life Manager / 页面」。
 */
export function findNavItem(pathname: string): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of NAV_ITEMS) {
    if (!isNavItemActive(pathname, item)) continue;
    if (!best || navItemScope(item).length > navItemScope(best).length) best = item;
  }
  return best;
}

/**
 * 顶栏标题与读屏播报要念的名字：最深的子页优先（`/study/books` → 「读书」），
 * 退不到子页再退到导航项。子页清单只有 MODULE_TABS 一份，这里不重复写。
 */
export function findLocationLabel(pathname: string): string | undefined {
  return findModuleTab(pathname)?.label ?? findNavItem(pathname)?.label;
}

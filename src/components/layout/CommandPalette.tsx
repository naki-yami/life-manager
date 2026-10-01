import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CalendarCheck,
  Code2,
  CornerDownLeft,
  Dumbbell,
  Gamepad2,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Rows3,
  Rows4,
  Save,
  Search,
  StickyNote,
  Sun,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { Kbd } from '../ui';
import { useOptionalToast } from '../ui/toastContext';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { requestPaletteFocus } from '../../hooks/usePaletteFocus';
import { requestNewEntry } from '../../hooks/useShortcuts';
import { useThemeStore } from '../../store/themeStore';
import { useUiStore } from '../../store/uiStore';
import { buildCaptureCandidates, runCapture, type CaptureTarget } from '../../services/capture';
import { todayKey } from '../../utils/date';
import {
  matchEntitiesByTag,
  parseTagQuery,
  type EntityKind,
  type SearchableEntity,
} from '../../utils/entityIndex';
import { fuzzyFilter } from '../../utils/fuzzy';
import { parseCapture } from '../../utils/quickParse';
import { MODULE_TABS, NAV_ITEMS } from './navItems';
import { CommandPaletteContext, type CommandPaletteContextValue } from './commandPaletteContext';

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  /** 额外匹配词，用来支持英文名 / 拼音缩写 */
  keywords?: string[];
  group: string;
  run: () => void;
}

interface PaletteEntry {
  item: CommandItem;
  matched: number[];
}

/** 面板里的分组顺序；数组顺序就是渲染顺序（同组必须连续，标题靠相邻项变化插入） */
const GROUP = {
  capture: '建议',
  entity: '实体',
  action: '操作',
  nav: '跳转',
  appearance: '外观',
} as const;

const CAPTURE_ICON: Record<CaptureTarget, LucideIcon> = {
  task: CalendarCheck,
  memo: StickyNote,
  book: BookOpen,
  dev: Code2,
  writing: PenTool,
  fitness: Dumbbell,
  diet: UtensilsCrossed,
  game: Gamepad2,
};

const ENTITY_ICON: Record<EntityKind, LucideIcon> = {
  task: CalendarCheck,
  memo: StickyNote,
  book: BookOpen,
  dev: Code2,
  writing: PenTool,
  game: Gamepad2,
  workout: Dumbbell,
  meal: UtensilsCrossed,
};

interface QuickAction {
  id: string;
  path: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  keywords: string[];
}

/** 「操作」组：跳过去并直接打开那一页的新建弹窗（页面用 n 键的同一个入口） */
const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'action:task',
    path: '/tasks',
    label: '新建任务',
    hint: '打开今日计划的新建弹窗',
    icon: CalendarCheck,
    keywords: ['new', 'task', 'renwu', 'xinjian'],
  },
  {
    id: 'action:fitness',
    path: '/health/fitness',
    label: '记录训练',
    hint: '打开健身页的训练记录弹窗',
    icon: Dumbbell,
    keywords: ['new', 'workout', 'xunlian', 'jianshen'],
  },
  {
    id: 'action:diet',
    path: '/health/diet',
    label: '记录一餐',
    hint: '打开饮食页的记餐弹窗',
    icon: UtensilsCrossed,
    keywords: ['new', 'meal', 'jican', 'chifan', 'yinshi'],
  },
  {
    id: 'action:book',
    path: '/study/books',
    label: '添加书目',
    hint: '打开读书页的新增书籍弹窗',
    icon: BookOpen,
    keywords: ['new', 'book', 'tianjia', 'dushu'],
  },
  {
    id: 'action:writing',
    path: '/study/writing',
    label: '新建写作项目',
    hint: '打开写作页的新建弹窗',
    icon: PenTool,
    keywords: ['new', 'writing', 'xiezuo'],
  },
  {
    id: 'action:dev',
    path: '/dev',
    label: '新建开发项目',
    hint: '打开开发页的新建弹窗',
    icon: Code2,
    keywords: ['new', 'project', 'kaifa'],
  },
  {
    id: 'action:game',
    path: '/games',
    label: '添加游戏',
    hint: '打开游戏页的新增弹窗',
    icon: Gamepad2,
    keywords: ['new', 'game', 'youxi'],
  },
];

/** 比较实体标题时忽略书名号与空白，让「置身事内」也能命中《置身事内》 */
const normalizeTitle = (text: string): string => text.replace(/[《》\s]/g, '').toLowerCase();

/** 输入是否正好是某条命令的名字或别名（「密度」「读书」「light」这种） */
const matchesCommandExactly = (query: string, item: CommandItem): boolean => {
  const key = normalizeTitle(query);
  if (key === '') return false;
  if (normalizeTitle(item.label) === key) return true;
  return (item.keywords ?? []).some((keyword) => normalizeTitle(keyword) === key);
};

/** 实体行的说明文字：模块 · 副标题 · #标签 */
function entityHint(entity: SearchableEntity): string {
  const base = entity.subtitle ? `${entity.kindLabel} · ${entity.subtitle}` : entity.kindLabel;
  if (entity.tags.length === 0) return base;
  return `${base} · ${entity.tags.map((tag) => `#${tag}`).join(' ')}`;
}

/** 把一条实体转成面板里的一行；`open` 由调用方注入跳转逻辑 */
function toEntityEntry(entity: SearchableEntity, open: (path: string) => void): PaletteEntry {
  return {
    item: {
      id: entity.id,
      label: entity.title,
      hint: entityHint(entity),
      icon: ENTITY_ICON[entity.kind],
      group: GROUP.entity,
      run: () => {
        if (entity.focusable) requestPaletteFocus(entity.path, entity.entityId);
        open(entity.path);
      },
    },
    matched: [],
  };
}

const CommandPaletteInner: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const trap = useFocusTrap(panelRef, { onClose });

  const navigate = useNavigate();
  const toastContext = useOptionalToast();
  const themeMode = useThemeStore((state) => state.themeMode);
  const setThemeMode = useThemeStore((state) => state.setThemeMode);
  const density = useUiStore((state) => state.density);
  const setDensity = useUiStore((state) => state.setDensity);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const entities = useEntityIndex();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const trimmedQuery = query.trim();
  const today = todayKey();

  const handleBackup = useCallback(async (): Promise<void> => {
    try {
      // 备份模块按需加载，不进首屏包
      const { createAutoSnapshot } = await import('../../services/backup');
      const key = await createAutoSnapshot('命令面板备份');
      toastContext?.toast({
        tone: 'success',
        title: key ? '已留一份快照' : '快照空间已满',
        description: key
          ? '可在「数据与设置」里回滚到这一版。'
          : '本次没有新建快照，数据本身已写入本地。',
      });
    } catch {
      toastContext?.toast({
        tone: 'danger',
        title: '备份失败',
        description: '快照没有创建成功，数据本身不受影响，可以稍后再试。',
      });
    }
  }, [toastContext]);

  /** 跳转 / 外观 / 备份这类与输入无关的命令 */
  const baseItems = useMemo<CommandItem[]>(() => {
    const actions: CommandItem[] = QUICK_ACTIONS.map((action) => ({
      id: action.id,
      label: action.label,
      hint: action.hint,
      icon: action.icon,
      keywords: action.keywords,
      group: GROUP.action,
      run: () => {
        navigate(action.path);
        // 目标页是懒加载的，可能还没挂载；requestNewEntry 会留下意图等它认领
        requestNewEntry();
      },
    }));
    actions.push({
      id: 'action:backup',
      label: '立即备份',
      hint: '把所有数据写成一份可回滚的快照',
      icon: Save,
      keywords: ['backup', 'beifen', 'save', 'baocun', 'snapshot'],
      group: GROUP.action,
      run: () => {
        void handleBackup();
      },
    });

    /**
     * 导航项 + 宿主里的其余子页。
     *
     * 子页要单列，否则搜「写作」只能找到「书房」，回车落在默认子页读书上 —— 合并前
     * 「写作」本来就是一条导航项，回车直接进写作页，这是一次实打实的能力回退（规划 §6.2）。
     * 落点和宿主同一个地址的那条（默认子页）不再重复列，免得一个模块出现两条同义项；
     * 子页紧跟在宿主后面，默认列表（空查询）里也就挨着，不用翻到最底下。
     */
    const navigation: CommandItem[] = NAV_ITEMS.flatMap<CommandItem>((item) => {
      const host: CommandItem = {
        id: `nav:${item.path}`,
        label: item.label,
        hint: item.description,
        icon: item.icon,
        keywords: item.keywords,
        group: GROUP.nav,
        run: () => navigate(item.path),
      };

      const tabs: CommandItem[] = (item.host ? (MODULE_TABS[item.host] ?? []) : [])
        .filter((tab) => tab.path !== item.path)
        .map((tab) => ({
          id: `tab:${tab.path}`,
          // label 直接用子页自己的名字，不加「书房 ·」前缀：输入正好等于命令名时才会命中
          // 「就是它」那条规则，回车直接执行，不用先按方向键 —— 和合并前的体感一致。
          // 归属放在 hint 里，列表上一样看得见。
          label: tab.label,
          hint: `${item.label} · ${tab.label}`,
          icon: tab.icon,
          keywords: [...(tab.keywords ?? []), tab.path],
          group: GROUP.nav,
          run: () => navigate(tab.path),
        }));

      return [host, ...tabs];
    });

    const themes = (
      [
        { mode: 'light', label: '亮色主题', icon: Sun },
        { mode: 'dark', label: '暗色主题', icon: Moon },
        { mode: 'system', label: '跟随系统', icon: Monitor },
      ] as const
    ).map<CommandItem>(({ mode, label, icon }) => ({
      id: `theme:${mode}`,
      label: `切换到${label}`,
      hint: themeMode === mode ? '当前使用中' : undefined,
      icon,
      keywords: ['theme', 'zhuti', '主题', mode],
      group: GROUP.appearance,
      run: () => setThemeMode(mode),
    }));

    return [
      ...actions,
      ...navigation,
      ...themes,
      {
        id: 'density:toggle',
        label: density === 'compact' ? '切换到宽松密度' : '切换到紧凑密度',
        hint: '改变页面留白与列表行高',
        icon: density === 'compact' ? Rows3 : Rows4,
        keywords: ['density', 'miju', '密度', '间距'],
        group: GROUP.appearance,
        run: () => setDensity(density === 'compact' ? 'comfortable' : 'compact'),
      },
      {
        id: 'sidebar:toggle',
        label: sidebarCollapsed ? '展开侧栏' : '收起侧栏',
        icon: sidebarCollapsed ? PanelLeftOpen : PanelLeftClose,
        keywords: ['sidebar', 'cebian', '侧栏'],
        group: GROUP.appearance,
        run: toggleSidebar,
      },
    ];
  }, [
    navigate,
    handleBackup,
    setThemeMode,
    themeMode,
    density,
    setDensity,
    sidebarCollapsed,
    toggleSidebar,
  ]);

  /** 「建议」组：把这句话变成一条记录（外加一个兜底选项） */
  const captureItems = useMemo<CommandItem[]>(() => {
    if (!trimmedQuery) return [];
    const parsed = parseCapture(trimmedQuery, today);
    return buildCaptureCandidates(parsed).map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      hint: candidate.hint,
      icon: CAPTURE_ICON[candidate.target],
      group: GROUP.capture,
      run: () => {
        const result = runCapture(candidate.target, parsed, today);
        toastContext?.toast({
          tone: result.tone,
          title: result.title,
          description: result.description,
          action: result.undo ? { label: '撤销', onClick: result.undo } : undefined,
        });
      },
    }));
  }, [trimmedQuery, today, toastContext]);

  /** 「实体」组：跨模块搜索已经存在的记录 */
  const { entityEntries, hasExactEntity } = useMemo<{
    entityEntries: PaletteEntry[];
    hasExactEntity: boolean;
  }>(() => {
    if (!trimmedQuery) return { entityEntries: [], hasExactEntity: false };

    // `#标签` 是明确的「按标签找」意图：不做模糊匹配，直接列出带这个标签的记录
    const tagQuery = parseTagQuery(trimmedQuery);
    if (tagQuery !== null) {
      return {
        hasExactEntity: false,
        entityEntries: matchEntitiesByTag(entities, tagQuery)
          .slice(0, 12)
          .map((entity) => toEntityEntry(entity, navigate)),
      };
    }

    const matches = fuzzyFilter(trimmedQuery, entities, {
      getText: (entity) => entity.title,
      // 标签也参与匹配：搜「健身」时，打了 #健身 标签的任务 / 书 / 项目都会命中
      getKeywords: (entity) => [
        entity.subtitle,
        entity.kindLabel,
        ...entity.tags,
        ...entity.keywords,
      ],
      limit: 8,
    });

    // 输入和某条记录标题完全一样时把它顶到最前：这时用户多半是在找那条记录，
    // 而不是想再建一条同名的任务
    const key = normalizeTitle(trimmedQuery);
    const exact = entities.find((entity) => normalizeTitle(entity.title) === key);
    const ordered: SearchableEntity[] = exact
      ? [exact, ...matches.map((match) => match.item).filter((entity) => entity.id !== exact.id)]
      : matches.map((match) => match.item);

    return {
      hasExactEntity: exact !== undefined,
      entityEntries: ordered.slice(0, 10).map((entity) => toEntityEntry(entity, navigate)),
    };
  }, [trimmedQuery, entities, navigate]);

  const entries = useMemo<PaletteEntry[]>(() => {
    if (!trimmedQuery) return baseItems.map((item) => ({ item, matched: [] }));

    const captures: PaletteEntry[] = captureItems.map((item) => ({ item, matched: [] }));
    const matchedBase = fuzzyFilter(trimmedQuery, baseItems, {
      getText: (item) => item.label,
      getKeywords: (item) => item.keywords ?? [],
      limit: 30,
    });

    // 三种优先级，越靠前越确定用户在干什么：
    // 1. 输入就是某条命令的名字 —— 用户在找命令，回车照旧执行它
    // 2. 输入就是某条记录的名字 —— 用户在找那条记录，而不是想再建一条同名的
    // 3. 其他情况 —— 默认快速捕获，回车就把这句话落库
    if (matchedBase.some((entry) => matchesCommandExactly(trimmedQuery, entry.item))) {
      return [...matchedBase, ...entityEntries, ...captures];
    }
    if (hasExactEntity) return [...entityEntries, ...captures, ...matchedBase];
    return [...captures, ...entityEntries, ...matchedBase];
  }, [trimmedQuery, baseItems, captureItems, entityEntries, hasExactEntity]);

  // 查询变化后回到第一项，避免停留在已被过滤掉的位置
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 键盘移动时把选中项滚进可视区
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  const runAt = useCallback(
    (index: number) => {
      const entry = entries[index];
      if (!entry) return;
      entry.item.run();
      onClose();
    },
    [entries, onClose],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const lastIndex = Math.max(entries.length - 1, 0);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, lastIndex));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runAt(activeIndex);
      return;
    }
    trap(event);
  };

  const activeId = entries[activeIndex] ? `${listId}-${entries[activeIndex].item.id}` : undefined;
  let lastGroup = '';

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]"
      onKeyDown={handleKeyDown}
    >
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in motion-reduce:animate-none"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        tabIndex={-1}
        className="relative z-10 flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line-subtle bg-elevated shadow-overlay outline-none animate-scale-in motion-reduce:animate-none"
      >
        <div className="flex items-center gap-2.5 border-b border-line-subtle px-4 py-3">
          <Search size={16} aria-hidden className="shrink-0 text-content-tertiary" />
          {/* 打开后焦点由 useFocusTrap 落到这个搜索框上，不需要 autoFocus */}
          <input
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-label="搜索功能与命令"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入一句话快速记录，或搜索任务、书、项目…（#标签 可筛选）"
            className="min-w-0 flex-1 bg-transparent text-sm text-content outline-none placeholder:text-content-tertiary"
          />
          <Kbd>Esc</Kbd>
        </div>

        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="命令列表"
          className="min-h-0 flex-1 overflow-y-auto p-2"
        >
          {entries.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-content-tertiary">没有匹配的结果</li>
          )}

          {entries.map((entry, index) => {
            const Icon = entry.item.icon;
            const active = index === activeIndex;
            // 与上一项不同组时插一条分组标题
            const showGroupHeader = entry.item.group !== lastGroup;
            lastGroup = entry.item.group;

            return (
              <React.Fragment key={entry.item.id}>
                {showGroupHeader && (
                  <li
                    aria-hidden
                    className="px-3 pb-1 pt-3 text-2xs font-medium uppercase tracking-wide text-content-tertiary"
                  >
                    {entry.item.group}
                  </li>
                )}
                {/* 键盘由上方输入框通过 aria-activedescendant 统一驱动，这里只处理鼠标 */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
                <li
                  id={`${listId}-${entry.item.id}`}
                  data-index={index}
                  role="option"
                  aria-selected={active}
                  onClick={() => runAt(index)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-fast ${
                    active ? 'bg-selected text-accent' : 'text-content-secondary hover:bg-hover'
                  }`}
                >
                  {Icon && <Icon size={16} aria-hidden className="shrink-0" />}
                  <span className="min-w-0 flex-1 truncate font-medium">{entry.item.label}</span>
                  {entry.item.hint && (
                    <span className="hidden shrink-0 truncate text-xs text-content-tertiary sm:block sm:max-w-[14rem]">
                      {entry.item.hint}
                    </span>
                  )}
                </li>
              </React.Fragment>
            );
          })}
        </ul>

        <div className="flex items-center justify-between gap-3 border-t border-line-subtle px-4 py-2 text-2xs text-content-tertiary">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            选择
            <Kbd>
              <CornerDownLeft size={11} aria-hidden />
            </Kbd>
            执行
          </span>
          <span>{entries.length} 项结果</span>
        </div>
      </div>
    </div>
  );
};

export const CommandPalette: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;
  return createPortal(<CommandPaletteInner onClose={onClose} />, document.body);
};

/**
 * 提供 ⌘K / Ctrl+K 命令面板。
 * 放在 Layout 外层，所有页面都能用同一份跳转、外观与快速捕获命令。
 */
export const CommandPaletteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((value) => !value), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!isShortcut) return;
      event.preventDefault();
      toggle();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette isOpen={isOpen} onClose={close} />
    </CommandPaletteContext.Provider>
  );
};

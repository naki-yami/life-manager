import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  CornerDownLeft,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Rows3,
  Rows4,
  Search,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { Kbd } from '../ui';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useThemeStore } from '../../store/themeStore';
import { useUiStore } from '../../store/uiStore';
import { fuzzyFilter } from '../../utils/fuzzy';
import { NAV_ITEMS } from './navItems';
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

const CommandPaletteInner: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const trap = useFocusTrap(panelRef, { onClose });

  const navigate = useNavigate();
  const themeMode = useThemeStore((state) => state.themeMode);
  const setThemeMode = useThemeStore((state) => state.setThemeMode);
  const density = useUiStore((state) => state.density);
  const setDensity = useUiStore((state) => state.setDensity);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  const items = useMemo<CommandItem[]>(() => {
    const navigation: CommandItem[] = NAV_ITEMS.map((item) => ({
      id: `nav:${item.path}`,
      label: item.label,
      hint: item.description,
      icon: item.icon,
      keywords: item.keywords,
      group: '跳转',
      run: () => navigate(item.path),
    }));

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
      group: '外观',
      run: () => setThemeMode(mode),
    }));

    return [
      ...navigation,
      ...themes,
      {
        id: 'density:toggle',
        label: density === 'compact' ? '切换到宽松密度' : '切换到紧凑密度',
        hint: '改变页面留白与列表行高',
        icon: density === 'compact' ? Rows3 : Rows4,
        keywords: ['density', 'miju', '密度', '间距'],
        group: '外观',
        run: () => setDensity(density === 'compact' ? 'comfortable' : 'compact'),
      },
      {
        id: 'sidebar:toggle',
        label: sidebarCollapsed ? '展开侧栏' : '收起侧栏',
        icon: sidebarCollapsed ? PanelLeftOpen : PanelLeftClose,
        keywords: ['sidebar', 'cebian', '侧栏'],
        group: '外观',
        run: toggleSidebar,
      },
    ];
  }, [navigate, setThemeMode, themeMode, density, setDensity, sidebarCollapsed, toggleSidebar]);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const entries = useMemo<PaletteEntry[]>(() => {
    if (!query.trim()) return items.map((item) => ({ item, matched: [] }));
    return fuzzyFilter(query, items, {
      getText: (item) => item.label,
      getKeywords: (item) => item.keywords ?? [],
      limit: 40,
    });
  }, [items, query]);

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
            placeholder="搜索功能、命令…"
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
 * 放在 Layout 外层，所有页面都能用同一份跳转与外观命令。
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

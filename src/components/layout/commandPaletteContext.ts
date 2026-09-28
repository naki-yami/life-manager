import { createContext, useContext } from 'react';

export interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/** 由 CommandPaletteProvider 提供；单独成文件是为了满足 Fast Refresh 的导出约束。 */
export const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export const useCommandPalette = (): CommandPaletteContextValue => {
  const context = useContext(CommandPaletteContext);
  if (!context) throw new Error('useCommandPalette 必须在 <CommandPaletteProvider> 内部使用');
  return context;
};

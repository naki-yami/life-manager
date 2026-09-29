/**
 * 徽章（Badge）各档位的配色类名。
 *
 * 单独放一个文件有两个原因：
 * - `react-refresh` 要求组件文件只导出组件，常量混在组件文件里会影响热更新粒度；
 * - 标签（TagChips / TagInput）也要用同一套配色，放在这里两边都能拿到，
 *   保证「同一个标签在任何页面都是同一个颜色」。
 */
export type BadgeTone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export const BADGE_TONES: Record<BadgeTone, string> = {
  default: 'bg-inset text-content-secondary',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

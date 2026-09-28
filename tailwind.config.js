/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 保留旧色阶，避免已有页面失效（P3 逐页迁移到语义令牌后可移除）
        primary: {
          50: '#f0f4ff',
          100: '#dbe4ff',
          200: '#bac8ff',
          300: '#91a7ff',
          400: '#748ffc',
          500: '#5c7cfa',
          600: '#4c6ef5',
          700: '#4263eb',
          800: '#3b5bdb',
          900: '#364fc7',
        },

        // ---- 语义令牌：全部指向 CSS 变量，亮暗由 .dark 覆盖 ----
        canvas: 'var(--lm-bg-canvas)',
        surface: 'var(--lm-bg-surface)',
        elevated: 'var(--lm-bg-elevated)',
        inset: 'var(--lm-bg-inset)',
        hover: 'var(--lm-bg-hover)',
        active: 'var(--lm-bg-active)',
        selected: 'var(--lm-bg-selected)',

        line: {
          subtle: 'var(--lm-line-subtle)',
          DEFAULT: 'var(--lm-line)',
          strong: 'var(--lm-line-strong)',
          focus: 'var(--lm-line-focus)',
        },

        content: {
          DEFAULT: 'var(--lm-content)',
          secondary: 'var(--lm-content-secondary)',
          tertiary: 'var(--lm-content-tertiary)',
          disabled: 'var(--lm-content-disabled)',
        },

        accent: {
          DEFAULT: 'var(--lm-accent)',
          strong: 'var(--lm-accent-strong)',
          soft: 'var(--lm-accent-soft)',
          contrast: 'var(--lm-accent-contrast)',
          ring: 'var(--lm-accent-ring)',
        },

        // 输入类控件的聚焦光晕（单独令牌，因为 v3 无法给 var() 颜色加透明度）
        focus: 'var(--lm-accent-ring)',

        success: { DEFAULT: 'var(--lm-success)', soft: 'var(--lm-success-soft)' },
        warning: { DEFAULT: 'var(--lm-warning)', soft: 'var(--lm-warning-soft)' },
        danger: {
          DEFAULT: 'var(--lm-danger)',
          soft: 'var(--lm-danger-soft)',
          contrast: 'var(--lm-danger-contrast)',
        },
        info: { DEFAULT: 'var(--lm-info)', soft: 'var(--lm-info-soft)' },
      },

      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        md: '10px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
      },

      boxShadow: {
        xs: 'var(--lm-shadow-xs)',
        sm: 'var(--lm-shadow-sm)',
        md: 'var(--lm-shadow-md)',
        lg: 'var(--lm-shadow-lg)',
        overlay: 'var(--lm-shadow-overlay)',
      },

      fontSize: {
        '2xs': ['11px', '16px'],
        // 语义用法：正文 text-sm(14) / 卡片标题 text-base(16) / 页面标题 text-2xl(24)
      },

      transitionTimingFunction: {
        standard: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },

      transitionDuration: {
        fast: '120ms',
        base: '180ms',
        slow: '260ms',
      },

      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },

      animation: {
        'fade-in': 'fade-in 180ms cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-up': 'slide-up 200ms cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-in-right': 'slide-in-right 200ms cubic-bezier(0.32, 0.72, 0, 1)',
        'scale-in': 'scale-in 180ms cubic-bezier(0.32, 0.72, 0, 1)',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

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

        // 图表分类色板：多序列时按顺序取色（bg-chart-3 / stroke-chart-3…）
        chart: {
          1: 'var(--lm-chart-1)',
          2: 'var(--lm-chart-2)',
          3: 'var(--lm-chart-3)',
          4: 'var(--lm-chart-4)',
          5: 'var(--lm-chart-5)',
          6: 'var(--lm-chart-6)',
          7: 'var(--lm-chart-7)',
          8: 'var(--lm-chart-8)',
        },

        // 活动热力图等级色（0 = 无活动）
        heat: {
          0: 'var(--lm-heat-0)',
          1: 'var(--lm-heat-1)',
          2: 'var(--lm-heat-2)',
          3: 'var(--lm-heat-3)',
          4: 'var(--lm-heat-4)',
        },
      },

      spacing: {
        // 密度驱动：由 tokens.css 里的 --lm-page-pad / --lm-section-gap 提供
        page: 'var(--lm-page-pad)',
        section: 'var(--lm-section-gap)',
      },

      maxWidth: {
        reading: '46rem',
      },

      borderRadius: {
        sm: '6px',
        DEFAULT: '9px', // 按钮（样稿 .btn 是 9px）
        md: '10px', // 瓦片 / 聚焦框 / 输入框
        lg: '13px', // 卡片 / 统计条（样稿 .card / .strip 是 13px）
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

      /*
       * 字号尺度按样稿（`.runtime/mock-home.html`）整条重排，不再是 Tailwind 默认的
       * 12 / 14 / 16 / 18 / 20。
       *
       * 样稿用的是一套自定的细粒度尺度：正文 13px、卡片标题 14px、说明 11.5px、
       * 统计数字 21px、页面大标题 28px。以前只对齐了 `:root` 的颜色变量，尺度还是
       * Tailwind 默认那一套 —— 于是「色板一样、看着就是不像」。
       *
       * 选择重映射而不是逐处写 `text-[13px]`：全站几十个页面共用这几个档位，
       * 改这一处就等于全站换肤，也不会留下「同一层级两种字号」的暗债。
       *
       * 行高一律用**相对值**（1.55），和样稿的 `body{13px/1.55}` 一个路子：
       * 写死 px 的话，21px 的数字就只拿到 27px 行高，而样稿那边继承的是 21×1.55=32.5，
       * 于是「字号都对上了、整块还是矮一截」。标题档位收窄到 1.15（样稿 h1 是 1.15）。
       */
      fontSize: {
        '3xs': ['10.5px', '1.55'], // 图例、角标
        '2xs': ['11px', '1.55'], // eyebrow、导航组标题
        '2sm': ['11.5px', '1.55'], // 卡片副标题、统计条标签
        xs: ['12px', '1.55'], // 辅助说明
        sm: ['13px', '1.55'], // 正文基准（样稿 body 13px / 1.55）
        base: ['14px', '1.55'], // 卡片标题
        lg: ['16px', '1.55'],
        xl: ['21px', '1.55'], // 统计条数字
        '2xl': ['28px', '1.15'], // 页面 h1
        '3xl': ['34px', '1.15'],
        '4xl': ['40px', '1.15'],
        '5xl': ['48px', '1'],
        '6xl': ['60px', '1'],
        '7xl': ['72px', '1'],
        '8xl': ['96px', '1'],
        '9xl': ['128px', '1'],
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
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
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
        'slide-in-left': 'slide-in-left 200ms cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-in-right': 'slide-in-right 200ms cubic-bezier(0.32, 0.72, 0, 1)',
        'scale-in': 'scale-in 180ms cubic-bezier(0.32, 0.72, 0, 1)',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

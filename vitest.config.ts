import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // 设计令牌测试要读 tokens.css 的原文（?raw），需要让 vitest 处理 CSS
    css: true,
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/services/**', 'src/store/**', 'src/utils/**'],
      exclude: ['src/**/*.test.ts', 'src/store/persist.ts'],
    },
  },
});

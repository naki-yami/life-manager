import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      /*
       * 不盯这两个目录：它们是本机工作目录（`.workbuddy` 是工作记忆，`.runtime` 是探针
       * 与截图），都不进仓库，却一直在写。编辑器落盘走的是「写临时文件 + 改名」，
       * Windows 上那一瞬间临时文件可能被锁住，chokidar 抛 EBUSY 会把整个 dev server
       * 带崩 —— 已经崩过一次：
       *   watch '...\.workbuddy\memory\.2026-10-01.md.<随机>.tmpdir\2026-10-01.md.tmp'
       *   → Error: EBUSY: resource busy or locked
       */
      ignored: ['**/.runtime/**', '**/.workbuddy/**'],
    },
  },
});

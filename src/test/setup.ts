import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { clearAppStorage } from '../utils/storageKeys';

// 每个用例都从干净的 localStorage 开始，互不干扰
beforeEach(() => {
  clearAppStorage();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

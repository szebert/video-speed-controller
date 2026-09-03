// SPDX-License-Identifier: GPL-3.0-only

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '#i18n': fileURLToPath(new URL('./src/tests/i18n-stub.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/tests/**/*.test.ts', 'src/tests/**/*.test.tsx'],
    globals: false,
    setupFiles: ['./src/tests/resize-observer-stub.ts'],
    css: true,
  },
});

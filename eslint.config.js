// SPDX-License-Identifier: GPL-3.0-only

import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import autoImports from './.wxt/eslint-auto-imports.mjs';

export default tseslint.config(
  {
    ignores: [
      '.output/**',
      '.wxt/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.agents/**',
      '.cursor/**',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    ...autoImports,
    languageOptions: {
      ...autoImports.languageOptions,
      globals: {
        ...autoImports.languageOptions.globals,
        ...globals.browser,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: [
      'e2e/**/*.{ts,mjs}',
      'scripts/**/*.mjs',
      'eslint.config.js',
      'playwright.config.ts',
      'vitest.config.ts',
      'wxt.config.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettier,
);

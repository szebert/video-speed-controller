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
  {
    files: ['src/entrypoints/content.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message: 'Content must not import regular Zod.',
              allowTypeImports: false,
            },
            {
              name: 'zod/mini',
              message: 'Import Zod Mini only through protocol/content.',
              allowTypeImports: false,
            },
          ],
          patterns: [
            {
              group: [
                '**/behavior-schema',
                '**/behavior-schema.*',
                '**/protocol/schemas',
                '**/protocol/schemas/**',
              ],
              message: 'Content may import protocol/content, not privileged schemas.',
              allowTypeImports: false,
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'src/settings/site-behavior.ts',
      'src/core/applied-tab-behavior.ts',
      'src/core/video-speed-engine.ts',
      'src/core/video-overlay.ts',
      'src/core/media-controller.ts',
      'src/core/media-registry.ts',
      'src/core/arbitration.ts',
      'src/core/speed.ts',
      'src/overlay/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message: 'Overlay and playback must stay Zod-free.',
              allowTypeImports: false,
            },
            {
              name: 'zod/mini',
              message: 'Overlay and playback must stay Zod-free.',
              allowTypeImports: false,
            },
          ],
          patterns: [
            {
              group: [
                '**/behavior-schema',
                '**/behavior-schema.*',
                '**/protocol/schemas',
                '**/protocol/schemas/**',
                '**/protocol/content',
                '**/protocol/content/**',
              ],
              message: 'Overlay and playback must not import protocol or Zod schemas.',
              allowTypeImports: false,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/protocol/content/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message: 'Content protocol may import zod/mini only.',
              allowTypeImports: false,
            },
          ],
          patterns: [
            {
              group: [
                '**/behavior-schema',
                '**/behavior-schema.*',
                '**/protocol/schemas',
                '**/protocol/schemas/**',
              ],
              message: 'Content protocol must not import privileged schemas.',
              allowTypeImports: false,
            },
          ],
        },
      ],
    },
  },
  prettier,
);

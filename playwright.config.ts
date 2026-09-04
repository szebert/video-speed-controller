// SPDX-License-Identifier: GPL-3.0-only
/// <reference types="node" />

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  timeout: 30_000,
  webServer: {
    command: 'pnpm exec -- node e2e/serve-fixtures.mjs',
    url: 'http://127.0.0.1:4173/multi-video.html',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'fixtures',
      testMatch: /fixtures\.spec\.ts/,
      use: { baseURL: 'http://127.0.0.1:4173' },
    },
    {
      name: 'extension',
      testMatch: /(?:popup|options)\.spec\.ts/,
      use: {
        baseURL: 'http://127.0.0.1:4173',
        channel: 'chromium',
      },
    },
  ],
});

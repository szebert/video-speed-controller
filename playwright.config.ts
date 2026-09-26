// SPDX-License-Identifier: GPL-3.0-only
/// <reference types="node" />

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  // Per-test timeout does not bound a wedged run. CI gets a suite ceiling so
  // Playwright can exit and print its report before the job timeout.
  globalTimeout: process.env.CI ? 10 * 60_000 : undefined,
  timeout: 30_000,
  webServer: {
    command: 'node e2e/serve-fixtures.mjs',
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
      testMatch: /(?:popup|options|overlay-stacking|rewind|seek)\.spec\.ts/,
      use: {
        baseURL: 'http://127.0.0.1:4173',
        channel: 'chromium',
      },
    },
  ],
});

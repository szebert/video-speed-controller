// SPDX-License-Identifier: GPL-3.0-only

import { defineConfig } from 'wxt';

const e2eBuild = process.env.OSVSC_E2E === '1';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  modules: ['@wxt-dev/module-react'],
  imports: {
    eslintrc: {
      enabled: 9,
    },
  },
  manifest: {
    name: 'Open Source Video Speed Controller',
    short_name: 'OS VSC',
    description:
      'Control HTML5 video playback speed from the Chrome toolbar. Open source. No accounts, analytics, or servers.',
    minimum_chrome_version: '119',
    permissions: ['storage', 'activeTab', 'scripting'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    ...(e2eBuild ? { host_permissions: ['http://127.0.0.1:4173/*'] } : {}),
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    action: {
      default_title: 'OS Video Speed Controller',
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
      },
    },
  },
  zip: {
    artifactTemplate: 'opensource-video-speed-controller-{{version}}-{{browser}}.zip',
    excludeSources: ['.agents/**', '.cursor/**', 'e2e/**', 'skills-lock.json'],
  },
});

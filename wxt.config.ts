// SPDX-License-Identifier: GPL-3.0-only

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

const e2eBuild = process.env.OSVSC_E2E === '1';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  modules: ['@wxt-dev/module-react', '@wxt-dev/i18n/module'],
  imports: {
    eslintrc: {
      enabled: 9,
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    default_locale: 'en',
    name: '__MSG_extName__',
    short_name: '__MSG_extShortName__',
    description: '__MSG_extDescription__',
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
      default_title: '__MSG_actionTitle__',
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

// SPDX-License-Identifier: GPL-3.0-only

import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'wxt';

const e2eBuild = process.env.OSVSC_E2E === '1';
const analyzeBundle = process.env.OSVSC_ANALYZE === '1';

function packageFromModuleId(id: string): string {
  const marker = 'node_modules/';
  const index = id.lastIndexOf(marker);
  if (index === -1) {
    return '(app)';
  }
  const rest = id.slice(index + marker.length);
  if (rest.startsWith('@')) {
    const [scope, name] = rest.split('/');
    return name ? `${scope}/${name}` : rest;
  }
  return rest.split('/')[0] ?? '(app)';
}

function analyzeBundlePlugin(): Plugin {
  return {
    name: 'osvsc-bundle-report',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle)
        .filter((output) => output.type === 'chunk')
        .map((output) => {
          const packages = new Map<string, number>();
          for (const [id, module] of Object.entries(output.modules)) {
            const name = packageFromModuleId(id);
            packages.set(name, (packages.get(name) ?? 0) + (module.renderedLength ?? 0));
          }
          return {
            fileName: output.fileName,
            bytes: output.code.length,
            packages: [...packages.entries()]
              .map(([name, bytes]) => ({ name, bytes }))
              .sort((left, right) => right.bytes - left.bytes)
              .slice(0, 15),
          };
        })
        .sort((left, right) => right.bytes - left.bytes);
      console.log('\nBundle composition (OSVSC_ANALYZE=1)\n');
      for (const chunk of chunks) {
        console.log(`${chunk.fileName}  ${(chunk.bytes / 1024).toFixed(2)} kB`);
        for (const pkg of chunk.packages) {
          console.log(`  ${(pkg.bytes / 1024).toFixed(2).padStart(8)} kB  ${pkg.name}`);
        }
        console.log('');
      }
    },
  };
}

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
    plugins: [tailwindcss(), ...(analyzeBundle ? [analyzeBundlePlugin()] : [])],
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

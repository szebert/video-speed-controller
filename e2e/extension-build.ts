// SPDX-License-Identifier: GPL-3.0-only

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const extensionPath = resolve(root, '.output/chrome-mv3');

export type ExtensionManifest = {
  host_permissions?: string[];
  options_ui?: { page?: string; open_in_tab?: boolean };
};

export function isE2eExtensionManifest(manifest: ExtensionManifest): boolean {
  return (
    Boolean(manifest.host_permissions?.includes('http://127.0.0.1:4173/*')) &&
    manifest.options_ui?.page === 'options.html' &&
    manifest.options_ui.open_in_tab === true
  );
}

export function isE2eExtensionBuild(): boolean {
  const manifestPath = resolve(extensionPath, 'manifest.json');
  if (!existsSync(manifestPath) || !existsSync(resolve(extensionPath, 'options.html'))) {
    return false;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ExtensionManifest;
  return isE2eExtensionManifest(manifest);
}

export function buildE2eExtension(): void {
  if (isE2eExtensionBuild()) {
    return;
  }
  execSync('pnpm build', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, OSVSC_E2E: '1' },
  });
  if (!isE2eExtensionBuild()) {
    throw new Error('OSVSC_E2E=1 pnpm build did not produce the E2E extension artifact');
  }
}

export function assertE2eExtensionBuild(): void {
  if (!isE2eExtensionBuild()) {
    throw new Error(
      'E2E extension artifact is missing or is not the OSVSC_E2E build. Playwright global setup should produce it once.',
    );
  }
}

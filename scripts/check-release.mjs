#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const failures = [];

const fail = (message) => {
  failures.push(message);
};

if (pkg.license !== 'GPL-3.0-only') {
  fail(`package.json license must be GPL-3.0-only, found ${pkg.license}`);
}
if (!existsSync(join(root, 'LICENSE'))) {
  fail('root LICENSE is missing');
} else {
  const license = readFileSync(join(root, 'LICENSE'), 'utf8');
  if (!license.includes('GNU GENERAL PUBLIC LICENSE') || !license.includes('Version 3')) {
    fail('LICENSE must contain unmodified GNU GPL version 3 text');
  }
}
if (!existsSync(join(root, 'pnpm-lock.yaml'))) {
  fail('pnpm-lock.yaml must exist');
}
for (const forbidden of ['package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb']) {
  if (existsSync(join(root, forbidden))) {
    fail(`${forbidden} must not exist`);
  }
}
if (pkg.private !== true) {
  fail('package.json must be private');
}
if (pkg.packageManager !== 'pnpm@11.24.0') {
  fail(`packageManager must be pnpm@11.24.0, found ${pkg.packageManager}`);
}

const tag =
  process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : process.env.RELEASE_TAG;
if (tag) {
  const expected = `v${pkg.version}`;
  if (tag !== expected && tag !== pkg.version) {
    fail(`git tag ${tag} does not match package.json version ${pkg.version}`);
  }
  if (process.env.GITHUB_SHA) {
    const tagged = execSync(`git rev-list -n 1 ${tag}`, { cwd: root, encoding: 'utf8' }).trim();
    if (tagged !== process.env.GITHUB_SHA) {
      fail(`release commit ${process.env.GITHUB_SHA} is not tagged commit ${tagged}`);
    }
  }
}

const zipName = `opensource-video-speed-controller-${pkg.version}-chrome.zip`;
const zipCandidates = [join(root, '.output', zipName), join(root, zipName)];
const foundZip = zipCandidates.find((path) => existsSync(path));
if (process.env.REQUIRE_ZIP === '1') {
  if (!foundZip) {
    fail(`missing ${zipName}`);
  } else if (!foundZip.endsWith(zipName)) {
    fail(`ZIP name must be ${zipName}`);
  }
}

if (existsSync(join(root, '.output', 'chrome-mv3', 'manifest.json'))) {
  const manifest = JSON.parse(
    readFileSync(join(root, '.output', 'chrome-mv3', 'manifest.json'), 'utf8'),
  );
  if (manifest.minimum_chrome_version !== '119') {
    fail('minimum_chrome_version must be 119');
  }
  const permissions = manifest.permissions ?? [];
  if (permissions.includes('tabs')) {
    fail('manifest must not request the tabs permission');
  }
  if (manifest.host_permissions?.length) {
    fail('manifest must not include host_permissions');
  }
  if (manifest.content_scripts?.length) {
    fail('manifest must not include static content_scripts');
  }
  if (manifest.options_ui || manifest.options_page) {
    fail('manifest must not include an options page');
  }
  if (manifest.commands) {
    fail('manifest must not include commands');
  }
}

if (existsSync(join(root, '.output', 'chrome-mv3'))) {
  const outputFiles = readdirSync(join(root, '.output', 'chrome-mv3'), { recursive: true }).map(
    String,
  );
  if (outputFiles.some((file) => file.includes('.cursor') || file.includes('.agents'))) {
    fail('development tooling must not be bundled into the Chrome artifact');
  }
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log('Release checks passed');

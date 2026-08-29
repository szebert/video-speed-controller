#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pnpmDir = join(root, 'node_modules/.pnpm');
const seen = new Map();

function addPackage(pkg) {
  if (!pkg?.name || pkg.name === 'video-speed-controller') {
    return;
  }
  const license = Array.isArray(pkg.license) ? pkg.license.join(', ') : pkg.license;
  if (!license) {
    return;
  }
  const key = `${pkg.name}@${pkg.version ?? 'unknown'}`;
  if (!seen.has(key)) {
    seen.set(key, license);
  }
}

function readPackageJson(file) {
  try {
    addPackage(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    // ignore unreadable package metadata
  }
}

if (existsSync(pnpmDir)) {
  for (const entry of readdirSync(pnpmDir)) {
    const nested = join(pnpmDir, entry, 'node_modules');
    if (!existsSync(nested)) {
      continue;
    }
    const walk = (dir) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, name.name);
        if (name.name === 'package.json' && name.isFile()) {
          readPackageJson(full);
        } else if (name.isDirectory() && name.name !== 'node_modules') {
          walk(full);
        } else if (name.isDirectory() && name.name === 'node_modules') {
          walk(full);
        }
      }
    };
    walk(nested);
  }
}

const lines = [
  'THIRD-PARTY NOTICES',
  '',
  'This file lists third-party package dependencies used to build',
  'Open Source Video Speed Controller. Project code is licensed under GPL-3.0-only.',
  '',
  ...[...seen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, license]) => `- ${name}: ${license}`),
  '',
];

const text = lines.join('\n');
writeFileSync(join(root, 'THIRD_PARTY_NOTICES'), text);
writeFileSync(join(root, 'src/public/THIRD_PARTY_NOTICES'), text);
console.log(`Wrote THIRD_PARTY_NOTICES (${seen.size} entries)`);

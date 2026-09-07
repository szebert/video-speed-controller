#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only

import { createRequire } from 'node:module';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projectName = 'video-speed-controller';

const ENTRYPOINTS = [
  'src/entrypoints/background.ts',
  'src/entrypoints/content.ts',
  'src/entrypoints/options/main.tsx',
  'src/entrypoints/popup/main.tsx',
];

const WXT_RUNTIME = [
  { used: /\bdefineBackground\b/, specifier: 'wxt/utils/define-background' },
  { used: /\bdefineContentScript\b/, specifier: 'wxt/utils/define-content-script' },
];

const LOCAL_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];
const WALK_EXTENSIONS = new Set([...LOCAL_EXTENSIONS, '.jsx']);
const SKIP_EXTENSIONS = new Set([
  '.css',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.woff',
  '.woff2',
  '.map',
  '.d.ts',
]);

function licenseOf(pkg) {
  if (Array.isArray(pkg.license)) {
    return pkg.license.join(', ');
  }
  if (pkg.license && typeof pkg.license === 'object') {
    return pkg.license.type ?? '';
  }
  return typeof pkg.license === 'string' ? pkg.license : '';
}

function packageInfo(file) {
  let dir = dirname(file);
  while (true) {
    const pkgFile = join(dir, 'package.json');
    if (existsSync(pkgFile)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
        if (pkg.name) {
          return pkg;
        }
      } catch {
        // ignore unreadable package metadata
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

function isTypeOnlyStatement(statement) {
  return /^\s*(?:import|export)\s+type\b/.test(statement);
}

function moduleSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /(?:^|\n)[ \t]*import(?:\s+type)?(?:\s+[\s\S]*?\s+from\s+|\s+)['"]([^'"]+)['"]/g,
    /(?:^|\n)[ \t]*export(?:\s+type)?\s+(?:\*(?:\s+as\s+\w+)?\s+from\s+|\{[\s\S]*?\}\s+from\s+)['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] && !isTypeOnlyStatement(match[0] ?? '')) {
        specifiers.push(match[1]);
      }
    }
  }
  return specifiers;
}

function isBuiltinSpecifier(specifier) {
  return (
    specifier.startsWith('node:') ||
    specifier.startsWith('data:') ||
    specifier.startsWith('http:') ||
    specifier.startsWith('https:') ||
    specifier === 'chrome' ||
    specifier === 'browser'
  );
}

function resolveLocal(fromFile, specifier) {
  const bare = specifier.split('?')[0] ?? specifier;
  if (bare === '#i18n' || bare.startsWith('#i18n/')) {
    return join(root, '.wxt/i18n/index.ts');
  }
  let base;
  if (bare.startsWith('@/')) {
    base = join(root, 'src', bare.slice(2));
  } else if (bare.startsWith('.')) {
    base = join(dirname(fromFile), bare);
  } else {
    return undefined;
  }
  const candidates = [
    base,
    ...LOCAL_EXTENSIONS.map((ext) => `${base}${ext}`),
    ...LOCAL_EXTENSIONS.map((ext) => join(base, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return realpathSync(candidate);
    }
  }
  return undefined;
}

function resolveBare(fromFile, specifier) {
  return realpathSync(createRequire(fromFile).resolve(specifier));
}

function isLocalSpecifier(specifier) {
  return (
    specifier.startsWith('.') ||
    specifier.startsWith('@/') ||
    specifier === '#i18n' ||
    specifier.startsWith('#i18n/')
  );
}

function isNodeModulesFile(file) {
  return file.includes(`${sep}node_modules${sep}`);
}

function shouldWalk(file) {
  const ext = extname(file);
  if (file.endsWith('.d.ts') || file.includes('.development.') || SKIP_EXTENSIONS.has(ext)) {
    return false;
  }
  return WALK_EXTENSIONS.has(ext);
}

function collectShippedPackages() {
  const seenFiles = new Set();
  const packages = new Map();
  const queue = ENTRYPOINTS.map((relative) => realpathSync(join(root, relative)));

  const enqueue = (file) => {
    if (!seenFiles.has(file)) {
      queue.push(file);
    }
  };

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seenFiles.has(file)) {
      continue;
    }
    seenFiles.add(file);

    const pkg = packageInfo(file);
    if (pkg && pkg.name !== projectName) {
      const license = licenseOf(pkg);
      if (license) {
        packages.set(`${pkg.name}@${pkg.version ?? 'unknown'}`, license);
      }
    }

    if (!shouldWalk(file)) {
      continue;
    }

    const source = readFileSync(file, 'utf8');
    for (const specifier of moduleSpecifiers(source)) {
      const bare = specifier.split('?')[0] ?? specifier;
      if (isBuiltinSpecifier(bare) || bare.startsWith('#imports')) {
        continue;
      }
      if (isLocalSpecifier(bare)) {
        const local = resolveLocal(file, specifier);
        if (local) {
          enqueue(local);
        } else if (!isNodeModulesFile(file)) {
          throw new Error(`Unresolvable local import ${specifier} from ${file}`);
        }
        continue;
      }
      enqueue(resolveBare(file, bare));
    }

    if (pkg?.name === projectName) {
      for (const runtime of WXT_RUNTIME) {
        if (runtime.used.test(source)) {
          enqueue(resolveBare(file, runtime.specifier));
        }
      }
    }
  }

  return packages;
}

export function renderThirdPartyNotices() {
  const lines = [
    'THIRD-PARTY NOTICES',
    '',
    'This file lists third-party packages whose code is distributed in the',
    'Open Source Video Speed Controller extension. Project code is licensed',
    'under GPL-3.0-only.',
    '',
    ...[...collectShippedPackages().entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, license]) => `- ${name}: ${license}`),
    '',
  ];
  return lines.join('\n');
}

export function writeThirdPartyNotices() {
  const text = renderThirdPartyNotices();
  const targets = [join(root, 'THIRD_PARTY_NOTICES'), join(root, 'src/public/THIRD_PARTY_NOTICES')];
  for (const target of targets) {
    writeFileSync(target, text);
  }
  const count = (text.match(/^- /gm) ?? []).length;
  console.log(`Wrote THIRD_PARTY_NOTICES (${count} entries)`);
  return text;
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedAsScript) {
  if (process.argv.includes('--print')) {
    process.stdout.write(renderThirdPartyNotices());
  } else {
    writeThirdPartyNotices();
  }
}

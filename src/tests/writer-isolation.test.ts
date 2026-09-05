// SPDX-License-Identifier: GPL-3.0-only

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

const UI_ENTRIES = [
  join(SRC, 'entrypoints/popup/main.tsx'),
  join(SRC, 'entrypoints/options/main.tsx'),
  join(SRC, 'entrypoints/content.ts'),
  join(SRC, 'components/theme-provider.tsx'),
];

const FORBIDDEN_PERSIST = new Set([
  'persistTheme',
  'persistSiteBehaviorChanges',
  'persistSiteBehaviorChange',
  'persistSiteSpeed',
  'persistSiteSpeedInherit',
  'deleteSiteSettings',
  'deleteAllSiteSettings',
  'persistGlobalBehaviorOverrides',
  'persistGlobalBehaviorChanges',
  'persistGlobalBehaviorChange',
  'resetGlobalBehaviorOverrides',
]);

const STORAGE_MUTATOR =
  /chrome\.storage\.(local|sync)\.(set|remove|clear)\b|\.storage\.(local|sync)\.(set|remove|clear)\b/;

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function srcPath(file: string): string {
  return toPosix(relative(SRC, file));
}

function moduleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import(?:\s+type)?(?:\s+[\s\S]*?\s+from\s+|\s+)['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export(?:\s+type)?\s+(?:\*(?:\s+as\s+\w+)?\s+from\s+|\{[\s\S]*?\}\s+from\s+)['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) {
        specifiers.push(match[1]);
      }
    }
  }
  return specifiers;
}

function namedImports(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(
    /(?:^|\n)\s*import(?:\s+type)?\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]/g,
  )) {
    for (const part of match[1]?.split(',') ?? []) {
      const name = part
        .trim()
        .split(/\s+as\s+/)[0]
        ?.trim();
      if (name) {
        names.push(name);
      }
    }
  }
  return names;
}

function resolveImportedFile(fromFile: string, specifier: string): string | 'external' | 'asset' {
  const bare = specifier.split('?')[0] ?? specifier;
  if (/\.(css|json|svg|png)$/.test(bare)) {
    return 'asset';
  }
  if (!bare.startsWith('.') && !bare.startsWith('@/')) {
    return 'external';
  }
  const base = bare.startsWith('@/') ? join(SRC, bare.slice(2)) : join(dirname(fromFile), bare);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  throw new Error(`Unresolvable import ${specifier} from ${srcPath(fromFile)}`);
}

function walkFrom(entry: string): Map<string, string> {
  const sources = new Map<string, string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || sources.has(file)) {
      continue;
    }
    const source = readFileSync(file, 'utf8');
    sources.set(file, source);
    for (const specifier of moduleSpecifiers(source)) {
      const resolved = resolveImportedFile(file, specifier);
      if (resolved !== 'external' && resolved !== 'asset') {
        queue.push(resolved);
      }
    }
  }
  return sources;
}

describe('durable writer isolation', () => {
  it('keeps persist APIs and local/sync mutators out of popup, options, content, and components', () => {
    const persistViolations: string[] = [];
    const mutatorViolations: string[] = [];
    const scanned = new Set<string>();
    for (const entry of UI_ENTRIES) {
      for (const [file, source] of walkFrom(entry)) {
        if (scanned.has(file)) {
          continue;
        }
        scanned.add(file);
        const path = srcPath(file);
        if (path.startsWith('background/') || path.startsWith('storage/')) {
          continue;
        }
        for (const name of namedImports(source)) {
          if (FORBIDDEN_PERSIST.has(name)) {
            persistViolations.push(`${path} imports ${name}`);
          }
        }
        if (STORAGE_MUTATOR.test(source)) {
          mutatorViolations.push(`${path} mutates chrome.storage.local/sync`);
        }
      }
    }
    expect(persistViolations).toEqual([]);
    expect(mutatorViolations).toEqual([]);
    expect([...scanned].map(srcPath)).toEqual(
      expect.arrayContaining(['components/theme-provider.tsx']),
    );
  });
});

// SPDX-License-Identifier: GPL-3.0-only

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const CONTENT_ENTRY = join(SRC, 'entrypoints/content.ts');

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

function walkFrom(entry: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || graph.has(file)) {
      continue;
    }
    const specifiers = moduleSpecifiers(readFileSync(file, 'utf8'));
    graph.set(file, specifiers);
    for (const specifier of specifiers) {
      const resolved = resolveImportedFile(file, specifier);
      if (resolved !== 'external' && resolved !== 'asset') {
        queue.push(resolved);
      }
    }
  }
  return graph;
}

function isProtocolContent(file: string): boolean {
  return srcPath(file).startsWith('protocol/content/');
}

function isContentEntrypoint(file: string): boolean {
  return srcPath(file) === 'entrypoints/content.ts';
}

function isForbiddenZod(file: string, specifier: string): boolean {
  if (specifier === 'zod/mini') {
    return !isProtocolContent(file);
  }
  return specifier === 'zod' || specifier.startsWith('zod/');
}

const CONTENT_GRAPH = walkFrom(CONTENT_ENTRY);

describe('content import isolation', () => {
  it('walks every file reachable from content.ts', () => {
    const files = [...CONTENT_GRAPH.keys()].map(srcPath);
    expect(files).toContain('access/site-access.ts');
    expect(files).toContain('protocol/content/client.ts');
    expect(files).toContain('overlay/OverlayRoot.tsx');
    expect(files).not.toContain('settings/behavior-schema.ts');
    expect(files).not.toContain('protocol/schemas/shared.ts');
  });

  it('keeps regular Zod and privileged schemas out of the content graph', () => {
    const violations: string[] = [];
    for (const [file, specifiers] of CONTENT_GRAPH) {
      const path = srcPath(file);
      for (const specifier of specifiers) {
        if (
          isForbiddenZod(file, specifier) ||
          /(?:^|\/)behavior-schema(?:\.ts)?$/.test(specifier)
        ) {
          violations.push(`${path} imports ${specifier}`);
        }
        if (/(?:^|\/)protocol\/schemas(?:\/|$)/.test(specifier)) {
          violations.push(`${path} imports ${specifier}`);
        }
        if (
          /(?:^|\/)protocol\/content(?:\/|$)/.test(specifier) &&
          !isProtocolContent(file) &&
          !isContentEntrypoint(file)
        ) {
          violations.push(`${path} imports ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

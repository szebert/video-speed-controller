// SPDX-License-Identifier: GPL-3.0-only

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

const CONTENT_GRAPH_FILES = [
  'entrypoints/content.ts',
  'settings/site-behavior.ts',
  'core/applied-tab-behavior.ts',
  'core/video-speed-engine.ts',
  'core/video-overlay.ts',
  'core/media-controller.ts',
  'core/media-registry.ts',
  'core/arbitration.ts',
  'core/speed.ts',
];

const FORBIDDEN = [
  /^(?:zod|zod\/mini)$/,
  /(?:^|\/)behavior-schema(?:\.ts)?$/,
  /(?:^|\/)protocol\/schemas(?:\/|$)/,
];

function walkTsFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...walkTsFiles(path));
      continue;
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      found.push(path);
    }
  }
  return found;
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*import(?:\s+type)?(?:\s+[\s\S]*?\s+from\s+|\s+)['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1]) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

describe('content import isolation', () => {
  it('keeps Zod and privileged schemas out of the content graph', () => {
    const files = [
      ...CONTENT_GRAPH_FILES.map((file) => join(SRC, file)),
      ...walkTsFiles(join(SRC, 'protocol/content-codec')),
      ...walkTsFiles(join(SRC, 'overlay')),
    ];
    const violations: string[] = [];
    for (const file of files) {
      const specifiers = importSpecifiers(readFileSync(file, 'utf8'));
      for (const specifier of specifiers) {
        if (FORBIDDEN.some((pattern) => pattern.test(specifier))) {
          violations.push(`${relative(SRC, file)} imports ${specifier}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

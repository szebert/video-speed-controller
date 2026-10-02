// SPDX-License-Identifier: GPL-3.0-only

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const FORBIDDEN_PACKAGES = [
  'react',
  'react-dom',
  'react-aria-components',
  'lucide-react',
  'sonner',
  'class-variance-authority',
  'cn',
] as const;

function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path));
      continue;
    }
    found.push(path);
  }
  return found;
}

describe('ui runtime isolation', () => {
  const sources = filesUnder(SRC);

  it('keeps JSX out of src', () => {
    const tsx = sources.filter((file) => file.endsWith('.tsx') || file.endsWith('.jsx'));
    expect(tsx.map((file) => relative(SRC, file))).toEqual([]);
  });

  it('keeps React UI packages out of the source import graph', () => {
    const violations: string[] = [];
    for (const file of sources) {
      if (!/\.(ts|js|mjs|css)$/.test(file)) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      for (const name of FORBIDDEN_PACKAGES) {
        if (
          source.includes(`from '${name}'`) ||
          source.includes(`from "${name}"`) ||
          source.includes(`require('${name}')`)
        ) {
          violations.push(`${relative(SRC, file)} imports ${name}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('does not depend on a React UI runtime', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(
      names.filter((name) =>
        FORBIDDEN_PACKAGES.includes(name as (typeof FORBIDDEN_PACKAGES)[number]),
      ),
    ).toEqual([]);
    const wxt = readFileSync(join(ROOT, 'wxt.config.ts'), 'utf8');
    expect(wxt).not.toContain('@wxt-dev/module-react');
    expect(existsSync(join(ROOT, 'components.json'))).toBe(false);
  });
});

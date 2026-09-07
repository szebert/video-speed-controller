// SPDX-License-Identifier: GPL-3.0-only

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = join(ROOT, 'scripts/generate-third-party-notices.mjs');

function committedNotices(): string {
  return readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES'), 'utf8');
}

function generatedNotices(): string {
  return execFileSync(process.execPath, [SCRIPT, '--print'], {
    encoding: 'utf8',
    cwd: ROOT,
  });
}

function noticeNames(text: string): string[] {
  return [...text.matchAll(/^- ((?:@[^/]+\/)?[^@]+)@/gm)].map((match) => match[1] ?? '');
}

describe('third-party notices', () => {
  const generated = generatedNotices();
  const committed = committedNotices();
  const names = noticeNames(generated);

  it('keeps the committed notices identical to the shipped import graph', () => {
    expect(committed).toBe(generated);
    expect(readFileSync(join(ROOT, 'src/public/THIRD_PARTY_NOTICES'), 'utf8')).toBe(committed);
  });

  it('lists runtime packages that ship in the extension', () => {
    expect(names).toEqual(
      expect.arrayContaining([
        '@wxt-dev/i18n',
        'class-variance-authority',
        'cn',
        'lucide-react',
        'react',
        'react-aria-components',
        'react-dom',
        'sonner',
        'wxt',
        'zod',
      ]),
    );
  });

  it('omits toolchain packages that do not ship', () => {
    expect(names).not.toEqual(
      expect.arrayContaining([
        '@cacheable/memory',
        '@cacheable/utils',
        '@playwright/test',
        'cacheable',
        'chokidar',
        'eslint',
        'prettier',
        'typescript',
        'vite',
        'vitest',
      ]),
    );
  });
});

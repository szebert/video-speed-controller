// SPDX-License-Identifier: GPL-3.0-only

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = join(ROOT, 'scripts/generate-icons.mjs');
const SIZES = [16, 32, 48, 128] as const;

function pngSize(buffer: Buffer): { width: number; height: number } {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe('toolbar icons', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'osvsc-icons-'));

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  it('keeps committed PNGs identical to a fresh rasterize of the logo SVG', () => {
    execFileSync(process.execPath, [SCRIPT], {
      cwd: ROOT,
      env: { ...process.env, OSVSC_ICON_OUT: outDir },
    });

    for (const size of SIZES) {
      const name = `icon-${size}.png`;
      const generated = readFileSync(join(outDir, name));
      const committed = readFileSync(join(ROOT, 'src/public/icons', name));
      expect(generated.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(
        true,
      );
      expect(pngSize(generated)).toEqual({ width: size, height: size });
      expect(generated.equals(committed)).toBe(true);
    }
  });
});

#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only

import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = join(root, 'src/assets/logo.svg');
const outDir = process.env.OSVSC_ICON_OUT ?? join(root, 'src/public/icons');
const sizes = [16, 32, 48, 128];

const wasmPath = require.resolve('@resvg/resvg-wasm/index_bg.wasm');
await initWasm(readFileSync(wasmPath));

const svg = readFileSync(svgPath);
mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  const renderer = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { loadSystemFonts: false },
  });
  const rendered = renderer.render();
  writeFileSync(join(outDir, `icon-${size}.png`), rendered.asPng());
  rendered.free();
  renderer.free();
}

console.log(`Wrote icons to ${outDir}`);

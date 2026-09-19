// SPDX-License-Identifier: GPL-3.0-only
// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUNDLE_GROWTH_SLACK,
  chromeZipAsset,
  compareBundleGrowth,
  extensionRootFromUnzip,
  htmlReferencedScripts,
  jsStaticImports,
  measureChromeBundle,
  moduleClosure,
  selectPreviousRelease,
} from './bundle-size.mjs';

const scratchDirs = [];

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'osvsc-bundle-'));
  scratchDirs.push(dir);
  return dir;
}

function writeTree(root, files) {
  for (const [relative, contents] of Object.entries(files)) {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}

function miniExtension(files = {}) {
  const root = scratch();
  writeTree(root, {
    'manifest.json': '{"manifest_version":3}',
    'popup.html': '<script type="module" src="./chunks/popup.js"></script>',
    'chunks/popup.js': 'import "./shared.js";\n',
    'chunks/shared.js': 'export const n = 1;\n',
    'content-scripts/content.js': 'export const content = true;\n',
    ...files,
  });
  return root;
}

describe('previous-release bundle measurement', () => {
  it('measures a flat extension root and follows popup HTML into a shared chunk', () => {
    const root = miniExtension();
    const { sizes, errors } = measureChromeBundle(root);
    expect(errors).toEqual([]);
    expect(sizes?.contentScriptBytes).toBeGreaterThan(0);
    expect(sizes?.popupInitialJsBytes).toBeGreaterThan(sizes?.contentScriptBytes ?? 0);
    expect(sizes?.extensionJsBytes).toBeGreaterThan(sizes?.popupInitialJsBytes ?? 0);
    expect(htmlReferencedScripts(root, 'popup.html')).toEqual(['chunks/popup.js']);
    expect(jsStaticImports(root, 'chunks/popup.js')).toEqual(['chunks/shared.js']);
    expect([...moduleClosure(root, ['chunks/popup.js']).files].sort()).toEqual([
      'chunks/popup.js',
      'chunks/shared.js',
    ]);
  });

  it('resolves a chrome zip unpacked one directory deep', () => {
    const unpacked = scratch();
    const nested = join(unpacked, 'chrome-mv3');
    writeTree(nested, { 'manifest.json': '{}' });
    expect(extensionRootFromUnzip(unpacked)).toBe(nested);
    expect(extensionRootFromUnzip(nested)).toBe(nested);
  });

  it('resolves a root-relative popup script and JS import', () => {
    const root = miniExtension({
      'popup.html': '<script type="module" src="/chunks/popup.js"></script>',
      'chunks/popup.js': 'import "/chunks/shared.js";\n',
    });
    expect(htmlReferencedScripts(root, 'popup.html')).toEqual(['chunks/popup.js']);
    expect(jsStaticImports(root, 'chunks/popup.js')).toEqual(['chunks/shared.js']);
  });

  it('reports a missing imported chunk without inventing sizes for it', () => {
    const root = miniExtension({
      'chunks/popup.js': 'import "./missing.js";\n',
    });
    const walked = moduleClosure(root, ['chunks/popup.js']);
    expect(walked.missing).toEqual(['chunks/missing.js']);
    expect([...walked.files]).toEqual(['chunks/popup.js']);
    expect(measureChromeBundle(root).errors).toEqual(['missing bundled module chunks/missing.js']);
  });

  it('picks the latest chrome zip that is not the version being cut', () => {
    const releases = [
      {
        tag_name: 'v0.2.0',
        assets: [{ name: 'opensource-video-speed-controller-0.2.0-chrome.zip' }],
      },
      {
        tag_name: 'v0.1.0',
        draft: true,
        assets: [{ name: 'opensource-video-speed-controller-0.1.0-chrome.zip' }],
      },
    ];
    expect(selectPreviousRelease(releases, ['v0.2.0', '0.2.0'])).toEqual({
      tag: 'v0.1.0',
      asset: { name: 'opensource-video-speed-controller-0.1.0-chrome.zip' },
      draft: true,
    });
    expect(chromeZipAsset({ assets: [{ name: 'notes.txt' }] })).toBeUndefined();
    expect(selectPreviousRelease(releases, ['v0.2.0', 'v0.1.0'])).toBeNull();
  });

  it('allows 9.9% and 10% growth and fails 10.1%', () => {
    const previous = {
      contentScriptBytes: 1000,
      popupInitialJsBytes: 1000,
      extensionJsBytes: 1000,
      extensionBytes: 1000,
    };
    const grow = (factor) =>
      compareBundleGrowth(
        {
          contentScriptBytes: Math.round(1000 * factor),
          popupInitialJsBytes: 1000,
          extensionJsBytes: 1000,
          extensionBytes: 1000,
        },
        previous,
        BUNDLE_GROWTH_SLACK,
      );

    expect(BUNDLE_GROWTH_SLACK).toBe(1.1);
    expect(grow(1.099)).toEqual([]);
    expect(grow(1.1)).toEqual([]);
    expect(grow(1.101)).toEqual([
      {
        key: 'contentScriptBytes',
        currentBytes: 1101,
        previousBytes: 1000,
        limitBytes: 1100,
      },
    ]);
  });

  it('does not fail when the current bundle is smaller than the baseline', () => {
    const previous = {
      contentScriptBytes: 2000,
      popupInitialJsBytes: 2000,
      extensionJsBytes: 2000,
      extensionBytes: 2000,
    };
    expect(
      compareBundleGrowth(
        {
          contentScriptBytes: 900,
          popupInitialJsBytes: 900,
          extensionJsBytes: 900,
          extensionBytes: 900,
        },
        previous,
      ),
    ).toEqual([]);
  });
});

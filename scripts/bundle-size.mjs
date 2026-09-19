// SPDX-License-Identifier: GPL-3.0-only

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

export const KB = 1000;
export const BUNDLE_SIZE_KEYS = [
  'contentScriptBytes',
  'popupInitialJsBytes',
  'extensionJsBytes',
  'extensionBytes',
];
// Allowed growth vs the last GitHub release chrome zip. Raise this in the same
// PR as an intentional size increase. Reset to 1.1 after that release ships.
export const BUNDLE_GROWTH_SLACK = 1.1;
export const CHROME_ZIP_ASSET = /^opensource-video-speed-controller-.+-chrome\.zip$/;

export function listOutputFiles(dir) {
  return readdirSync(dir, { recursive: true }).map(String);
}

export function chromeZipAsset(release) {
  return (release?.assets ?? []).find((asset) => CHROME_ZIP_ASSET.test(asset.name ?? ''));
}

export function selectPreviousRelease(releases, skipTags) {
  if (!Array.isArray(releases)) {
    return null;
  }
  const skip = skipTags instanceof Set ? skipTags : new Set(skipTags ?? []);
  for (const release of releases) {
    if (!release || skip.has(release.tag_name)) {
      continue;
    }
    const asset = chromeZipAsset(release);
    if (asset) {
      return { tag: release.tag_name, asset, draft: Boolean(release.draft) };
    }
  }
  return null;
}

export function extensionRootFromUnzip(unpacked) {
  if (existsSync(join(unpacked, 'manifest.json'))) {
    return unpacked;
  }
  const children = readdirSync(unpacked);
  if (children.length === 1) {
    const nested = join(unpacked, children[0]);
    if (existsSync(join(nested, 'manifest.json'))) {
      return nested;
    }
  }
  return null;
}

export function htmlReferencedScripts(chromeDir, relativeHtml) {
  const html = readFileSync(join(chromeDir, relativeHtml), 'utf8');
  return [...html.matchAll(/\b(?:src|href)="([^"]+\.js)"/g)].map((match) =>
    toOutputRelative(match[1] ?? ''),
  );
}

export function jsStaticImports(chromeDir, relativeJs) {
  const source = readFileSync(join(chromeDir, relativeJs), 'utf8');
  return [...source.matchAll(/(?:\bfrom\s+|^\s*import\s+)["']([^"']+)["']/gm)]
    .map((match) => match[1] ?? '')
    .filter((spec) => spec.startsWith('.') || spec.startsWith('/'))
    .map((spec) => resolveRelative(relativeJs, spec));
}

export function moduleClosure(chromeDir, entryRelatives) {
  const files = new Set();
  const missing = [];
  const queue = [...entryRelatives];
  while (queue.length) {
    const current = queue.pop();
    if (!current || files.has(current) || missing.includes(current)) {
      continue;
    }
    if (!existsSync(join(chromeDir, current))) {
      missing.push(current);
      continue;
    }
    files.add(current);
    if (!current.endsWith('.js')) {
      continue;
    }
    queue.push(...jsStaticImports(chromeDir, current));
  }
  return { files, missing };
}

export function measureChromeBundle(chromeDir, outputFiles = listOutputFiles(chromeDir)) {
  const errors = [];
  if (!outputFiles.includes('content-scripts/content.js')) {
    errors.push('must include content-scripts/content.js');
  }
  if (!outputFiles.includes('popup.html')) {
    errors.push('must include popup.html');
  }
  if (errors.length) {
    return { sizes: null, errors };
  }

  const contentJs = moduleClosure(chromeDir, ['content-scripts/content.js']);
  const popupJs = moduleClosure(chromeDir, htmlReferencedScripts(chromeDir, 'popup.html'));
  for (const missing of [...contentJs.missing, ...popupJs.missing]) {
    errors.push(`missing bundled module ${missing}`);
  }
  const allJs = outputFiles.filter((file) => file.endsWith('.js'));
  return {
    sizes: {
      contentScriptBytes: totalBytes(chromeDir, contentJs.files),
      popupInitialJsBytes: totalBytes(chromeDir, popupJs.files),
      extensionJsBytes: totalBytes(chromeDir, allJs),
      extensionBytes: totalBytes(
        chromeDir,
        outputFiles.filter((file) => {
          const path = join(chromeDir, file);
          return existsSync(path) && statSync(path).isFile();
        }),
      ),
    },
    errors,
  };
}

export function compareBundleGrowth(current, previous, slack = BUNDLE_GROWTH_SLACK) {
  return BUNDLE_SIZE_KEYS.flatMap((key) => {
    const previousBytes = previous[key] ?? 0;
    const currentBytes = current[key] ?? 0;
    const limitBytes = previousBytes * slack;
    if (currentBytes > limitBytes) {
      return [{ key, currentBytes, previousBytes, limitBytes }];
    }
    return [];
  });
}

export function toOutputRelative(spec) {
  return spec.startsWith('/') ? spec.slice(1) : spec.replace(/^\.\//, '');
}

export function resolveRelative(fromRelative, spec) {
  if (spec.startsWith('/')) {
    return spec.slice(1);
  }
  return posix.normalize(posix.join(posix.dirname(fromRelative), spec));
}

export function totalBytes(chromeDir, relatives) {
  return [...relatives].reduce((sum, file) => {
    const path = join(chromeDir, file);
    if (!existsSync(path)) {
      return sum;
    }
    const stats = statSync(path);
    return stats.isFile() ? sum + stats.size : sum;
  }, 0);
}

export function formatKb(bytes) {
  return `${(bytes / KB).toFixed(2)} kB`;
}

export function formatGrowthPercent(slack) {
  return `${Math.round((slack - 1) * 100)}%`;
}

export function formatSignedPercent(change) {
  const percent = (change * 100).toFixed(1);
  return `${change > 0 ? '+' : ''}${percent}%`;
}

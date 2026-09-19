#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only

import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const failures = [];

const fail = (message) => {
  failures.push(message);
};

const KB = 1000;
const BUNDLE_SIZE_KEYS = [
  'contentScriptBytes',
  'popupInitialJsBytes',
  'extensionJsBytes',
  'extensionBytes',
];
// Allowed growth vs the last GitHub release chrome zip (drafts included when
// GH_TOKEN can see them). Raise this in the same PR as an intentional size
// increase. Reset to 1.1 after that release ships; the new zip is then the
// baseline.
const BUNDLE_GROWTH_SLACK = 1.1;

if (pkg.license !== 'GPL-3.0-only') {
  fail(`package.json license must be GPL-3.0-only, found ${pkg.license}`);
}
if (!existsSync(join(root, 'LICENSE'))) {
  fail('root LICENSE is missing');
} else {
  const license = readFileSync(join(root, 'LICENSE'), 'utf8');
  if (!license.includes('GNU GENERAL PUBLIC LICENSE') || !license.includes('Version 3')) {
    fail('LICENSE must contain unmodified GNU GPL version 3 text');
  }
}
if (!existsSync(join(root, 'pnpm-lock.yaml'))) {
  fail('pnpm-lock.yaml must exist');
}
for (const forbidden of ['package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb']) {
  if (existsSync(join(root, forbidden))) {
    fail(`${forbidden} must not exist`);
  }
}
if (pkg.private !== true) {
  fail('package.json must be private');
}
if (pkg.packageManager !== 'pnpm@12.4.1') {
  fail(`packageManager must be pnpm@12.4.1, found ${pkg.packageManager}`);
}

const tag =
  process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : process.env.RELEASE_TAG;
if (tag) {
  const expected = `v${pkg.version}`;
  if (tag !== expected && tag !== pkg.version) {
    fail(`git tag ${tag} does not match package.json version ${pkg.version}`);
  }
  if (process.env.GITHUB_SHA) {
    const tagged = execSync(`git rev-list -n 1 ${tag}`, { cwd: root, encoding: 'utf8' }).trim();
    if (tagged !== process.env.GITHUB_SHA) {
      fail(`release commit ${process.env.GITHUB_SHA} is not tagged commit ${tagged}`);
    }
  }
}

const zipName = `opensource-video-speed-controller-${pkg.version}-chrome.zip`;
const zipCandidates = [join(root, '.output', zipName), join(root, zipName)];
const foundZip = zipCandidates.find((path) => existsSync(path));
if (process.env.REQUIRE_ZIP === '1') {
  if (!foundZip) {
    fail(`missing ${zipName}`);
  } else if (!foundZip.endsWith(zipName)) {
    fail(`ZIP name must be ${zipName}`);
  }
}

if (existsSync(join(root, '.output', 'chrome-mv3', 'manifest.json'))) {
  const manifest = JSON.parse(
    readFileSync(join(root, '.output', 'chrome-mv3', 'manifest.json'), 'utf8'),
  );
  if (manifest.minimum_chrome_version !== '119') {
    fail('minimum_chrome_version must be 119');
  }
  const permissions = manifest.permissions ?? [];
  if (permissions.includes('tabs')) {
    fail('manifest must not request the tabs permission');
  }
  if (manifest.host_permissions?.length) {
    fail('manifest must not include host_permissions');
  }
  if (manifest.content_scripts?.length) {
    fail('manifest must not include static content_scripts');
  }
  if (manifest.options_page) {
    fail('manifest must not include legacy options_page');
  }
  if (manifest.options_ui?.page !== 'options.html' || manifest.options_ui?.open_in_tab !== true) {
    fail('options_ui must open options.html in a tab');
  }
  if (!existsSync(join(root, '.output', 'chrome-mv3', 'options.html'))) {
    fail('missing .output/chrome-mv3/options.html');
  }
  if (manifest.commands) {
    fail('manifest must not include commands');
  }
}

const notices = join(root, 'THIRD_PARTY_NOTICES');
const publicNotices = join(root, 'src/public/THIRD_PARTY_NOTICES');
if (!existsSync(notices) || !existsSync(publicNotices)) {
  fail('THIRD_PARTY_NOTICES must exist at the repo root and in src/public');
} else if (readFileSync(notices, 'utf8') !== readFileSync(publicNotices, 'utf8')) {
  fail('THIRD_PARTY_NOTICES and src/public/THIRD_PARTY_NOTICES must match');
}

if (existsSync(join(root, '.output', 'chrome-mv3'))) {
  const chromeDir = join(root, '.output', 'chrome-mv3');
  const outputFiles = readdirSync(chromeDir, { recursive: true }).map(String);
  if (outputFiles.some((file) => file.includes('.cursor') || file.includes('.agents'))) {
    fail('development tooling must not be bundled into the Chrome artifact');
  }
  if (!outputFiles.includes('THIRD_PARTY_NOTICES')) {
    fail('Chrome artifact must include THIRD_PARTY_NOTICES');
  }
  for (const size of [16, 32, 48, 128]) {
    if (!outputFiles.includes(`icons/icon-${size}.png`)) {
      fail(`Chrome artifact must include icons/icon-${size}.png`);
    }
  }
  checkBundleBudgets(chromeDir, outputFiles);
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log('Release checks passed');

function checkBundleBudgets(chromeDir, outputFiles) {
  const sizes = measureChromeBundle(chromeDir, outputFiles, 'Chrome artifact');
  if (!sizes) {
    return;
  }

  console.log(
    `Bundle sizes: content=${formatKb(sizes.contentScriptBytes)} popupJS=${formatKb(
      sizes.popupInitialJsBytes,
    )} js=${formatKb(sizes.extensionJsBytes)} total=${formatKb(sizes.extensionBytes)}`,
  );

  const previous = previousReleaseBundle();
  if (previous?.skip) {
    console.log(`Bundle growth check skipped: ${previous.skip}`);
    return;
  }
  if (!previous) {
    return;
  }

  try {
    compareBundleGrowth(sizes, previous.sizes, previous.tag);
  } finally {
    previous.cleanup();
  }
}

function measureChromeBundle(chromeDir, outputFiles, label) {
  const contentEntry = 'content-scripts/content.js';
  if (!outputFiles.includes(contentEntry)) {
    fail(`${label} must include content-scripts/content.js`);
    return null;
  }
  if (!outputFiles.includes('popup.html')) {
    fail(`${label} must include popup.html`);
    return null;
  }

  const contentJs = moduleClosure(chromeDir, [contentEntry], label);
  const popupJs = moduleClosure(chromeDir, htmlReferencedScripts(chromeDir, 'popup.html'), label);
  const allJs = outputFiles.filter((file) => file.endsWith('.js'));
  return {
    contentScriptBytes: totalBytes(chromeDir, contentJs),
    popupInitialJsBytes: totalBytes(chromeDir, popupJs),
    extensionJsBytes: totalBytes(chromeDir, allJs),
    extensionBytes: totalBytes(
      chromeDir,
      outputFiles.filter((file) => statSync(join(chromeDir, file)).isFile()),
    ),
  };
}

function compareBundleGrowth(current, previous, previousTag) {
  const allowed = formatGrowthPercent(BUNDLE_GROWTH_SLACK);
  console.log(
    `Bundle vs ${previousTag} (allowed +${allowed}): ${BUNDLE_SIZE_KEYS.map((key) => {
      const delta =
        previous[key] === 0 ? 'n/a' : formatSignedPercent(current[key] / previous[key] - 1);
      return `${key}=${formatKb(current[key])} (${delta})`;
    }).join(' ')}`,
  );
  for (const key of BUNDLE_SIZE_KEYS) {
    const limit = previous[key] * BUNDLE_GROWTH_SLACK;
    if (current[key] > limit) {
      reportBundleGrowth(
        `${key} ${formatKb(current[key])} exceeds last release ${previousTag} ` +
          `${formatKb(previous[key])} +${allowed} (limit ${formatKb(limit)}). ` +
          'Raise BUNDLE_GROWTH_SLACK in scripts/check-release.mjs in this PR if the growth is intentional; ' +
          'reset it to 1.1 after that release ships.',
      );
    }
  }
}

function reportBundleGrowth(message) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.error(`::error::${message}`);
  }
  fail(message);
}

function previousReleaseBundle() {
  const repo = githubRepo();
  if (!repo) {
    return { skip: 'could not resolve GitHub repository' };
  }
  if (!commandExists('gh')) {
    if (process.env.GITHUB_ACTIONS === 'true') {
      fail('gh is required to compare bundle size against the last GitHub release');
      return null;
    }
    return { skip: 'gh is not available' };
  }

  let releases;
  try {
    releases = JSON.parse(
      execFileSync('gh', ['api', `repos/${repo}/releases?per_page=20`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  } catch (error) {
    const detail = execErrorDetail(error);
    if (process.env.GITHUB_ACTIONS === 'true') {
      fail(`could not list GitHub releases for ${repo}: ${detail}`);
      return null;
    }
    return { skip: `could not list GitHub releases (${detail})` };
  }

  if (!Array.isArray(releases)) {
    const message = `unexpected GitHub releases payload for ${repo}`;
    if (process.env.GITHUB_ACTIONS === 'true') {
      fail(message);
      return null;
    }
    return { skip: message };
  }

  const skipTags = new Set(
    [`v${pkg.version}`, pkg.version, process.env.GITHUB_REF_NAME, process.env.RELEASE_TAG].filter(
      Boolean,
    ),
  );
  const match = releases.find((release) => {
    if (!release || skipTags.has(release.tag_name)) {
      return false;
    }
    return chromeZipAsset(release) != null;
  });
  if (!match) {
    return { skip: 'no previous GitHub release zip' };
  }

  const asset = chromeZipAsset(match);
  if (!asset) {
    return { skip: 'no previous GitHub release zip' };
  }
  const scratch = mkdtempSync(join(tmpdir(), 'osvsc-prev-release-'));
  const cleanup = () => {
    rmSync(scratch, { recursive: true, force: true });
  };

  try {
    execFileSync(
      'gh',
      [
        'release',
        'download',
        match.tag_name,
        '--repo',
        repo,
        '--pattern',
        asset.name,
        '--dir',
        scratch,
        '--clobber',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const zipPath = join(scratch, asset.name);
    if (!existsSync(zipPath)) {
      throw new Error(`downloaded zip missing: ${asset.name}`);
    }
    const unpacked = join(scratch, 'unpacked');
    execFileSync('unzip', ['-q', zipPath, '-d', unpacked], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chromeDir = extensionRootFromUnzip(unpacked);
    if (!chromeDir) {
      throw new Error('previous release zip is not a Chrome extension root');
    }
    const outputFiles = readdirSync(chromeDir, { recursive: true }).map(String);
    const sizes = measureChromeBundle(chromeDir, outputFiles, `previous release ${match.tag_name}`);
    if (!sizes) {
      cleanup();
      return null;
    }
    return { tag: match.tag_name, sizes, cleanup };
  } catch (error) {
    cleanup();
    const detail = execErrorDetail(error);
    if (process.env.GITHUB_ACTIONS === 'true') {
      fail(`could not download previous release ${match.tag_name}: ${detail}`);
      return null;
    }
    return { skip: `could not download previous release (${detail})` };
  }
}

function chromeZipAsset(release) {
  return (release.assets ?? []).find((asset) =>
    /^opensource-video-speed-controller-.+-chrome\.zip$/.test(asset.name ?? ''),
  );
}

function extensionRootFromUnzip(unpacked) {
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

function githubRepo() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }
  const url = pkg.repository?.url ?? '';
  const match = url.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/);
  return match?.[1] ?? null;
}

function commandExists(name) {
  try {
    execFileSync(name, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

function execErrorDetail(error) {
  const stderr = error instanceof Error && 'stderr' in error ? error.stderr : null;
  const text = Buffer.isBuffer(stderr)
    ? stderr.toString('utf8')
    : typeof stderr === 'string'
      ? stderr
      : '';
  if (text.trim()) {
    return text.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

function formatGrowthPercent(slack) {
  return `${Math.round((slack - 1) * 100)}%`;
}

function formatSignedPercent(change) {
  const percent = (change * 100).toFixed(1);
  return `${change > 0 ? '+' : ''}${percent}%`;
}

function htmlReferencedScripts(chromeDir, relativeHtml) {
  const html = readFileSync(join(chromeDir, relativeHtml), 'utf8');
  return [...html.matchAll(/\b(?:src|href)="([^"]+\.js)"/g)].map((match) =>
    toOutputRelative(match[1] ?? ''),
  );
}

function jsStaticImports(chromeDir, relativeJs) {
  const source = readFileSync(join(chromeDir, relativeJs), 'utf8');
  return [...source.matchAll(/(?:\bfrom\s+|^\s*import\s+)["']([^"']+)["']/gm)]
    .map((match) => match[1] ?? '')
    .filter((spec) => spec.startsWith('.') || spec.startsWith('/'))
    .map((spec) => resolveRelative(relativeJs, spec));
}

function moduleClosure(chromeDir, entryRelatives, label) {
  const seen = new Set();
  const queue = [...entryRelatives];
  while (queue.length) {
    const current = queue.pop();
    if (!current || seen.has(current)) {
      continue;
    }
    if (!existsSync(join(chromeDir, current))) {
      fail(`${label} missing bundled module ${current}`);
      continue;
    }
    seen.add(current);
    if (!current.endsWith('.js')) {
      continue;
    }
    queue.push(...jsStaticImports(chromeDir, current));
  }
  return seen;
}

function toOutputRelative(spec) {
  return spec.startsWith('/') ? spec.slice(1) : spec.replace(/^\.\//, '');
}

function resolveRelative(fromRelative, spec) {
  if (spec.startsWith('/')) {
    return spec.slice(1);
  }
  return posix.normalize(posix.join(posix.dirname(fromRelative), spec));
}

function totalBytes(chromeDir, relatives) {
  return [...relatives].reduce((sum, file) => {
    const path = join(chromeDir, file);
    if (!existsSync(path)) {
      return sum;
    }
    const stats = statSync(path);
    return stats.isFile() ? sum + stats.size : sum;
  }, 0);
}

function formatKb(bytes) {
  return `${(bytes / KB).toFixed(2)} kB`;
}

// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import { parseBackupText } from '../settings/backup';
import { THEME_KEY } from '../settings/site-behavior';
import { persistTheme } from '../settings/theme';
import {
  persistGlobalBehaviorChange,
  resetBehaviorDefaultsRepairBackoff,
} from '../storage/behavior-defaults';
import { SITE_HLC_KEY } from '../storage/hybrid-clock';
import {
  exportLogicalBackup,
  exportLogicalBackupText,
  importLogicalSettings,
} from '../storage/logical-backup';
import { SITE_OUTBOX_KEY } from '../storage/replica-outbox';
import { persistSiteSpeed, readSiteSpeed, resetSiteRepairBackoff } from '../storage/site-settings';
import { SITE_GENERATION_KEY } from '../storage/site-generation';
import { resetStorageMutationQueue } from '../storage/storage-mutation-queue';
import { memoryDurable } from './memory-store';

const YOUTUBE = 'https://www.youtube.com/watch';
const NETFLIX = 'https://www.netflix.com/watch';
const YOUTUBE_KEY = 'site:www.youtube.com';
const NETFLIX_KEY = 'site:www.netflix.com';

function pair(now = 1_000) {
  return {
    sync: memoryDurable(),
    local: memoryDurable(),
    now: () => now,
  };
}

function backupText(value: unknown): string {
  return JSON.stringify(value);
}

describe('logical backup import/export', () => {
  beforeEach(() => {
    resetSiteRepairBackoff();
    resetBehaviorDefaultsRepairBackoff();
    resetStorageMutationQueue();
  });

  it('exports configured values and omits replica internals', async () => {
    const deps = pair(50);
    await persistGlobalBehaviorChange({ kind: 'value', field: 'speed', value: 1.25 }, deps);
    await persistSiteSpeed(YOUTUBE, 2, deps);
    await persistTheme('light', { sync: deps.sync });
    const backup = await exportLogicalBackup(deps);
    expect(backup).toEqual({
      formatVersion: 1,
      global: { speed: 1.25 },
      sites: { 'www.youtube.com': { speed: 2 } },
      theme: 'light',
    });
    expect(JSON.stringify(backup)).not.toContain('lastUsedAt');
    expect(JSON.stringify(backup)).not.toContain('updatedAt');
    expect(JSON.stringify(backup)).not.toContain(SITE_HLC_KEY);
    const text = await exportLogicalBackupText(deps);
    expect(parseBackupText(text)).toEqual({ status: 'ready', backup });
  });

  it('exports every configured site instead of dropping older ones', async () => {
    const deps = {
      sync: memoryDurable(),
      local: memoryDurable(),
      now: () => 10,
    };
    await persistSiteSpeed('https://old.example/', 1.25, { ...deps, now: () => 10 });
    await persistSiteSpeed('https://mid.example/', 1.5, { ...deps, now: () => 20 });
    await persistSiteSpeed('https://new.example/', 1.75, { ...deps, now: () => 30 });
    await persistTheme('dark', { sync: deps.sync });
    const backup = await exportLogicalBackup(deps);
    expect(backup.sites).toEqual({
      'mid.example': { speed: 1.5 },
      'new.example': { speed: 1.75 },
      'old.example': { speed: 1.25 },
    });
  });

  it('merges present fields and keeps omitted sites', async () => {
    const deps = pair(50);
    await persistSiteSpeed(YOUTUBE, 1.5, deps);
    await persistSiteSpeed(NETFLIX, 1.25, deps);
    await persistSiteSpeed(YOUTUBE, 1.5, {
      ...deps,
      now: () => 50,
    });
    const result = await importLogicalSettings(
      backupText({
        formatVersion: 1,
        sites: { 'www.youtube.com': { speed: 2 } },
      }),
      'merge',
      { ...deps, now: () => 80 },
    );
    expect(result.skippedRecordCount).toBe(0);
    await expect(readSiteSpeed(YOUTUBE, { ...deps, now: () => 80 })).resolves.toBe(2);
    await expect(readSiteSpeed(NETFLIX, { ...deps, now: () => 80 })).resolves.toBe(1.25);
  });

  it('replace bumps generation and cannot resurrect an omitted site', async () => {
    const deps = pair(50);
    await persistSiteSpeed(YOUTUBE, 1.5, deps);
    await persistSiteSpeed(NETFLIX, 1.25, deps);
    const youtubeBefore = deps.local.data[YOUTUBE_KEY];
    await importLogicalSettings(
      backupText({
        formatVersion: 1,
        sites: { 'www.netflix.com': { speed: 2 } },
      }),
      'replace',
      { ...deps, now: () => 80 },
    );
    expect(deps.local.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 1 });
    expect(deps.local.data[YOUTUBE_KEY]).toBeUndefined();
    expect(youtubeBefore).toBeDefined();
    await expect(readSiteSpeed(YOUTUBE, { ...deps, now: () => 80 })).resolves.toBe(1);
    await expect(readSiteSpeed(NETFLIX, { ...deps, now: () => 80 })).resolves.toBe(2);
    deps.local.data[YOUTUBE_KEY] = youtubeBefore;
    await expect(readSiteSpeed(YOUTUBE, { ...deps, now: () => 80 })).resolves.toBe(1);
  });

  it('issues fresh timestamps greater than pre-import accepted values', async () => {
    const deps = pair(50);
    await persistSiteSpeed(YOUTUBE, 1.25, deps);
    const preIssued = (deps.local.data[SITE_HLC_KEY] as { lastIssued: number }).lastIssued;
    const preUpdated = (
      deps.local.data[YOUTUBE_KEY] as { overrides: { speed: { updatedAt: number } } }
    ).overrides.speed.updatedAt;
    await importLogicalSettings(
      backupText({
        formatVersion: 1,
        sites: {
          'www.youtube.com': { speed: 2 },
          'www.netflix.com': { speed: 1.5 },
        },
      }),
      'merge',
      { ...deps, now: () => 50 },
    );
    const youtubeAt = (
      deps.local.data[YOUTUBE_KEY] as { overrides: { speed: { updatedAt: number } } }
    ).overrides.speed.updatedAt;
    const netflixAt = (
      deps.local.data[NETFLIX_KEY] as { overrides: { speed: { updatedAt: number } } }
    ).overrides.speed.updatedAt;
    const lastIssued = (deps.local.data[SITE_HLC_KEY] as { lastIssued: number }).lastIssued;
    expect(youtubeAt).toBeGreaterThan(preUpdated);
    expect(youtubeAt).toBeGreaterThan(preIssued);
    expect(netflixAt).toBeGreaterThan(preIssued);
    expect(netflixAt).not.toBe(youtubeAt);
    expect(lastIssued).toBeGreaterThanOrEqual(Math.max(youtubeAt, netflixAt));
  });

  it('commits imported sites in one Local batch', async () => {
    const deps = pair(50);
    let siteRecordBatches = 0;
    let published: string[] | undefined;
    const local = {
      ...deps.local,
      async set(items: Record<string, unknown>) {
        if (YOUTUBE_KEY in items && NETFLIX_KEY in items) {
          siteRecordBatches += 1;
          published = (items[SITE_OUTBOX_KEY] as { publishSites?: string[] } | undefined)
            ?.publishSites;
        }
        await deps.local.set(items);
      },
    };
    await importLogicalSettings(
      backupText({
        formatVersion: 1,
        sites: {
          'www.youtube.com': { speed: 2 },
          'www.netflix.com': { speed: 1.5 },
        },
      }),
      'replace',
      { ...deps, local, now: () => 80 },
    );
    expect(siteRecordBatches).toBe(1);
    expect(published).toEqual(expect.arrayContaining([YOUTUBE_KEY, NETFLIX_KEY]));
  });

  it('leaves an omitted unsupported site physically untouched and logically obsolete after replace', async () => {
    const deps = pair(50);
    const future = { schemaVersion: 2, generation: 7, overrides: { extra: true } };
    deps.local.data[YOUTUBE_KEY] = future;
    deps.sync.data[YOUTUBE_KEY] = future;
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7, updatedAt: 40 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7, updatedAt: 40 };
    deps.local.data[SITE_HLC_KEY] = { schemaVersion: 1, lastIssued: 40 };
    const result = await importLogicalSettings(
      backupText({
        formatVersion: 1,
        sites: { 'www.netflix.com': { speed: 2 } },
      }),
      'replace',
      { ...deps, now: () => 80 },
    );
    expect(result.skippedRecordCount).toBe(1);
    expect(deps.local.data[YOUTUBE_KEY]).toEqual(future);
    expect(deps.sync.data[YOUTUBE_KEY]).toEqual(future);
    expect(deps.local.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 8 });
    await expect(readSiteSpeed(YOUTUBE, { ...deps, now: () => 80 })).resolves.toBe(1);
    await expect(readSiteSpeed(NETFLIX, { ...deps, now: () => 80 })).resolves.toBe(2);
  });

  it('does not overwrite an unsupported site that is also in the backup', async () => {
    const deps = pair(50);
    const future = { schemaVersion: 2, generation: 7, overrides: { extra: true } };
    deps.local.data[YOUTUBE_KEY] = future;
    deps.sync.data[YOUTUBE_KEY] = future;
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7, updatedAt: 40 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7, updatedAt: 40 };
    deps.local.data[SITE_HLC_KEY] = { schemaVersion: 1, lastIssued: 40 };
    let published: string[] | undefined;
    const local = {
      ...deps.local,
      async set(items: Record<string, unknown>) {
        const outbox = items[SITE_OUTBOX_KEY] as { publishSites?: string[] } | undefined;
        if (outbox?.publishSites) {
          published = outbox.publishSites;
        }
        await deps.local.set(items);
      },
    };
    const result = await importLogicalSettings(
      backupText({
        formatVersion: 1,
        sites: {
          'www.youtube.com': { speed: 2 },
          'www.netflix.com': { speed: 1.5 },
        },
      }),
      'replace',
      { ...deps, local, now: () => 80 },
    );
    expect(result.skippedRecordCount).toBe(1);
    expect(deps.local.data[YOUTUBE_KEY]).toEqual(future);
    expect(published).toEqual([NETFLIX_KEY]);
    expect(published).not.toContain(YOUTUBE_KEY);
    await expect(readSiteSpeed(YOUTUBE, { ...deps, now: () => 80 })).resolves.toBe(1);
  });

  it('retries after a theme write failure with the same logical values', async () => {
    const deps = pair(50);
    await persistSiteSpeed(YOUTUBE, 1.25, deps);
    let themeWrites = 0;
    const sync = {
      ...deps.sync,
      async set(items: Record<string, unknown>) {
        if (THEME_KEY in items) {
          themeWrites += 1;
          if (themeWrites === 1) {
            throw new Error('theme failed');
          }
        }
        await deps.sync.set(items);
      },
    };
    const text = backupText({
      formatVersion: 1,
      sites: { 'www.netflix.com': { speed: 2 } },
      theme: 'light',
    });
    await expect(
      importLogicalSettings(text, 'replace', { ...deps, sync, now: () => 80 }),
    ).rejects.toThrow('theme failed');
    expect(deps.local.data[NETFLIX_KEY]).toMatchObject({
      overrides: { speed: { value: 2 } },
    });
    await importLogicalSettings(text, 'replace', { ...deps, sync, now: () => 90 });
    expect(deps.sync.data[THEME_KEY]).toMatchObject({ preference: 'light' });
    await expect(readSiteSpeed(NETFLIX, { ...deps, now: () => 90 })).resolves.toBe(2);
  });
});

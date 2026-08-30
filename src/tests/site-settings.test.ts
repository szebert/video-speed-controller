// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SITE_INHERIT_SYNC_RETENTION_MS,
  LOCAL_LRU_THROTTLE_MS,
  SYNC_LRU_STALE_MS,
  REPAIR_BACKOFF_MS,
  SYNC_TARGET_MAX_BYTES,
  SYNC_TARGET_MAX_SITE_ITEMS,
} from '../settings/site-behavior';
import {
  persistSiteSpeed,
  persistSiteSpeedInherit,
  readSiteSpeed,
  reconcileSyncHotSet,
  resetSiteRepairBackoff,
  resolveSiteBehaviorForUrl,
  resolveSpeedAfterSiteInherit,
} from '../storage/site-settings';
import { memoryDurable } from './memory-store';

function pair(now = 1_000) {
  return {
    sync: memoryDurable(),
    local: memoryDurable(),
    now: () => now,
  };
}

describe('site settings storage', () => {
  beforeEach(() => {
    resetSiteRepairBackoff();
  });

  it('treats old development speed-only records as absent', async () => {
    const deps = pair();
    deps.sync.data['site:www.youtube.com'] = { schemaVersion: 1, speed: 3.25 };
    await expect(readSiteSpeed('https://www.youtube.com/watch', deps)).resolves.toBe(1);
    expect(deps.sync.data['site:www.youtube.com']).toEqual({ schemaVersion: 1, speed: 3.25 });
  });

  it('does not create keys for unsupported pages', async () => {
    const deps = pair();
    await expect(readSiteSpeed('chrome://settings', deps)).resolves.toBeNull();
    expect(deps.sync.data).toEqual({});
    await expect(persistSiteSpeed('chrome://settings', 2, deps)).rejects.toThrow(/unsupported/);
  });

  it('persists an explicit 1x site value and Reset inherit separately', async () => {
    const deps = pair(50);
    await persistSiteSpeed('https://www.youtube.com/watch', 1, deps);
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { kind: 'value', value: 1, updatedAt: 50 } },
    });
    await persistSiteSpeedInherit('https://www.youtube.com/watch', { ...deps, now: () => 80 });
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { kind: 'inherit', updatedAt: 80 } },
    });
  });

  it('does not rewrite source records solely because a display read resolved them', async () => {
    const deps = pair();
    const record = {
      schemaVersion: 1 as const,
      lastUsedAt: 20,
      overrides: { speed: { kind: 'value' as const, value: 1.5, updatedAt: 20 } },
    };
    deps.sync.data['site:www.youtube.com'] = record;
    deps.local.data['site:www.youtube.com'] = record;
    await expect(readSiteSpeed('https://www.youtube.com/watch', deps)).resolves.toBe(1.5);
    expect(deps.sync.data['site:www.youtube.com']).toEqual(record);
    expect(deps.local.data['site:www.youtube.com']).toEqual(record);
  });

  it('repairs Sync when Local has the same value but a newer updatedAt', async () => {
    const deps = pair(300);
    deps.sync.data['site:www.youtube.com'] = {
      schemaVersion: 1,
      lastUsedAt: 100,
      overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 100 } },
    };
    deps.local.data['site:www.youtube.com'] = {
      schemaVersion: 1,
      lastUsedAt: 200,
      overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 200 } },
    };
    await expect(readSiteSpeed('https://www.youtube.com/watch', deps)).resolves.toBe(1.5);
    expect(deps.sync.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 200 } },
    });
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({ lastUsedAt: 200 });
  });

  it('mirrors a Sync winner into Local without clobbering newer Local LRU', async () => {
    const deps = pair();
    deps.sync.data['site:www.youtube.com'] = {
      schemaVersion: 1,
      lastUsedAt: 10,
      overrides: { speed: { kind: 'value', value: 1.75, updatedAt: 40 } },
    };
    deps.local.data['site:www.youtube.com'] = {
      schemaVersion: 1,
      lastUsedAt: 500,
      overrides: { speed: { kind: 'value', value: 1.25, updatedAt: 10 } },
    };
    await expect(readSiteSpeed('https://www.youtube.com/watch', deps)).resolves.toBe(1.75);
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({
      lastUsedAt: 500,
      overrides: { speed: { kind: 'value', value: 1.75, updatedAt: 40 } },
    });
  });

  it('does not repair when kind, value, and updatedAt already match', async () => {
    const deps = pair();
    const record = {
      schemaVersion: 1 as const,
      lastUsedAt: 40,
      overrides: { speed: { kind: 'value' as const, value: 1.5, updatedAt: 40 } },
    };
    deps.sync.data['site:www.youtube.com'] = { ...record, lastUsedAt: 10 };
    deps.local.data['site:www.youtube.com'] = record;
    let syncSets = 0;
    const sync = {
      ...deps.sync,
      async set(items: Record<string, unknown>) {
        syncSets += 1;
        await deps.sync.set(items);
      },
    };
    await readSiteSpeed('https://www.youtube.com/watch', { ...deps, sync });
    expect(syncSets).toBe(0);
  });

  it('does not touch LRU on a display-only read', async () => {
    const deps = pair(LOCAL_LRU_THROTTLE_MS + 50);
    deps.local.data['site:www.youtube.com'] = {
      schemaVersion: 1,
      lastUsedAt: 1,
      overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 1 } },
    };
    deps.sync.data['site:www.youtube.com'] = deps.local.data['site:www.youtube.com'];
    await readSiteSpeed('https://www.youtube.com/watch', deps);
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({ lastUsedAt: 1 });
  });

  it('touches an existing record on playback usage without changing updatedAt', async () => {
    const now = LOCAL_LRU_THROTTLE_MS + 80;
    const deps = pair(now);
    deps.local.data['site:www.youtube.com'] = {
      schemaVersion: 1,
      lastUsedAt: 1,
      overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 1 } },
    };
    deps.sync.data['site:www.youtube.com'] = deps.local.data['site:www.youtube.com'];
    await readSiteSpeed('https://www.youtube.com/watch', { ...deps, touchUsage: true });
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({
      lastUsedAt: now,
      overrides: { speed: { updatedAt: 1 } },
    });
  });

  it('does not create a site record when touching built-in/global-only behavior', async () => {
    const deps = pair();
    await expect(
      readSiteSpeed('https://www.youtube.com/watch', { ...deps, touchUsage: true }),
    ).resolves.toBe(1);
    expect(deps.local.data).toEqual({});
    expect(deps.sync.data).toEqual({});
  });

  it('strips an expired inherit from Sync on an unrelated write while Local retains it', async () => {
    const now = SITE_INHERIT_SYNC_RETENTION_MS + 100;
    const deps = pair(now);
    deps.local.data['site:www.youtube.com'] = {
      schemaVersion: 1,
      lastUsedAt: 1,
      overrides: {
        speed: { kind: 'value', value: 1.5, updatedAt: 1 },
        overlayPosition: { kind: 'inherit', updatedAt: 0 },
      },
    };
    await persistSiteSpeed('https://www.youtube.com/watch', 1.75, deps);
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({
      overrides: {
        speed: { kind: 'value', value: 1.75, updatedAt: now },
        overlayPosition: { kind: 'inherit', updatedAt: 0 },
      },
    });
    expect(deps.sync.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { kind: 'value', value: 1.75, updatedAt: now } },
    });
    expect(
      (deps.sync.data['site:www.youtube.com'] as { overrides: Record<string, unknown> }).overrides
        .overlayPosition,
    ).toBeUndefined();
  });

  it('does not re-promote an expired Local inherit into absent Sync', async () => {
    const now = SITE_INHERIT_SYNC_RETENTION_MS + 25;
    const deps = pair(now);
    deps.local.data['site:www.youtube.com'] = {
      schemaVersion: 1,
      lastUsedAt: 5,
      overrides: { overlayPosition: { kind: 'inherit', updatedAt: 0 } },
    };
    await readSiteSpeed('https://www.youtube.com/watch', deps);
    expect(deps.sync.data['site:www.youtube.com']).toBeUndefined();
  });

  it('lets an expired Local inherit still beat an older Sync value locally', async () => {
    const now = SITE_INHERIT_SYNC_RETENTION_MS + 25;
    const deps = pair(now);
    deps.local.data['site:www.youtube.com'] = {
      schemaVersion: 1,
      lastUsedAt: 5,
      overrides: { speed: { kind: 'inherit', updatedAt: 80 } },
    };
    deps.sync.data['site:www.youtube.com'] = {
      schemaVersion: 1,
      lastUsedAt: 5,
      overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 10 } },
    };
    await expect(readSiteSpeed('https://www.youtube.com/watch', deps)).resolves.toBe(1);
  });

  it('retries a capacity Sync write once after evicting cold live records', async () => {
    resetSiteRepairBackoff();
    const now = 10_000;
    const sync = memoryDurable();
    for (let index = 0; index < SYNC_TARGET_MAX_SITE_ITEMS + 2; index += 1) {
      sync.data[`site:cold-${index}.example`] = {
        schemaVersion: 1,
        lastUsedAt: index,
        overrides: { speed: { kind: 'value', value: 1.25, updatedAt: 1 } },
      };
    }
    let attempts = 0;
    const flaky = {
      ...sync,
      async set(items: Record<string, unknown>) {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('QUOTA_BYTES exceeded');
        }
        await sync.set(items);
      },
    };
    await persistSiteSpeed('https://www.youtube.com/watch', 1.75, {
      sync: flaky,
      local: memoryDurable(),
      now: () => now,
    });
    expect(attempts).toBe(2);
    expect(sync.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { value: 1.75 } },
    });
  });

  it('does not evict on write-rate failures', async () => {
    const sync = memoryDurable({
      'site:keep.example': {
        schemaVersion: 1,
        lastUsedAt: 1,
        overrides: { speed: { kind: 'value', value: 2, updatedAt: 1 } },
      },
    });
    await expect(
      persistSiteSpeed('https://www.youtube.com/watch', 1.5, {
        sync: {
          ...sync,
          async set() {
            throw new Error('MAX_WRITE_OPERATIONS_PER_HOUR quota');
          },
        },
        local: memoryDurable(),
        now: () => 20,
      }),
    ).rejects.toThrow(/MAX_WRITE_OPERATIONS/);
    expect(sync.data['site:keep.example']).toBeDefined();
    expect(sync.data['site:www.youtube.com']).toBeUndefined();
  });

  it('backs off repeated Sync repair while offline', async () => {
    resetSiteRepairBackoff();
    let attempts = 0;
    const sync = memoryDurable();
    const failing = {
      ...sync,
      async set() {
        attempts += 1;
        throw new Error('offline');
      },
    };
    const local = memoryDurable({
      'site:www.youtube.com': {
        schemaVersion: 1,
        lastUsedAt: 20,
        overrides: { speed: { kind: 'value', value: 1.75, updatedAt: 20 } },
      },
    });
    const now = 1_000;
    await readSiteSpeed('https://www.youtube.com/watch', { sync: failing, local, now: () => now });
    await readSiteSpeed('https://www.youtube.com/watch', {
      sync: failing,
      local,
      now: () => now + 1_000,
    });
    expect(attempts).toBe(1);
    await readSiteSpeed('https://www.youtube.com/watch', {
      sync: failing,
      local,
      now: () => now + REPAIR_BACKOFF_MS + 1,
    });
    expect(attempts).toBe(2);
  });

  it('never evicts global behavior or theme keys', async () => {
    const sync = memoryDurable({
      'defaults:site-behavior': {
        schemaVersion: 1,
        overrides: { speed: { kind: 'inherit', updatedAt: 1 } },
      },
      'pref:theme': { schemaVersion: 1, preference: 'light' },
    });
    await reconcileSyncHotSet(sync, SITE_INHERIT_SYNC_RETENTION_MS + 10);
    expect(sync.data['defaults:site-behavior']).toBeDefined();
    expect(sync.data['pref:theme']).toBeDefined();
  });

  it('does not refresh Sync lastUsedAt until it is a day stale', async () => {
    const now = LOCAL_LRU_THROTTLE_MS + 10;
    const deps = pair(now);
    const record = {
      schemaVersion: 1 as const,
      lastUsedAt: 1,
      overrides: { speed: { kind: 'value' as const, value: 1.25, updatedAt: 1 } },
    };
    deps.sync.data['site:www.youtube.com'] = record;
    deps.local.data['site:www.youtube.com'] = record;
    await readSiteSpeed('https://www.youtube.com/watch', { ...deps, touchUsage: true });
    expect(deps.sync.data['site:www.youtube.com']).toMatchObject({ lastUsedAt: 1 });
    await readSiteSpeed('https://www.youtube.com/watch', {
      ...deps,
      now: () => SYNC_LRU_STALE_MS + 20,
      touchUsage: true,
    });
    expect(deps.sync.data['site:www.youtube.com']).toMatchObject({
      lastUsedAt: SYNC_LRU_STALE_MS + 20,
    });
  });

  it('resolves Reset to the current global speed without persisting first', async () => {
    const deps = pair(10);
    deps.sync.data['defaults:site-behavior'] = {
      schemaVersion: 1,
      overrides: { speed: { kind: 'value', value: 1.25, updatedAt: 1 } },
    };
    deps.local.data['site:www.youtube.com'] = {
      schemaVersion: 1,
      lastUsedAt: 2,
      overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 2 } },
    };
    await expect(resolveSpeedAfterSiteInherit('https://www.youtube.com/watch', deps)).resolves.toBe(
      1.25,
    );
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 2 } },
    });
  });

  it('exposes provenance through the resolver while readSiteSpeed stays an effective number', async () => {
    const deps = pair();
    deps.sync.data['defaults:site-behavior'] = {
      schemaVersion: 1,
      overrides: { speed: { kind: 'value', value: 1.25, updatedAt: 3 } },
    };
    const resolved = await resolveSiteBehaviorForUrl('https://www.youtube.com/watch', deps);
    expect(resolved?.speed).toEqual({ value: 1.25, source: 'global' });
    await expect(readSiteSpeed('https://www.youtube.com/watch', deps)).resolves.toBe(1.25);
  });

  it('reconciles a successful 401st site write down to the soft item target', async () => {
    const now = 10_000;
    const sync = memoryDurable();
    for (let index = 0; index < SYNC_TARGET_MAX_SITE_ITEMS; index += 1) {
      sync.data[`site:cold-${index}.example`] = {
        schemaVersion: 1,
        lastUsedAt: index,
        overrides: { speed: { kind: 'value', value: 1.25, updatedAt: 1 } },
      };
    }
    await persistSiteSpeed('https://www.youtube.com/watch', 1.75, {
      sync,
      local: memoryDurable(),
      now: () => now,
    });
    const siteKeys = Object.keys(sync.data).filter((key) => key.startsWith('site:'));
    expect(siteKeys).toHaveLength(SYNC_TARGET_MAX_SITE_ITEMS);
    expect(sync.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { value: 1.75 } },
    });
    expect(sync.data['site:cold-0.example']).toBeUndefined();
  });

  it('reconciles a successful write that exceeds the soft byte target', async () => {
    const sync = memoryDurable({
      'site:cold.example': {
        schemaVersion: 1,
        lastUsedAt: 1,
        overrides: { speed: { kind: 'value', value: 1.25, updatedAt: 1 } },
      },
      'site:warm.example': {
        schemaVersion: 1,
        lastUsedAt: 2,
        overrides: { speed: { kind: 'value', value: 1.25, updatedAt: 1 } },
      },
    });
    const store = {
      ...sync,
      async getBytesInUse() {
        const count = Object.keys(sync.data).filter((key) => key.startsWith('site:')).length;
        return count > 2 ? SYNC_TARGET_MAX_BYTES + 1 : 1_000;
      },
    };
    await persistSiteSpeed('https://www.youtube.com/watch', 1.75, {
      sync: store,
      local: memoryDurable(),
      now: () => 50,
    });
    expect(sync.data['site:www.youtube.com']).toBeDefined();
    expect(sync.data['site:cold.example']).toBeUndefined();
  });

  it('prunes expired inherit fields before evicting a live record', async () => {
    const now = SITE_INHERIT_SYNC_RETENTION_MS + 50;
    const sync = memoryDurable({
      'site:www.youtube.com': {
        schemaVersion: 1,
        lastUsedAt: now,
        overrides: {
          speed: { kind: 'value', value: 1.75, updatedAt: now },
          overlayPosition: { kind: 'inherit', updatedAt: 0 },
        },
      },
    });
    const store = {
      ...sync,
      async getBytesInUse() {
        const record = sync.data['site:www.youtube.com'] as
          { overrides?: { overlayPosition?: unknown } } | undefined;
        return record?.overrides?.overlayPosition ? SYNC_TARGET_MAX_BYTES + 1 : 1_000;
      },
    };
    await reconcileSyncHotSet(store, now);
    expect(sync.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { value: 1.75 } },
    });
    expect(
      (sync.data['site:www.youtube.com'] as { overrides: Record<string, unknown> }).overrides
        .overlayPosition,
    ).toBeUndefined();
  });

  it('counts invalid site records toward capacity and removes them first', async () => {
    const sync = memoryDurable();
    for (let index = 0; index < SYNC_TARGET_MAX_SITE_ITEMS - 1; index += 1) {
      sync.data[`site:keep-${index}.example`] = {
        schemaVersion: 1,
        lastUsedAt: index,
        overrides: { speed: { kind: 'value', value: 1.25, updatedAt: 1 } },
      };
    }
    sync.data['site:old.example'] = { schemaVersion: 1, speed: 3.25 };
    sync.data['site:empty.example'] = { schemaVersion: 1, lastUsedAt: 1, overrides: {} };
    await reconcileSyncHotSet(sync, 10);
    expect(sync.data['site:old.example']).toBeUndefined();
    expect(sync.data['site:empty.example']).toBeUndefined();
    expect(sync.data['site:keep-0.example']).toBeDefined();
  });

  it('does not evict retained inherit tombstones when still over the soft target', async () => {
    const now = 1_000;
    const sync = memoryDurable();
    for (let index = 0; index < SYNC_TARGET_MAX_SITE_ITEMS + 5; index += 1) {
      sync.data[`site:reset-${index}.example`] = {
        schemaVersion: 1,
        lastUsedAt: index,
        overrides: { speed: { kind: 'inherit', updatedAt: now } },
      };
    }
    await reconcileSyncHotSet(sync, now);
    expect(Object.keys(sync.data).filter((key) => key.startsWith('site:'))).toHaveLength(
      SYNC_TARGET_MAX_SITE_ITEMS + 5,
    );
  });

  it('protects the triggering site when lastUsedAt values tie', async () => {
    const now = 50;
    const sync = memoryDurable();
    for (let index = 0; index < SYNC_TARGET_MAX_SITE_ITEMS; index += 1) {
      sync.data[`site:peer-${index}.example`] = {
        schemaVersion: 1,
        lastUsedAt: now,
        overrides: { speed: { kind: 'value', value: 1.25, updatedAt: 1 } },
      };
    }
    await persistSiteSpeed('https://www.youtube.com/watch', 1.75, {
      sync,
      local: memoryDurable(),
      now: () => now,
    });
    expect(sync.data['site:www.youtube.com']).toBeDefined();
    expect(Object.keys(sync.data).filter((key) => key.startsWith('site:'))).toHaveLength(
      SYNC_TARGET_MAX_SITE_ITEMS,
    );
  });

  it('does not fail persist when post-publication reconcile throws', async () => {
    const sync = memoryDurable();
    const store = {
      ...sync,
      async get(keys?: string | string[] | Record<string, unknown> | null) {
        if (keys == null) {
          throw new Error('get all failed');
        }
        return sync.get(keys);
      },
    };
    await expect(
      persistSiteSpeed('https://www.youtube.com/watch', 1.75, {
        sync: store,
        local: memoryDurable(),
        now: () => 20,
      }),
    ).resolves.toBeUndefined();
    expect(sync.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { value: 1.75 } },
    });
  });

  it('fails persist when capacity recovery reconcile throws', async () => {
    const sync = memoryDurable();
    await expect(
      persistSiteSpeed('https://www.youtube.com/watch', 1.75, {
        sync: {
          ...sync,
          async set() {
            throw new Error('QUOTA_BYTES exceeded');
          },
          async get(keys?: string | string[] | Record<string, unknown> | null) {
            if (keys == null) {
              throw new Error('reconcile failed');
            }
            return sync.get(keys);
          },
        },
        local: memoryDurable(),
        now: () => 20,
      }),
    ).rejects.toThrow(/reconcile failed/);
  });

  it('uses key-inclusive fallback bytes when getBytesInUse throws', async () => {
    const now = 10;
    const sync = memoryDurable();
    const value = {
      schemaVersion: 1 as const,
      lastUsedAt: 1,
      overrides: { speed: { kind: 'value' as const, value: 1.25, updatedAt: 1 } },
    };
    for (let index = 0; index < 90; index += 1) {
      sync.data[`site:${'x'.repeat(800)}-${index}.example`] = { ...value, lastUsedAt: index };
    }
    const store = {
      ...sync,
      async getBytesInUse() {
        throw new Error('bytes unavailable');
      },
    };
    await persistSiteSpeed('https://www.youtube.com/watch', 1.75, {
      sync: store,
      local: memoryDurable(),
      now: () => now,
    });
    expect(sync.data['site:www.youtube.com']).toBeDefined();
    expect(sync.data[`site:${'x'.repeat(800)}-0.example`]).toBeUndefined();
  });

  it('leaves an expired Sync inherit in place when the hot set is under target', async () => {
    const now = SITE_INHERIT_SYNC_RETENTION_MS + 10;
    const record = {
      schemaVersion: 1 as const,
      lastUsedAt: 1,
      overrides: { speed: { kind: 'inherit' as const, updatedAt: 0 } },
    };
    const sync = memoryDurable({ 'site:www.youtube.com': record });
    let writes = 0;
    const store = {
      ...sync,
      async set(items: Record<string, unknown>) {
        writes += 1;
        await sync.set(items);
      },
      async remove(keys: string | string[]) {
        writes += 1;
        await sync.remove(keys);
      },
    };
    await reconcileSyncHotSet(store, now);
    expect(writes).toBe(0);
    expect(sync.data['site:www.youtube.com']).toEqual(record);
  });

  it('allows a new repair one minute after a successful one', async () => {
    const local = memoryDurable({
      'site:www.youtube.com': {
        schemaVersion: 1,
        lastUsedAt: 20,
        overrides: { speed: { kind: 'value', value: 1.75, updatedAt: 20 } },
      },
    });
    const sync = memoryDurable({
      'site:www.youtube.com': {
        schemaVersion: 1,
        lastUsedAt: 10,
        overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 10 } },
      },
    });
    await readSiteSpeed('https://www.youtube.com/watch', {
      sync,
      local,
      now: () => 1_000,
    });
    expect(sync.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { value: 1.75, updatedAt: 20 } },
    });
    local.data['site:www.youtube.com'] = {
      schemaVersion: 1,
      lastUsedAt: 20,
      overrides: { speed: { kind: 'value', value: 2, updatedAt: 1_000 + 60_000 } },
    };
    await readSiteSpeed('https://www.youtube.com/watch', {
      sync,
      local,
      now: () => 1_000 + 60_000,
    });
    expect(sync.data['site:www.youtube.com']).toMatchObject({
      overrides: { speed: { value: 2, updatedAt: 1_000 + 60_000 } },
    });
  });

  it('stamps current recency when playback promotes Local into Sync', async () => {
    const now = 5_000;
    const deps = {
      sync: memoryDurable(),
      local: memoryDurable({
        'site:www.youtube.com': {
          schemaVersion: 1,
          lastUsedAt: 1,
          overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 1 } },
        },
      }),
      now: () => now,
      touchUsage: true,
    };
    await readSiteSpeed('https://www.youtube.com/watch', deps);
    expect(deps.sync.data['site:www.youtube.com']).toMatchObject({ lastUsedAt: now });
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({ lastUsedAt: 1 });
  });

  it('stamps current recency when playback restores Sync into Local', async () => {
    const now = LOCAL_LRU_THROTTLE_MS + 80;
    const deps = {
      sync: memoryDurable({
        'site:www.youtube.com': {
          schemaVersion: 1,
          lastUsedAt: 1,
          overrides: { speed: { kind: 'value', value: 1.5, updatedAt: 1 } },
        },
      }),
      local: memoryDurable(),
      now: () => now,
      touchUsage: true,
    };
    await readSiteSpeed('https://www.youtube.com/watch', deps);
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({
      lastUsedAt: now,
      overrides: { speed: { value: 1.5, updatedAt: 1 } },
    });
  });

  it('does not restore pre-merge Local overrides after repair plus touch', async () => {
    const now = LOCAL_LRU_THROTTLE_MS + 80;
    const deps = {
      sync: memoryDurable({
        'site:www.youtube.com': {
          schemaVersion: 1,
          lastUsedAt: 40,
          overrides: { speed: { kind: 'value', value: 1.75, updatedAt: 40 } },
        },
      }),
      local: memoryDurable({
        'site:www.youtube.com': {
          schemaVersion: 1,
          lastUsedAt: 1,
          overrides: { speed: { kind: 'value', value: 1.25, updatedAt: 10 } },
        },
      }),
      now: () => now,
      touchUsage: true,
    };
    await readSiteSpeed('https://www.youtube.com/watch', deps);
    expect(deps.local.data['site:www.youtube.com']).toMatchObject({
      lastUsedAt: now,
      overrides: { speed: { kind: 'value', value: 1.75, updatedAt: 40 } },
    });
  });
});

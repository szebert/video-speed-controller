// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import {
  SITE_INHERIT_SYNC_RETENTION_MS,
  SYNC_TARGET_MAX_SITE_ITEMS,
} from '../settings/site-behavior';
import {
  persistGlobalBehaviorChange,
  reconcilePendingGlobalReplicas,
} from '../storage/behavior-defaults';
import { SITE_HLC_KEY } from '../storage/hybrid-clock';
import { GLOBAL_OUTBOX_KEY, SITE_OUTBOX_KEY } from '../storage/replica-outbox';
import { GLOBAL_BEHAVIOR_KEY } from '../settings/site-behavior';
import { SITE_GENERATION_KEY } from '../storage/site-generation';
import {
  deleteAllSiteSettings,
  persistSiteSpeed,
  readSiteSpeed,
  reconcilePendingSiteReplicas,
  reconcileSyncHotSet,
  resetSiteRepairBackoff,
  resolveSiteBehaviorForUrl,
} from '../storage/site-settings';
import { resetStorageMutationQueue } from '../storage/storage-mutation-queue';
import { memoryDurable } from './memory-store';

const YOUTUBE = 'https://www.youtube.com/watch';
const YOUTUBE_KEY = 'site:www.youtube.com';

function pair(now = 1_000) {
  return {
    sync: memoryDurable(),
    local: memoryDurable(),
    now: () => now,
  };
}

function siteRecord(
  speed: number,
  updatedAt: number,
  generation?: number,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    lastUsedAt: updatedAt,
    ...(generation !== undefined ? { generation } : {}),
    overrides: { speed: { kind: 'value', value: speed, updatedAt } },
  };
}

function inheritRecord(updatedAt: number, generation?: number): Record<string, unknown> {
  return {
    schemaVersion: 1,
    lastUsedAt: updatedAt,
    ...(generation !== undefined ? { generation } : {}),
    overrides: { speed: { kind: 'inherit', updatedAt } },
  };
}

describe('storage replica hardening', () => {
  beforeEach(() => {
    resetSiteRepairBackoff();
    resetStorageMutationQueue();
  });

  it('keeps Local state and outbox after a crash before Sync starts', async () => {
    const local = memoryDurable();
    const sync = memoryDurable();
    await persistSiteSpeed(YOUTUBE, 1.75, {
      local,
      sync: {
        ...sync,
        async set() {
          throw new Error('offline');
        },
      },
      now: () => 50,
    });
    expect(local.data[YOUTUBE_KEY]).toMatchObject({
      overrides: { speed: { value: 1.75, updatedAt: 50 } },
    });
    expect(local.data[SITE_OUTBOX_KEY]).toMatchObject({ publishSites: [YOUTUBE_KEY] });
    expect(sync.data[YOUTUBE_KEY]).toBeUndefined();
  });

  it('resolves when Sync succeeds but shrinking the outbox fails, then replay clears it', async () => {
    const local = memoryDurable();
    const sync = memoryDurable();
    let localSets = 0;
    await persistSiteSpeed(YOUTUBE, 1.5, {
      sync,
      local: {
        ...local,
        async set(items) {
          localSets += 1;
          if (localSets > 1 && SITE_OUTBOX_KEY in items) {
            throw new Error('outbox clear failed');
          }
          await local.set(items);
        },
        async remove(keys) {
          if ((typeof keys === 'string' ? [keys] : keys).includes(SITE_OUTBOX_KEY)) {
            throw new Error('outbox clear failed');
          }
          await local.remove(keys);
        },
      },
      now: () => 50,
    });
    expect(sync.data[YOUTUBE_KEY]).toMatchObject({ overrides: { speed: { value: 1.5 } } });
    expect(local.data[SITE_OUTBOX_KEY]).toMatchObject({ publishSites: [YOUTUBE_KEY] });
    await reconcilePendingSiteReplicas({ sync, local, now: () => 50 });
    expect(local.data[SITE_OUTBOX_KEY]).toBeUndefined();
  });

  it('issues 50, 51, 52 on the same wall time and 53 after a Local restart', async () => {
    const deps = pair(50);
    await persistSiteSpeed(YOUTUBE, 1.25, deps);
    await persistSiteSpeed(YOUTUBE, 1.5, deps);
    await persistSiteSpeed(YOUTUBE, 1.75, deps);
    expect(deps.local.data[YOUTUBE_KEY]).toMatchObject({
      overrides: { speed: { updatedAt: 52 } },
    });
    expect(deps.local.data[SITE_HLC_KEY]).toEqual({ schemaVersion: 1, lastIssued: 52 });
    const restarted = {
      sync: memoryDurable({ ...deps.sync.data }),
      local: memoryDurable({ ...deps.local.data }),
      now: () => 50,
    };
    await persistSiteSpeed(YOUTUBE, 2, restarted);
    expect(restarted.local.data[YOUTUBE_KEY]).toMatchObject({
      overrides: { speed: { updatedAt: 53 } },
    });
  });

  it('drops a poison updatedAt and does not advance HLC from it', async () => {
    const deps = pair(50);
    deps.sync.data[YOUTUBE_KEY] = {
      schemaVersion: 1,
      lastUsedAt: 20,
      overrides: { speed: { kind: 'value', value: 3, updatedAt: Number.MAX_SAFE_INTEGER } },
    };
    await persistSiteSpeed(YOUTUBE, 1.25, deps);
    expect(deps.local.data[YOUTUBE_KEY]).toMatchObject({
      overrides: { speed: { value: 1.25, updatedAt: 50 } },
    });
    expect(deps.local.data[SITE_HLC_KEY]).toEqual({ schemaVersion: 1, lastIssued: 50 });
  });

  it('ignores a gen-6 site with a huge timestamp once epoch is 7', async () => {
    const deps = pair(10);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7 };
    deps.sync.data[YOUTUBE_KEY] = siteRecord(2, 1e12, 6);
    deps.local.data[YOUTUBE_KEY] = siteRecord(2, 1e12, 6);
    await expect(readSiteSpeed(YOUTUBE, deps)).resolves.toBe(1);
    await persistSiteSpeed(YOUTUBE, 1.5, { ...deps, now: () => 20 });
    expect(deps.local.data[YOUTUBE_KEY]).toMatchObject({
      generation: 7,
      overrides: { speed: { value: 1.5, updatedAt: 1e12 + 1 } },
    });
  });

  it('does not remove Sync site keys until Reset All generation is published', async () => {
    const deps = pair(50);
    await persistSiteSpeed(YOUTUBE, 1.25, deps);
    const existing = deps.sync.data[YOUTUBE_KEY];
    await deleteAllSiteSettings({
      ...deps,
      now: () => 200,
      sync: {
        ...deps.sync,
        async set(items) {
          if (SITE_GENERATION_KEY in items) {
            throw new Error('generation publish failed');
          }
          await deps.sync.set(items);
        },
      },
    });
    expect(deps.local.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 1 });
    expect(deps.local.data[SITE_OUTBOX_KEY]).toMatchObject({
      resetAll: { epoch: 1, cleanupPending: true },
    });
    expect(deps.sync.data[YOUTUBE_KEY]).toEqual(existing);
  });

  it('leaves stale Sync keys logically invisible after generation publish if cleanup crashes', async () => {
    const deps = pair(50);
    await persistSiteSpeed(YOUTUBE, 1.25, deps);
    await deleteAllSiteSettings({
      ...deps,
      now: () => 200,
      sync: {
        ...deps.sync,
        async remove() {
          throw new Error('cleanup crashed');
        },
      },
    });
    expect(deps.sync.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 1 });
    expect(deps.sync.data[YOUTUBE_KEY]).toBeDefined();
    await expect(readSiteSpeed(YOUTUBE, { ...deps, now: () => 200 })).resolves.toBe(1);
  });

  it('keeps site and global dirty keys from clobbering each other', async () => {
    const local = memoryDurable();
    const sync = memoryDurable();
    const failing = {
      ...sync,
      async set() {
        throw new Error('offline');
      },
    };
    await persistSiteSpeed(YOUTUBE, 1.25, { local, sync: failing, now: () => 10 });
    await persistGlobalBehaviorChange(
      { kind: 'value', field: 'speed', value: 1.5 },
      { local, sync: failing, now: () => 11 },
    );
    expect(local.data[SITE_OUTBOX_KEY]).toMatchObject({ publishSites: [YOUTUBE_KEY] });
    expect(local.data[GLOBAL_OUTBOX_KEY]).toMatchObject({ publish: true });
  });

  it('evicts a future-skewed inherit tombstone on hard-capacity recovery', async () => {
    const now = 1_000;
    const sync = memoryDurable();
    for (let index = 0; index < SYNC_TARGET_MAX_SITE_ITEMS + 1; index += 1) {
      sync.data[`site:skewed-${index}.example`] = inheritRecord(1e12 + index, 0);
    }
    await reconcileSyncHotSet(sync, now);
    expect(Object.keys(sync.data).filter((key) => key.startsWith('site:'))).toHaveLength(
      SYNC_TARGET_MAX_SITE_ITEMS + 1,
    );
    await reconcileSyncHotSet(sync, now, { mode: 'capacity' });
    expect(Object.keys(sync.data).filter((key) => key.startsWith('site:'))).toHaveLength(
      SYNC_TARGET_MAX_SITE_ITEMS,
    );
  });

  it('replays Reset All by publishing generation first, then cleaning Sync without tombstone republish', async () => {
    const deps = pair(50);
    await persistSiteSpeed(YOUTUBE, 1.25, deps);
    deps.local.data['site:local-only.example'] = siteRecord(2, 40, 0);
    let allowCleanup = false;
    const sync = {
      ...deps.sync,
      async set(items: Record<string, unknown>) {
        await deps.sync.set(items);
      },
      async remove(keys: string | string[]) {
        if (!allowCleanup) {
          throw new Error('cleanup not yet');
        }
        await deps.sync.remove(keys);
      },
    };
    await deleteAllSiteSettings({ ...deps, sync, now: () => 200 });
    expect(deps.sync.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 1 });
    expect(deps.sync.data[YOUTUBE_KEY]).toBeDefined();
    expect(deps.sync.data['site:local-only.example']).toBeUndefined();
    expect(deps.local.data[SITE_OUTBOX_KEY]).toMatchObject({
      resetAll: { epoch: 1, cleanupPending: true },
    });
    allowCleanup = true;
    await reconcilePendingSiteReplicas({ ...deps, sync, now: () => 200 });
    expect(deps.sync.data[YOUTUBE_KEY]).toBeUndefined();
    expect(deps.sync.data['site:local-only.example']).toBeUndefined();
    expect(deps.local.data[YOUTUBE_KEY]).toMatchObject({
      overrides: { speed: { kind: 'inherit' } },
    });
  });

  it('publishes generation before a post-reset gen-N site edit', async () => {
    const order: string[] = [];
    const deps = pair(50);
    await persistSiteSpeed(YOUTUBE, 1.25, deps);
    await deleteAllSiteSettings({
      ...deps,
      now: () => 200,
      sync: {
        ...deps.sync,
        async set(items) {
          if (SITE_GENERATION_KEY in items) {
            throw new Error('generation publish failed');
          }
          await deps.sync.set(items);
        },
      },
    });
    const sync = {
      ...deps.sync,
      async set(items: Record<string, unknown>) {
        for (const key of Object.keys(items)) {
          order.push(key);
        }
        await deps.sync.set(items);
      },
    };
    await persistSiteSpeed(YOUTUBE, 1.75, { ...deps, sync, now: () => 300 });
    expect(order.indexOf(SITE_GENERATION_KEY)).toBeGreaterThan(-1);
    expect(order.indexOf(YOUTUBE_KEY)).toBeGreaterThan(order.indexOf(SITE_GENERATION_KEY));
    expect(deps.sync.data[YOUTUBE_KEY]).toMatchObject({ generation: 1 });
  });

  it('does not apply or repair-down a future generation site until metadata catches up', async () => {
    const deps = pair(10);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 6 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 6 };
    deps.sync.data[YOUTUBE_KEY] = siteRecord(2, 20, 7);
    await expect(readSiteSpeed(YOUTUBE, deps)).resolves.toBe(1);
    expect(deps.sync.data[YOUTUBE_KEY]).toMatchObject({
      generation: 7,
      overrides: { speed: { value: 2 } },
    });
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7 };
    await expect(readSiteSpeed(YOUTUBE, deps)).resolves.toBe(2);
  });

  it('drops a pre-reset publishSites key and does not republish the inherit tombstone', async () => {
    const local = memoryDurable();
    const sync = memoryDurable();
    await persistSiteSpeed(YOUTUBE, 1.25, {
      local,
      sync: {
        ...sync,
        async set() {
          throw new Error('offline');
        },
      },
      now: () => 50,
    });
    expect(local.data[SITE_OUTBOX_KEY]).toMatchObject({ publishSites: [YOUTUBE_KEY] });
    await persistSiteSpeed(YOUTUBE, 1.25, { local, sync, now: () => 50 });
    await deleteAllSiteSettings({ local, sync, now: () => 200 });
    expect(local.data[SITE_OUTBOX_KEY]).toBeUndefined();
    expect(sync.data[YOUTUBE_KEY]).toBeUndefined();
    expect(local.data[YOUTUBE_KEY]).toMatchObject({
      overrides: { speed: { kind: 'inherit' } },
    });
    await persistSiteSpeed(YOUTUBE, 1.8, { local, sync, now: () => 300 });
    expect(sync.data[YOUTUBE_KEY]).toMatchObject({
      generation: 1,
      overrides: { speed: { value: 1.8 } },
    });
  });

  it('protects future-generation and generation-unknown records from ordinary LRU', async () => {
    const now = 10;
    const sync = memoryDurable();
    for (let index = 0; index < SYNC_TARGET_MAX_SITE_ITEMS - 1; index += 1) {
      sync.data[`site:keep-${index}.example`] = siteRecord(1.25, 100 + index, 0);
    }
    sync.data['site:future.example'] = siteRecord(2, 1, 7);
    sync.data['site:unknown.example'] = {
      schemaVersion: 1,
      lastUsedAt: 0,
      generation: 'nope',
      overrides: { speed: { kind: 'value', value: 2, updatedAt: 1 } },
    };
    sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 0 };
    await reconcileSyncHotSet(sync, now);
    expect(sync.data['site:future.example']).toBeDefined();
    expect(sync.data['site:unknown.example']).toBeDefined();
    const capacity = memoryDurable();
    for (let index = 0; index < SYNC_TARGET_MAX_SITE_ITEMS + 1; index += 1) {
      capacity.data[`site:future-${index}.example`] = siteRecord(2, index, 7);
    }
    capacity.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 0 };
    await reconcileSyncHotSet(capacity, now, { mode: 'capacity' });
    expect(Object.keys(capacity.data).filter((key) => key.startsWith('site:')).length).toBe(
      SYNC_TARGET_MAX_SITE_ITEMS,
    );
  });

  it('does not treat a malformed outbox as empty or flood Local-only sites', async () => {
    const deps = pair(50);
    deps.local.data[SITE_OUTBOX_KEY] = { schemaVersion: 1, publishSites: 'bad' };
    deps.local.data['site:local-only.example'] = siteRecord(2, 40);
    deps.sync.data[YOUTUBE_KEY] = siteRecord(1.25, 10);
    await persistSiteSpeed(YOUTUBE, 1.75, deps);
    expect(deps.sync.data['site:local-only.example']).toBeUndefined();
    expect(deps.sync.data[YOUTUBE_KEY]).toMatchObject({ overrides: { speed: { value: 1.75 } } });
  });

  it('clears an obsolete gen-7 publish obligation after a remote Reset All to 8', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7 };
    deps.local.data[YOUTUBE_KEY] = siteRecord(2, 20, 7);
    deps.local.data[SITE_OUTBOX_KEY] = {
      schemaVersion: 1,
      publishSites: [YOUTUBE_KEY],
    };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 8 };
    await reconcilePendingSiteReplicas(deps);
    expect(deps.sync.data[YOUTUBE_KEY]).toBeUndefined();
    expect(deps.local.data[SITE_OUTBOX_KEY]).toBeUndefined();
    expect(deps.local.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 8 });
  });

  it('does not invent generation 7 from a future site while metadata is 6', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 6 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 6 };
    deps.local.data[YOUTUBE_KEY] = siteRecord(2, 20, 7);
    deps.local.data[SITE_OUTBOX_KEY] = { schemaVersion: 1, publishSites: [YOUTUBE_KEY] };
    await reconcilePendingSiteReplicas(deps);
    expect(deps.sync.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 6 });
    expect(deps.sync.data[YOUTUBE_KEY]).toBeUndefined();
    expect(deps.local.data[SITE_OUTBOX_KEY]).toMatchObject({ publishSites: [YOUTUBE_KEY] });
  });

  it('fails Reset All closed when generation metadata is unknown', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 'nope' };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 'nope' };
    deps.sync.data[YOUTUBE_KEY] = siteRecord(2, 10);
    await expect(deleteAllSiteSettings(deps)).rejects.toThrow(/generation metadata is unknown/i);
    expect(deps.sync.data[YOUTUBE_KEY]).toBeDefined();
    expect(deps.sync.data[SITE_GENERATION_KEY]).toEqual({ schemaVersion: 1, epoch: 'nope' });
  });

  it('merges a valid epoch 8 when only optional updatedAt is malformed', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7 };
    deps.sync.data[SITE_GENERATION_KEY] = {
      schemaVersion: 1,
      epoch: 8,
      updatedAt: 'broken',
    };
    await persistSiteSpeed(YOUTUBE, 1.25, deps);
    expect(deps.local.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 8 });
    expect(deps.local.data[YOUTUBE_KEY]).toMatchObject({ generation: 8 });
  });

  it('does not overwrite unsupported generation or dirty metadata', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 2, epoch: 9 };
    await expect(persistSiteSpeed(YOUTUBE, 1.25, deps)).rejects.toThrow(
      /generation metadata is unknown/i,
    );
    expect(deps.sync.data[SITE_GENERATION_KEY]).toEqual({ schemaVersion: 2, epoch: 9 });

    const dirty = pair(50);
    dirty.local.data[SITE_OUTBOX_KEY] = { schemaVersion: 2, publishSites: [YOUTUBE_KEY] };
    await expect(persistSiteSpeed(YOUTUBE, 1.25, dirty)).rejects.toThrow(
      /outbox metadata is unsupported/i,
    );
    expect(dirty.local.data[SITE_OUTBOX_KEY]).toEqual({
      schemaVersion: 2,
      publishSites: [YOUTUBE_KEY],
    });
  });

  it('does not replace unsupported HLC metadata or issue a lower timestamp', async () => {
    const deps = pair(50);
    deps.local.data[SITE_HLC_KEY] = { schemaVersion: 2, lastIssued: 999 };
    await expect(persistSiteSpeed(YOUTUBE, 1.25, deps)).rejects.toThrow(
      /clock metadata is unusable/i,
    );
    expect(deps.local.data[SITE_HLC_KEY]).toEqual({ schemaVersion: 2, lastIssued: 999 });
    expect(deps.local.data[YOUTUBE_KEY]).toBeUndefined();
  });

  it('treats absent generation as 0 and Reset All produces epoch 1', async () => {
    const deps = pair(50);
    await persistSiteSpeed(YOUTUBE, 1.25, deps);
    await deleteAllSiteSettings({ ...deps, now: () => 200 });
    expect(deps.local.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 1 });
    expect(deps.sync.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 1 });
  });

  it('does not coerce corrupt Local generation plus absent Sync to epoch 0', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: Number.MAX_SAFE_INTEGER };
    await expect(deleteAllSiteSettings(deps)).rejects.toThrow(/generation metadata is unknown/i);
    expect(deps.local.data[SITE_GENERATION_KEY]).toEqual({
      schemaVersion: 1,
      epoch: Number.MAX_SAFE_INTEGER,
    });
  });

  it('keeps a malformed site generation through ordinary reconcile and does not apply it', async () => {
    const deps = pair(10);
    const raw = {
      schemaVersion: 1,
      lastUsedAt: 1,
      generation: 'nope',
      overrides: { speed: { kind: 'value', value: 2, updatedAt: 1 } },
    };
    deps.sync.data[YOUTUBE_KEY] = raw;
    deps.local.data[YOUTUBE_KEY] = raw;
    await expect(readSiteSpeed(YOUTUBE, deps)).resolves.toBe(1);
    expect(deps.sync.data[YOUTUBE_KEY]).toEqual(raw);
    const sync = memoryDurable();
    for (let index = 0; index < SYNC_TARGET_MAX_SITE_ITEMS - 1; index += 1) {
      sync.data[`site:keep-${index}.example`] = siteRecord(1.25, index, 0);
    }
    sync.data[YOUTUBE_KEY] = raw;
    await reconcileSyncHotSet(sync, 10);
    expect(sync.data[YOUTUBE_KEY]).toEqual(raw);
  });

  it('repairs Local generation up to Sync 8 and does not regress when Sync disappears', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 8 };
    await persistSiteSpeed(YOUTUBE, 1.25, deps);
    expect(deps.local.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 8 });
    delete deps.sync.data[SITE_GENERATION_KEY];
    await persistSiteSpeed(YOUTUBE, 1.5, { ...deps, now: () => 80 });
    expect(deps.local.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 8 });
    expect(deps.local.data[YOUTUBE_KEY]).toMatchObject({ generation: 8 });
  });

  it('never writes a lower Sync generation onto Local', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 8 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7 };
    await persistSiteSpeed(YOUTUBE, 1.25, deps);
    expect(deps.local.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 8 });
    expect(deps.sync.data[SITE_GENERATION_KEY]).toMatchObject({ epoch: 8 });
  });

  it('falls back to defaults when merged generation is unknown', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 2, epoch: 9 };
    deps.sync.data[YOUTUBE_KEY] = siteRecord(2, 20, 7);
    deps.local.data[YOUTUBE_KEY] = siteRecord(2, 20, 7);
    const resolved = await resolveSiteBehaviorForUrl(YOUTUBE, { ...deps, touchUsage: false });
    expect(resolved?.speed).toEqual({ value: 1, source: 'built-in' });
    expect(deps.local.data[YOUTUBE_KEY]).toMatchObject({
      generation: 7,
      overrides: { speed: { value: 2 } },
    });
  });

  it('retires a superseded pending resetAll without publishing the old epoch', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 8 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 8 };
    deps.local.data[SITE_OUTBOX_KEY] = {
      schemaVersion: 1,
      publishSites: [],
      resetAll: { epoch: 7, cleanupPending: true },
    };
    deps.sync.data[YOUTUBE_KEY] = siteRecord(2, 10, 8);
    await reconcilePendingSiteReplicas(deps);
    expect(deps.sync.data[SITE_GENERATION_KEY]).toEqual({ schemaVersion: 1, epoch: 8 });
    expect(deps.sync.data[YOUTUBE_KEY]).toBeDefined();
    expect(deps.local.data[SITE_OUTBOX_KEY]).toBeUndefined();
  });

  it('does not invent a pending resetAll epoch ahead of merged generation', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 7 };
    deps.local.data[SITE_OUTBOX_KEY] = {
      schemaVersion: 1,
      publishSites: [],
      resetAll: { epoch: 8, cleanupPending: true },
    };
    deps.sync.data[YOUTUBE_KEY] = siteRecord(2, 10, 7);
    await reconcilePendingSiteReplicas(deps);
    expect(deps.sync.data[SITE_GENERATION_KEY]).toEqual({ schemaVersion: 1, epoch: 7 });
    expect(deps.sync.data[YOUTUBE_KEY]).toBeDefined();
    expect(deps.local.data[SITE_OUTBOX_KEY]).toMatchObject({
      resetAll: { epoch: 8, cleanupPending: true },
    });
  });

  it('does not fail persist when Local succeeds and only Sync is unavailable', async () => {
    const local = memoryDurable();
    await persistSiteSpeed(YOUTUBE, 1.25, {
      local,
      sync: {
        ...memoryDurable(),
        async set() {
          throw new Error('offline');
        },
      },
      now: () => 50,
    });
    expect(local.data[YOUTUBE_KEY]).toMatchObject({ overrides: { speed: { value: 1.25 } } });
  });

  it('does not evict retained inherit tombstones on the soft pass', async () => {
    const now = 1_000;
    const sync = memoryDurable();
    for (let index = 0; index < SYNC_TARGET_MAX_SITE_ITEMS + 5; index += 1) {
      sync.data[`site:reset-${index}.example`] = inheritRecord(now, 0);
    }
    await reconcileSyncHotSet(sync, now);
    expect(Object.keys(sync.data).filter((key) => key.startsWith('site:'))).toHaveLength(
      SYNC_TARGET_MAX_SITE_ITEMS + 5,
    );
  });

  it('does not treat a future-skewed tombstone as blocking capacity recovery', async () => {
    const now = 1_000;
    const sync = memoryDurable();
    for (let index = 0; index < SYNC_TARGET_MAX_SITE_ITEMS; index += 1) {
      sync.data[`site:skewed-${index}.example`] = inheritRecord(1e12 + index, 0);
    }
    let attempts = 0;
    await persistSiteSpeed(YOUTUBE, 1.75, {
      sync: {
        ...sync,
        async set(items) {
          attempts += 1;
          if (attempts < 3 && !(SITE_GENERATION_KEY in items && Object.keys(items).length === 1)) {
            throw new Error('QUOTA_BYTES exceeded');
          }
          await sync.set(items);
        },
      },
      local: memoryDurable(),
      now: () => now,
    });
    expect(sync.data[YOUTUBE_KEY]).toBeDefined();
    expect(attempts).toBeGreaterThanOrEqual(3);
  });

  it('merges current-generation Sync LWW fields instead of publishing stale Local', async () => {
    const local = memoryDurable();
    const sync = memoryDurable();
    await persistSiteSpeed(YOUTUBE, 1.5, {
      local,
      sync: {
        ...sync,
        async set() {
          throw new Error('offline');
        },
      },
      now: () => 100,
    });
    sync.data[YOUTUBE_KEY] = siteRecord(2, 200, 0);
    await reconcilePendingSiteReplicas({ local, sync, now: () => 100 });
    expect(sync.data[YOUTUBE_KEY]).toMatchObject({
      overrides: { speed: { value: 2, updatedAt: 200 } },
    });
    expect(local.data[YOUTUBE_KEY]).toMatchObject({
      overrides: { speed: { value: 2, updatedAt: 200 } },
    });
  });

  it('does not overwrite a future-generation Sync site with an eligible Local copy', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 6 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 6 };
    deps.local.data[YOUTUBE_KEY] = siteRecord(1.5, 100, 6);
    deps.local.data[SITE_OUTBOX_KEY] = { schemaVersion: 1, publishSites: [YOUTUBE_KEY] };
    deps.sync.data[YOUTUBE_KEY] = siteRecord(2, 200, 7);
    await reconcilePendingSiteReplicas(deps);
    expect(deps.sync.data[YOUTUBE_KEY]).toMatchObject({
      generation: 7,
      overrides: { speed: { value: 2, updatedAt: 200 } },
    });
    expect(deps.local.data[YOUTUBE_KEY]).toMatchObject({
      generation: 6,
      overrides: { speed: { value: 1.5, updatedAt: 100 } },
    });
    expect(deps.local.data[SITE_OUTBOX_KEY]).toMatchObject({ publishSites: [YOUTUBE_KEY] });
  });

  it('does not repair-down a future Sync site when Local is eligible at the observed epoch', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 6 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 6 };
    deps.local.data[YOUTUBE_KEY] = siteRecord(1.5, 100, 6);
    deps.sync.data[YOUTUBE_KEY] = siteRecord(2, 200, 7);
    await expect(readSiteSpeed(YOUTUBE, deps)).resolves.toBe(1.5);
    expect(deps.sync.data[YOUTUBE_KEY]).toMatchObject({
      generation: 7,
      overrides: { speed: { value: 2, updatedAt: 200 } },
    });
    expect(deps.local.data[YOUTUBE_KEY]).toMatchObject({
      generation: 6,
      overrides: { speed: { value: 1.5, updatedAt: 100 } },
    });
  });

  it('does not prune a future inherit tombstone during soft hot-set projection', async () => {
    const now = SITE_INHERIT_SYNC_RETENTION_MS + 50_000;
    const sync = memoryDurable();
    for (let index = 0; index < SYNC_TARGET_MAX_SITE_ITEMS; index += 1) {
      sync.data[`site:keep-${index}.example`] = siteRecord(1.25, now, 6);
    }
    sync.data['site:future-inherit.example'] = inheritRecord(1, 7);
    sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 6 };
    await reconcileSyncHotSet(sync, now);
    expect(sync.data['site:future-inherit.example']).toEqual(inheritRecord(1, 7));
  });

  it('does not downgrade or delete an unsupported Sync site during replay', async () => {
    const deps = pair(50);
    deps.local.data[YOUTUBE_KEY] = siteRecord(1.5, 100);
    deps.local.data[SITE_OUTBOX_KEY] = { schemaVersion: 1, publishSites: [YOUTUBE_KEY] };
    deps.sync.data[YOUTUBE_KEY] = { schemaVersion: 2, lastUsedAt: 1, overrides: { extra: true } };
    await reconcilePendingSiteReplicas(deps);
    expect(deps.sync.data[YOUTUBE_KEY]).toEqual({
      schemaVersion: 2,
      lastUsedAt: 1,
      overrides: { extra: true },
    });
    expect(deps.local.data[SITE_OUTBOX_KEY]).toMatchObject({ publishSites: [YOUTUBE_KEY] });

    const missingLocal = pair(50);
    missingLocal.local.data[SITE_OUTBOX_KEY] = { schemaVersion: 1, publishSites: [YOUTUBE_KEY] };
    missingLocal.sync.data[YOUTUBE_KEY] = {
      schemaVersion: 2,
      lastUsedAt: 1,
      overrides: { extra: true },
    };
    await reconcilePendingSiteReplicas(missingLocal);
    expect(missingLocal.sync.data[YOUTUBE_KEY]).toEqual({
      schemaVersion: 2,
      lastUsedAt: 1,
      overrides: { extra: true },
    });
    expect(missingLocal.local.data[SITE_OUTBOX_KEY]).toMatchObject({
      publishSites: [YOUTUBE_KEY],
    });
  });

  it('keeps a dirty opaque skip-list site obligated through Reset All and replay', async () => {
    const deps = pair(50);
    await persistSiteSpeed('https://vimeo.com/1', 1.5, deps);
    const opaque = {
      schemaVersion: 1,
      lastUsedAt: 1,
      overrides: {
        speed: { kind: 'value' as const, value: 2, updatedAt: 1 },
        seekInterval: { kind: 'value', value: 10, updatedAt: 1 },
      },
    };
    deps.local.data[YOUTUBE_KEY] = opaque;
    deps.local.data[SITE_OUTBOX_KEY] = { schemaVersion: 1, publishSites: [YOUTUBE_KEY] };
    const result = await deleteAllSiteSettings({ ...deps, now: () => 200 });
    expect(result).toEqual({ skippedRecordCount: 1 });
    expect(deps.local.data[YOUTUBE_KEY]).toMatchObject({
      overrides: { speed: { value: 2 }, seekInterval: { value: 10 } },
    });
    expect(deps.sync.data[YOUTUBE_KEY]).toMatchObject({
      overrides: { speed: { value: 2 }, seekInterval: { value: 10 } },
    });
    expect(deps.local.data['site:vimeo.com']).toMatchObject({
      overrides: { speed: { kind: 'inherit', updatedAt: 200 } },
    });
  });

  it('retains a corrupt outbox when Sync-resident recovery is incomplete', async () => {
    const deps = pair(50);
    deps.local.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 1 };
    deps.sync.data[SITE_GENERATION_KEY] = { schemaVersion: 1, epoch: 1 };
    deps.local.data[SITE_OUTBOX_KEY] = { schemaVersion: 1, publishSites: 'bad' };
    deps.sync.data['site:other.example'] = siteRecord(2, 10, 0);
    await expect(
      persistSiteSpeed(YOUTUBE, 1.75, {
        ...deps,
        sync: {
          ...deps.sync,
          async remove() {
            throw new Error('offline');
          },
        },
      }),
    ).rejects.toThrow(/outbox metadata is corrupt/i);
    expect(deps.local.data[SITE_OUTBOX_KEY]).toEqual({ schemaVersion: 1, publishSites: 'bad' });
    expect(deps.sync.data['site:other.example']).toBeDefined();
    expect(deps.local.data[YOUTUBE_KEY]).toBeUndefined();
  });

  it('merges current Sync and Local global fields during outbox replay', async () => {
    const local = memoryDurable();
    const sync = memoryDurable();
    await persistGlobalBehaviorChange(
      { kind: 'value', field: 'speed', value: 1.5 },
      {
        local,
        sync: {
          ...sync,
          async set() {
            throw new Error('offline');
          },
        },
        now: () => 50,
      },
    );
    sync.data[GLOBAL_BEHAVIOR_KEY] = {
      schemaVersion: 1,
      overrides: { speed: { kind: 'value', value: 2, updatedAt: 200 } },
    };
    await reconcilePendingGlobalReplicas({ local, sync, now: () => 50 });
    expect(sync.data[GLOBAL_BEHAVIOR_KEY]).toMatchObject({
      overrides: { speed: { kind: 'value', value: 2, updatedAt: 200 } },
    });
    expect(local.data[GLOBAL_BEHAVIOR_KEY]).toMatchObject({
      overrides: { speed: { kind: 'value', value: 2, updatedAt: 200 } },
    });
    expect(local.data[GLOBAL_OUTBOX_KEY]).toBeUndefined();
  });
});

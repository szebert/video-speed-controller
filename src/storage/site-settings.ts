// SPDX-License-Identifier: GPL-3.0-only

/**
 * After a site inherit tombstone ages out of Sync, an extremely long-offline
 * device may retain an older Local live override and later re-promote that
 * stale live value if the Sync field is absent. The system cannot distinguish
 * that from a legitimate Local value whose Sync copy was evicted from the
 * bounded hot set. This is an accepted consequence of best-effort reset
 * propagation without an unbounded deletion ledger. During
 * SITE_INHERIT_SYNC_RETENTION_MS the inherit tombstone prevents resurrection.
 */

import {
  LOCAL_LRU_THROTTLE_MS,
  REPAIR_BACKOFF_MS,
  SYNC_LRU_STALE_MS,
  SYNC_TARGET_MAX_BYTES,
  SYNC_TARGET_MAX_SITE_ITEMS,
  behaviorOverridesEqual,
  mergeBehaviorOverrides,
  parseSiteSettings,
  resolveSiteBehavior,
  toEffectiveBehavior,
  toSyncEligibleSiteRecord,
  hasSemanticOverrides,
  hasSyncRetainedInherit,
  withSpeedInherit,
  withSpeedValue,
  type BehaviorOverrides,
  type SiteSettingsV1,
} from '../settings/site-behavior';
import { readGlobalBehaviorOverrides } from './behavior-defaults';
import {
  defaultLocalStore,
  defaultSyncStore,
  estimateRecordBytes,
  type DurableSettingsStore,
} from './durable-store';
import { getSiteKey, getSiteStorageKey } from './site-key';

export type { DurableSettingsStore } from './durable-store';

/** @deprecated Use DurableSettingsStore. Kept so older tests can be updated incrementally. */
export type SiteSettingsStore = DurableSettingsStore;

export type StorageClock = () => number;

export type SiteSettingsDeps = {
  sync?: DurableSettingsStore;
  local?: DurableSettingsStore;
  now?: StorageClock;
  touchUsage?: boolean;
};

const siteRepairAttemptedAt = new Map<string, number>();

function stores(deps: SiteSettingsDeps): {
  sync: DurableSettingsStore;
  local: DurableSettingsStore;
  now: StorageClock;
} {
  return {
    sync: deps.sync ?? defaultSyncStore(),
    local: deps.local ?? defaultLocalStore(),
    now: deps.now ?? Date.now,
  };
}

export function resetSiteRepairBackoff(storageKey?: string): void {
  if (storageKey) {
    siteRepairAttemptedAt.delete(storageKey);
    return;
  }
  siteRepairAttemptedAt.clear();
}

export function isCapacityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /QUOTA_BYTES|QUOTA_BYTES_PER_ITEM|MAX_ITEMS/i.test(message);
}

export function isWriteRateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /MAX_WRITE_OPERATIONS/i.test(message);
}

async function readParsedSite(
  store: DurableSettingsStore,
  storageKey: string,
): Promise<SiteSettingsV1 | null> {
  const result = await store.get(storageKey);
  return parseSiteSettings(result[storageKey]);
}

async function writeSyncSite(
  sync: DurableSettingsStore,
  storageKey: string,
  record: SiteSettingsV1,
  now: number,
): Promise<void> {
  const eligible = toSyncEligibleSiteRecord(record, now);
  if (!eligible) {
    await sync.remove(storageKey);
    return;
  }
  await sync.set({ [storageKey]: eligible });
}

async function writeSyncSiteWithCapacityRetry(
  sync: DurableSettingsStore,
  storageKey: string,
  record: SiteSettingsV1,
  now: number,
): Promise<void> {
  try {
    await writeSyncSite(sync, storageKey, record, now);
  } catch (error) {
    if (!isCapacityError(error) || isWriteRateError(error)) {
      throw error;
    }
    await reconcileSyncHotSet(sync, now);
    await writeSyncSite(sync, storageKey, record, now);
  }
}

function isOverTarget(itemCount: number, bytes: number): boolean {
  return itemCount > SYNC_TARGET_MAX_SITE_ITEMS || bytes > SYNC_TARGET_MAX_BYTES;
}

export async function reconcileSyncHotSet(sync: DurableSettingsStore, now: number): Promise<void> {
  const all = await sync.get(null);
  const sites: { key: string; record: SiteSettingsV1 }[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith('site:')) {
      continue;
    }
    const parsed = parseSiteSettings(value);
    if (parsed) {
      sites.push({ key, record: parsed });
    }
  }

  const siteBytes = async (entries: { key: string; record: SiteSettingsV1 }[]): Promise<number> => {
    if (entries.length === 0) {
      return 0;
    }
    try {
      return await sync.getBytesInUse(entries.map((entry) => entry.key));
    } catch {
      return entries.reduce((sum, entry) => sum + estimateRecordBytes(entry.record), 0);
    }
  };

  const over = async (entries: { key: string; record: SiteSettingsV1 }[]): Promise<boolean> =>
    isOverTarget(entries.length, await siteBytes(entries));

  const withoutRetained = sites
    .filter((entry) => !hasSyncRetainedInherit(entry.record.overrides, now))
    .sort((left, right) => left.record.lastUsedAt - right.record.lastUsedAt);

  for (const candidate of withoutRetained) {
    if (!(await over(sites))) {
      break;
    }
    await sync.remove(candidate.key);
    const index = sites.findIndex((entry) => entry.key === candidate.key);
    if (index >= 0) {
      sites.splice(index, 1);
    }
  }

  for (const entry of [...sites]) {
    const projected = toSyncEligibleSiteRecord(entry.record, now);
    if (!projected) {
      await sync.remove(entry.key);
      const index = sites.findIndex((item) => item.key === entry.key);
      if (index >= 0) {
        sites.splice(index, 1);
      }
      continue;
    }
    if (!behaviorOverridesEqual(projected.overrides, entry.record.overrides)) {
      await sync.set({ [entry.key]: projected });
      entry.record = projected;
    }
  }

  const remaining = [...sites].sort(
    (left, right) => left.record.lastUsedAt - right.record.lastUsedAt,
  );
  for (const candidate of remaining) {
    if (!(await over(sites))) {
      break;
    }
    await sync.remove(candidate.key);
    const index = sites.findIndex((entry) => entry.key === candidate.key);
    if (index >= 0) {
      sites.splice(index, 1);
    }
  }
}

async function maybeRepairSite(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
  storageKey: string,
  syncRecord: SiteSettingsV1 | null,
  localRecord: SiteSettingsV1 | null,
  mergedOverrides: BehaviorOverrides,
  now: number,
): Promise<void> {
  const localLastUsedAt = localRecord?.lastUsedAt ?? syncRecord?.lastUsedAt ?? now;
  const canonical: SiteSettingsV1 = {
    schemaVersion: 1,
    overrides: mergedOverrides,
    lastUsedAt: localLastUsedAt,
  };

  if (!localRecord && !hasSemanticOverrides(mergedOverrides)) {
    return;
  }

  if (!localRecord || !behaviorOverridesEqual(localRecord.overrides, mergedOverrides)) {
    try {
      await local.set({
        [storageKey]: {
          ...canonical,
          lastUsedAt: localRecord?.lastUsedAt ?? canonical.lastUsedAt,
        },
      });
    } catch {
      // Local repair must not change the resolved value.
    }
  }

  const syncEligible = toSyncEligibleSiteRecord(canonical, now);
  const syncComparable = syncRecord ? toSyncEligibleSiteRecord(syncRecord, now) : null;
  const syncNeedsRepair =
    Boolean(syncEligible) &&
    (!syncComparable || !behaviorOverridesEqual(syncComparable.overrides, syncEligible!.overrides));

  if (!syncNeedsRepair) {
    return;
  }

  const last = siteRepairAttemptedAt.get(storageKey);
  if (last != null && now - last < REPAIR_BACKOFF_MS) {
    return;
  }
  siteRepairAttemptedAt.set(storageKey, now);
  try {
    await writeSyncSiteWithCapacityRetry(sync, storageKey, canonical, now);
  } catch {
    // Sync repair failure is ignored on read.
  }
}

async function touchExistingSite(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
  storageKey: string,
  syncRecord: SiteSettingsV1 | null,
  localRecord: SiteSettingsV1 | null,
  mergedOverrides: BehaviorOverrides,
  now: number,
): Promise<void> {
  if (!syncRecord && !localRecord) {
    return;
  }
  if (!hasSemanticOverrides(mergedOverrides) && !syncRecord && !localRecord) {
    return;
  }

  if (localRecord && now - localRecord.lastUsedAt >= LOCAL_LRU_THROTTLE_MS) {
    try {
      await local.set({
        [storageKey]: {
          schemaVersion: 1,
          overrides: localRecord.overrides,
          lastUsedAt: now,
        },
      });
    } catch {
      // LRU must not fail the read.
    }
  }

  if (syncRecord && now - syncRecord.lastUsedAt >= SYNC_LRU_STALE_MS) {
    try {
      await writeSyncSite(
        sync,
        storageKey,
        { schemaVersion: 1, overrides: syncRecord.overrides, lastUsedAt: now },
        now,
      );
    } catch {
      // LRU must not fail the read.
    }
  }
}

async function loadMergedSite(
  url: string,
  deps: SiteSettingsDeps,
): Promise<{
  storageKey: string;
  syncRecord: SiteSettingsV1 | null;
  localRecord: SiteSettingsV1 | null;
  mergedOverrides: BehaviorOverrides;
  globalOverrides: BehaviorOverrides;
  now: number;
  sync: DurableSettingsStore;
  local: DurableSettingsStore;
} | null> {
  const siteKey = getSiteKey(url);
  if (!siteKey.supported) {
    return null;
  }
  const { sync, local, now } = stores(deps);
  const at = now();
  const storageKey = getSiteStorageKey(siteKey);
  const [syncRecord, localRecord, globalOverrides] = await Promise.all([
    readParsedSite(sync, storageKey),
    readParsedSite(local, storageKey),
    readGlobalBehaviorOverrides({ sync, local, now }),
  ]);
  const mergedOverrides = mergeBehaviorOverrides(
    syncRecord?.overrides ?? {},
    localRecord?.overrides ?? {},
  );
  return {
    storageKey,
    syncRecord,
    localRecord,
    mergedOverrides,
    globalOverrides,
    now: at,
    sync,
    local,
  };
}

export async function resolveSiteBehaviorForUrl(
  url: string,
  deps: SiteSettingsDeps = {},
): Promise<ReturnType<typeof resolveSiteBehavior> | null> {
  const loaded = await loadMergedSite(url, deps);
  if (!loaded) {
    return null;
  }
  await maybeRepairSite(
    loaded.sync,
    loaded.local,
    loaded.storageKey,
    loaded.syncRecord,
    loaded.localRecord,
    loaded.mergedOverrides,
    loaded.now,
  );
  if (deps.touchUsage) {
    await touchExistingSite(
      loaded.sync,
      loaded.local,
      loaded.storageKey,
      loaded.syncRecord,
      loaded.localRecord,
      loaded.mergedOverrides,
      loaded.now,
    );
  }
  return resolveSiteBehavior(loaded.globalOverrides, loaded.mergedOverrides);
}

export async function readSiteSpeed(
  url: string,
  deps: SiteSettingsDeps = {},
): Promise<number | null> {
  const resolved = await resolveSiteBehaviorForUrl(url, deps);
  return resolved ? toEffectiveBehavior(resolved).speed : null;
}

export async function resolveSpeedAfterSiteInherit(
  url: string,
  deps: SiteSettingsDeps = {},
): Promise<number> {
  const loaded = await loadMergedSite(url, deps);
  if (!loaded) {
    throw new Error('Cannot persist siteSpeed for an unsupported page');
  }
  const prospective = withSpeedInherit(loaded.mergedOverrides, loaded.now);
  return toEffectiveBehavior(resolveSiteBehavior(loaded.globalOverrides, prospective)).speed;
}

async function persistMutatedSite(
  url: string,
  mutate: (current: BehaviorOverrides, now: number) => BehaviorOverrides,
  deps: SiteSettingsDeps = {},
): Promise<void> {
  const loaded = await loadMergedSite(url, deps);
  if (!loaded) {
    throw new Error('Cannot persist siteSpeed for an unsupported page');
  }
  const nextOverrides = mutate(loaded.mergedOverrides, loaded.now);
  const record: SiteSettingsV1 = {
    schemaVersion: 1,
    overrides: nextOverrides,
    lastUsedAt: loaded.now,
  };

  const [localResult, syncResult] = await Promise.all([
    loaded.local.set({ [loaded.storageKey]: record }).then(
      () => undefined,
      (error: unknown) => error,
    ),
    writeSyncSiteWithCapacityRetry(loaded.sync, loaded.storageKey, record, loaded.now).then(
      () => undefined,
      (error: unknown) => error,
    ),
  ]);
  const failure = localResult ?? syncResult;
  if (failure instanceof Error) {
    throw failure;
  }
  if (failure) {
    throw new Error('Failed to persist siteSpeed');
  }
}

export async function persistSiteSpeed(
  url: string,
  speed: number,
  deps: SiteSettingsDeps = {},
): Promise<void> {
  if (!Number.isFinite(speed)) {
    throw new Error('Speed must be a finite number');
  }
  await persistMutatedSite(url, (current, now) => withSpeedValue(current, speed, now), deps);
}

export async function persistSiteSpeedInherit(
  url: string,
  deps: SiteSettingsDeps = {},
): Promise<void> {
  await persistMutatedSite(url, (current, now) => withSpeedInherit(current, now), deps);
}

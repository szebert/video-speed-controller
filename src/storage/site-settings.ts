// SPDX-License-Identifier: GPL-3.0-only

/**
 * After a site inherit tombstone ages out of Sync, an extremely long-offline
 * device may retain an older Local live override and later re-promote that
 * stale live value if the Sync field is absent. The system cannot distinguish
 * that from a legitimate Local value whose Sync copy was evicted from the
 * bounded hot set. This is an accepted consequence of best-effort reset
 * propagation without an unbounded deletion ledger. During
 * SITE_INHERIT_SYNC_RETENTION_MS the inherit tombstone prevents resurrection.
 *
 * Site inherit retention is a minimum protection window, not an exact TTL.
 * Expired tombstones may remain in Sync while the hot set is under the soft
 * target. They are stripped from subsequent publication of that record and
 * pruned when capacity pressure exists. Expired Local tombstones remain
 * durable Local state and must never be promoted back into absent Sync.
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
  applyBehaviorSettingChange,
  hasValueOverrides,
  tombstoneExistingSiteFields,
  type BehaviorSettingChange,
  type BehaviorOverrides,
  type SiteSettingsV1,
} from '../settings/site-behavior';
import { normalizeSiteHostname } from '../settings/site-hostname';
import { readGlobalBehaviorOverrides } from './behavior-defaults';
import {
  defaultLocalStore,
  defaultSyncStore,
  estimateStorageEntryBytes,
  type DurableSettingsStore,
} from './durable-store';
import { getSiteKey, getSiteStorageKey, hostnameFromSiteStorageKey } from './site-key';
import { SITE_SETTINGS_LOCK, enqueueStorageMutation } from './storage-mutation-queue';

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

const siteRepairFailedAt = new Map<string, number>();

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
    siteRepairFailedAt.delete(storageKey);
    return;
  }
  siteRepairFailedAt.clear();
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

type RawSiteEntry = {
  key: string;
  raw: unknown;
  record: SiteSettingsV1 | null;
};

async function listRawSiteEntries(sync: DurableSettingsStore): Promise<RawSiteEntry[]> {
  const all = await sync.get(null);
  const entries: RawSiteEntry[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith('site:')) {
      continue;
    }
    entries.push({ key, raw: value, record: parseSiteSettings(value) });
  }
  return entries;
}

async function measureSiteBytes(
  sync: DurableSettingsStore,
  entries: RawSiteEntry[],
): Promise<number> {
  if (entries.length === 0) {
    return 0;
  }
  try {
    return await sync.getBytesInUse(entries.map((entry) => entry.key));
  } catch {
    return entries.reduce((sum, entry) => sum + estimateStorageEntryBytes(entry.key, entry.raw), 0);
  }
}

function isOverTarget(itemCount: number, bytes: number): boolean {
  return itemCount > SYNC_TARGET_MAX_SITE_ITEMS || bytes > SYNC_TARGET_MAX_BYTES;
}

async function reconcileSyncHotSetUnlocked(
  sync: DurableSettingsStore,
  now: number,
  options?: { protectedKey?: string },
): Promise<void> {
  let entries = await listRawSiteEntries(sync);
  if (!isOverTarget(entries.length, await measureSiteBytes(sync, entries))) {
    return;
  }

  for (const entry of entries) {
    if (!entry.record) {
      await sync.remove(entry.key);
    }
  }
  entries = await listRawSiteEntries(sync);
  if (!isOverTarget(entries.length, await measureSiteBytes(sync, entries))) {
    return;
  }

  for (const entry of entries) {
    if (!entry.record) {
      continue;
    }
    const projected = toSyncEligibleSiteRecord(entry.record, now);
    if (!projected) {
      await sync.remove(entry.key);
      continue;
    }
    if (!behaviorOverridesEqual(projected.overrides, entry.record.overrides)) {
      await sync.set({ [entry.key]: projected });
    }
  }
  entries = await listRawSiteEntries(sync);
  if (!isOverTarget(entries.length, await measureSiteBytes(sync, entries))) {
    return;
  }

  const evictable = entries
    .filter((entry) => {
      if (options?.protectedKey && entry.key === options.protectedKey) {
        return false;
      }
      if (!entry.record) {
        return true;
      }
      return !hasSyncRetainedInherit(entry.record.overrides, now);
    })
    .sort((left, right) => (left.record?.lastUsedAt ?? 0) - (right.record?.lastUsedAt ?? 0));

  for (const candidate of evictable) {
    if (!isOverTarget(entries.length, await measureSiteBytes(sync, entries))) {
      break;
    }
    await sync.remove(candidate.key);
    entries = entries.filter((entry) => entry.key !== candidate.key);
  }
}

export async function reconcileSyncHotSet(
  sync: DurableSettingsStore,
  now: number,
  options?: { protectedKey?: string },
): Promise<void> {
  return enqueueStorageMutation(SITE_SETTINGS_LOCK, () =>
    reconcileSyncHotSetUnlocked(sync, now, options),
  );
}

async function publishSyncSite(
  sync: DurableSettingsStore,
  storageKey: string,
  record: SiteSettingsV1,
  now: number,
): Promise<void> {
  const eligible = toSyncEligibleSiteRecord(record, now);
  const write = async (): Promise<'set' | 'removed'> => {
    if (!eligible) {
      await sync.remove(storageKey);
      return 'removed';
    }
    await sync.set({ [storageKey]: eligible });
    return 'set';
  };

  let result: 'set' | 'removed';
  try {
    result = await write();
  } catch (error) {
    if (!isCapacityError(error) || isWriteRateError(error)) {
      throw error;
    }
    await reconcileSyncHotSetUnlocked(sync, now);
    result = await write();
  }

  if (result === 'set') {
    try {
      await reconcileSyncHotSetUnlocked(sync, now, { protectedKey: storageKey });
    } catch {
      // Post-publication maintenance must not fail a successful Sync write.
    }
  }
}

async function maybeRepairAndTouchSite(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
  storageKey: string,
  syncRecord: SiteSettingsV1 | null,
  localRecord: SiteSettingsV1 | null,
  mergedOverrides: BehaviorOverrides,
  now: number,
  touchUsage: boolean,
): Promise<void> {
  if (!localRecord && !syncRecord && !hasSemanticOverrides(mergedOverrides)) {
    return;
  }

  const localLastUsedAt = touchUsage
    ? now
    : (localRecord?.lastUsedAt ?? syncRecord?.lastUsedAt ?? now);
  const shouldWriteLocal =
    Boolean(localRecord || hasSemanticOverrides(mergedOverrides) || (touchUsage && syncRecord)) &&
    (!localRecord ||
      !behaviorOverridesEqual(localRecord.overrides, mergedOverrides) ||
      (touchUsage && now - localRecord.lastUsedAt >= LOCAL_LRU_THROTTLE_MS));

  if (shouldWriteLocal) {
    try {
      await local.set({
        [storageKey]: {
          schemaVersion: 1,
          overrides: mergedOverrides,
          lastUsedAt: localLastUsedAt,
        },
      });
    } catch {
      // Local repair must not change the resolved value.
    }
  }

  const canonical: SiteSettingsV1 = {
    schemaVersion: 1,
    overrides: mergedOverrides,
    lastUsedAt: touchUsage ? now : (localRecord?.lastUsedAt ?? syncRecord?.lastUsedAt ?? now),
  };
  const syncEligible = toSyncEligibleSiteRecord(canonical, now);
  const syncComparable = syncRecord ? toSyncEligibleSiteRecord(syncRecord, now) : null;
  const syncNeedsRepair =
    Boolean(syncEligible) &&
    (!syncComparable || !behaviorOverridesEqual(syncComparable.overrides, syncEligible!.overrides));
  const syncNeedsTouch =
    touchUsage && syncRecord != null && now - syncRecord.lastUsedAt >= SYNC_LRU_STALE_MS;

  if (syncNeedsRepair) {
    const lastFail = siteRepairFailedAt.get(storageKey);
    if (lastFail != null && now - lastFail < REPAIR_BACKOFF_MS) {
      return;
    }
    try {
      await publishSyncSite(sync, storageKey, canonical, now);
      siteRepairFailedAt.delete(storageKey);
    } catch {
      siteRepairFailedAt.set(storageKey, now);
    }
    return;
  }

  if (syncNeedsTouch) {
    try {
      await publishSyncSite(
        sync,
        storageKey,
        { schemaVersion: 1, overrides: mergedOverrides, lastUsedAt: now },
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
  return enqueueStorageMutation(SITE_SETTINGS_LOCK, async () => {
    const loaded = await loadMergedSite(url, deps);
    if (!loaded) {
      return null;
    }
    await maybeRepairAndTouchSite(
      loaded.sync,
      loaded.local,
      loaded.storageKey,
      loaded.syncRecord,
      loaded.localRecord,
      loaded.mergedOverrides,
      loaded.now,
      Boolean(deps.touchUsage),
    );
    return resolveSiteBehavior(loaded.globalOverrides, loaded.mergedOverrides);
  });
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
  return enqueueStorageMutation(SITE_SETTINGS_LOCK, async () => {
    const loaded = await loadMergedSite(url, deps);
    if (!loaded) {
      throw new Error('Cannot persist siteSpeed for an unsupported page');
    }
    const prospective = withSpeedInherit(loaded.mergedOverrides, loaded.now);
    return toEffectiveBehavior(resolveSiteBehavior(loaded.globalOverrides, prospective)).speed;
  });
}

async function persistMutatedSite(
  url: string,
  mutate: (current: BehaviorOverrides, now: number) => BehaviorOverrides,
  deps: SiteSettingsDeps = {},
): Promise<void> {
  return enqueueStorageMutation(SITE_SETTINGS_LOCK, async () => {
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
      publishSyncSite(loaded.sync, loaded.storageKey, record, loaded.now).then(
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
  });
}

export async function persistSiteBehaviorChange(
  url: string,
  change: BehaviorSettingChange,
  deps: SiteSettingsDeps = {},
): Promise<void> {
  await persistMutatedSite(
    url,
    (current, now) => applyBehaviorSettingChange(current, change, now),
    deps,
  );
}

export async function persistSiteSpeed(
  url: string,
  speed: number,
  deps: SiteSettingsDeps = {},
): Promise<void> {
  if (!Number.isFinite(speed)) {
    throw new Error('Speed must be a finite number');
  }
  await persistSiteBehaviorChange(url, { kind: 'value', field: 'speed', value: speed }, deps);
}

export async function persistSiteSpeedInherit(
  url: string,
  deps: SiteSettingsDeps = {},
): Promise<void> {
  await persistSiteBehaviorChange(url, { kind: 'inherit', field: 'speed' }, deps);
}

function mergedOverridesForKey(
  syncAll: Record<string, unknown>,
  localAll: Record<string, unknown>,
  key: string,
): BehaviorOverrides {
  return mergeBehaviorOverrides(
    parseSiteSettings(syncAll[key])?.overrides ?? {},
    parseSiteSettings(localAll[key])?.overrides ?? {},
  );
}

async function writeSiteRecordUnlocked(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
  storageKey: string,
  record: SiteSettingsV1,
  now: number,
): Promise<void> {
  const [localResult, syncResult] = await Promise.all([
    local.set({ [storageKey]: record }).then(
      () => undefined,
      (error: unknown) => error,
    ),
    publishSyncSite(sync, storageKey, record, now).then(
      () => undefined,
      (error: unknown) => error,
    ),
  ]);
  const failure = localResult ?? syncResult;
  if (failure instanceof Error) {
    throw failure;
  }
  if (failure) {
    throw new Error('Failed to persist site settings');
  }
}

function tombstoneMergedSite(merged: BehaviorOverrides, now: number): SiteSettingsV1 | null {
  const overrides = tombstoneExistingSiteFields(merged, now);
  if (!hasSemanticOverrides(overrides)) {
    return null;
  }
  return { schemaVersion: 1, overrides, lastUsedAt: now };
}

export async function readSiteMembership(
  hostname: string,
  deps: SiteSettingsDeps = {},
): Promise<boolean> {
  const normalized = normalizeSiteHostname(hostname);
  if (!normalized) {
    return false;
  }
  return enqueueStorageMutation(SITE_SETTINGS_LOCK, async () => {
    const { sync, local } = stores(deps);
    const storageKey = getSiteStorageKey({ supported: true, hostname: normalized });
    const [syncAll, localAll] = await Promise.all([sync.get(storageKey), local.get(storageKey)]);
    return hasValueOverrides(mergedOverridesForKey(syncAll, localAll, storageKey));
  });
}

export async function listCustomSiteHostnames(deps: SiteSettingsDeps = {}): Promise<string[]> {
  return enqueueStorageMutation(SITE_SETTINGS_LOCK, async () => {
    const { sync, local } = stores(deps);
    const [syncAll, localAll] = await Promise.all([sync.get(null), local.get(null)]);
    const hostnames = new Set<string>();
    const keys = new Set([...Object.keys(syncAll), ...Object.keys(localAll)]);
    for (const key of keys) {
      const hostname = hostnameFromSiteStorageKey(key);
      if (!hostname || !normalizeSiteHostname(hostname)) {
        continue;
      }
      const merged = mergedOverridesForKey(syncAll, localAll, key);
      if (hasValueOverrides(merged)) {
        hostnames.add(hostname);
      }
    }
    return [...hostnames].sort((left, right) => left.localeCompare(right));
  });
}

export async function deleteSiteSettings(
  hostname: string,
  deps: SiteSettingsDeps = {},
): Promise<void> {
  const normalized = normalizeSiteHostname(hostname);
  if (!normalized) {
    throw new Error('Cannot delete settings for an unsupported hostname');
  }
  return enqueueStorageMutation(SITE_SETTINGS_LOCK, async () => {
    const { sync, local, now } = stores(deps);
    const at = now();
    const storageKey = getSiteStorageKey({ supported: true, hostname: normalized });
    const [syncAll, localAll] = await Promise.all([sync.get(storageKey), local.get(storageKey)]);
    const record = tombstoneMergedSite(mergedOverridesForKey(syncAll, localAll, storageKey), at);
    if (!record) {
      return;
    }
    await writeSiteRecordUnlocked(sync, local, storageKey, record, at);
  });
}

export async function deleteAllSiteSettings(deps: SiteSettingsDeps = {}): Promise<void> {
  return enqueueStorageMutation(SITE_SETTINGS_LOCK, async () => {
    const { sync, local, now } = stores(deps);
    const at = now();
    const [syncAll, localAll] = await Promise.all([sync.get(null), local.get(null)]);
    const keys = [
      ...new Set(
        [...Object.keys(syncAll), ...Object.keys(localAll)].filter((key) =>
          key.startsWith('site:'),
        ),
      ),
    ];
    for (const key of keys) {
      const record = tombstoneMergedSite(mergedOverridesForKey(syncAll, localAll, key), at);
      if (!record) {
        continue;
      }
      await writeSiteRecordUnlocked(sync, local, key, record, at);
    }
  });
}

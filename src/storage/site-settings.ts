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
  resolveSiteBehavior,
  toEffectiveBehavior,
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
import {
  SETTINGS_CREATED_BY_NEWER_VERSION,
  extrasForDestination,
  emptyOpaqueFields,
  migrateSiteSettings,
  projectSyncEligibleSite,
  resetAllResult,
  serializeSiteRecord,
  serializedRecordsEqual,
  type OpaqueFields,
  type ResetAllResult,
  type SettingsParseResult,
} from '../settings/migrate';
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

type StorageClock = () => number;

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

function readyExtras(parsed: SettingsParseResult<SiteSettingsV1>): OpaqueFields {
  return parsed.status === 'ready' ? parsed.extras : emptyOpaqueFields();
}

function readyRecord(parsed: SettingsParseResult<SiteSettingsV1>): SiteSettingsV1 | null {
  return parsed.status === 'ready' ? parsed.record : null;
}

function isUnsupportedCopy(parsed: SettingsParseResult<SiteSettingsV1>): boolean {
  return parsed.status === 'unsupported';
}

function siteKnownAndExtrasEqual(
  left: SiteSettingsV1,
  leftExtras: OpaqueFields,
  right: SiteSettingsV1,
  rightExtras: OpaqueFields,
): boolean {
  return (
    behaviorOverridesEqual(left.overrides, right.overrides) &&
    serializedRecordsEqual(leftExtras, rightExtras)
  );
}

function assertCanPersistSite(
  syncParsed: SettingsParseResult<SiteSettingsV1>,
  localParsed: SettingsParseResult<SiteSettingsV1>,
): void {
  if (isUnsupportedCopy(syncParsed) && isUnsupportedCopy(localParsed)) {
    throw new Error(SETTINGS_CREATED_BY_NEWER_VERSION);
  }
}

function assertCanDestroySite(
  syncParsed: SettingsParseResult<SiteSettingsV1>,
  localParsed: SettingsParseResult<SiteSettingsV1>,
): void {
  if (isUnsupportedCopy(syncParsed) || isUnsupportedCopy(localParsed)) {
    throw new Error(SETTINGS_CREATED_BY_NEWER_VERSION);
  }
}

type RawSiteEntry = {
  key: string;
  raw: unknown;
  parsed: SettingsParseResult<SiteSettingsV1>;
};

async function listRawSiteEntries(sync: DurableSettingsStore): Promise<RawSiteEntry[]> {
  const all = await sync.get(null);
  const entries: RawSiteEntry[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith('site:')) {
      continue;
    }
    entries.push({ key, raw: value, parsed: migrateSiteSettings(value) });
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
    if (entry.parsed.status === 'invalid') {
      await sync.remove(entry.key);
    }
  }
  entries = await listRawSiteEntries(sync);
  if (!isOverTarget(entries.length, await measureSiteBytes(sync, entries))) {
    return;
  }

  for (const entry of entries) {
    if (entry.parsed.status !== 'ready') {
      continue;
    }
    const projected = projectSyncEligibleSite(entry.parsed.record, entry.parsed.extras, now);
    if (!projected) {
      await sync.remove(entry.key);
      continue;
    }
    const expected = serializeSiteRecord(projected.record, projected.extras);
    if (!serializedRecordsEqual(entry.raw, expected)) {
      await sync.set({ [entry.key]: expected });
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
      if (entry.parsed.status === 'unsupported') {
        return false;
      }
      if (entry.parsed.status !== 'ready') {
        return true;
      }
      return !hasSyncRetainedInherit(entry.parsed.record.overrides, now);
    })
    .sort(
      (left, right) =>
        (readyRecord(left.parsed)?.lastUsedAt ?? 0) - (readyRecord(right.parsed)?.lastUsedAt ?? 0),
    );

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

async function writeSyncEligibleUnlocked(
  sync: DurableSettingsStore,
  storageKey: string,
  record: SiteSettingsV1,
  extras: OpaqueFields,
  now: number,
): Promise<'set' | 'removed'> {
  const eligible = projectSyncEligibleSite(record, extras, now);
  if (!eligible) {
    await sync.remove(storageKey);
    return 'removed';
  }
  await sync.set({ [storageKey]: serializeSiteRecord(eligible.record, eligible.extras) });
  return 'set';
}

async function publishSyncSite(
  sync: DurableSettingsStore,
  storageKey: string,
  record: SiteSettingsV1,
  extras: OpaqueFields,
  now: number,
): Promise<void> {
  const write = (): Promise<'set' | 'removed'> =>
    writeSyncEligibleUnlocked(sync, storageKey, record, extras, now);

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

type LoadedSite = {
  storageKey: string;
  syncParsed: SettingsParseResult<SiteSettingsV1>;
  localParsed: SettingsParseResult<SiteSettingsV1>;
  syncRecord: SiteSettingsV1 | null;
  localRecord: SiteSettingsV1 | null;
  syncExtras: OpaqueFields;
  localExtras: OpaqueFields;
  mergedOverrides: BehaviorOverrides;
  globalOverrides: BehaviorOverrides;
  now: number;
  sync: DurableSettingsStore;
  local: DurableSettingsStore;
};

async function maybeRepairAndTouchSite(loaded: LoadedSite, touchUsage: boolean): Promise<void> {
  const {
    sync,
    local,
    storageKey,
    syncParsed,
    localParsed,
    syncRecord,
    localRecord,
    syncExtras,
    localExtras,
    mergedOverrides,
    now,
  } = loaded;

  if (isUnsupportedCopy(syncParsed) && isUnsupportedCopy(localParsed)) {
    return;
  }
  if (!localRecord && !syncRecord && !hasSemanticOverrides(mergedOverrides)) {
    return;
  }

  const localLastUsedAt = touchUsage
    ? now
    : (localRecord?.lastUsedAt ?? syncRecord?.lastUsedAt ?? now);
  const canonical: SiteSettingsV1 = {
    schemaVersion: 1,
    overrides: mergedOverrides,
    lastUsedAt: touchUsage ? now : (localRecord?.lastUsedAt ?? syncRecord?.lastUsedAt ?? now),
  };

  if (!isUnsupportedCopy(localParsed)) {
    const destExtras = extrasForDestination('local', syncExtras, localExtras);
    const shouldWriteLocal =
      Boolean(localRecord || hasSemanticOverrides(mergedOverrides) || (touchUsage && syncRecord)) &&
      (!localRecord ||
        !siteKnownAndExtrasEqual(
          localRecord,
          localExtras,
          { schemaVersion: 1, overrides: mergedOverrides, lastUsedAt: localLastUsedAt },
          destExtras,
        ) ||
        (touchUsage && now - localRecord.lastUsedAt >= LOCAL_LRU_THROTTLE_MS));
    if (shouldWriteLocal) {
      try {
        await local.set({
          [storageKey]: serializeSiteRecord(
            { schemaVersion: 1, overrides: mergedOverrides, lastUsedAt: localLastUsedAt },
            destExtras,
          ),
        });
      } catch {
        // Local repair must not change the resolved value.
      }
    }
  }

  if (isUnsupportedCopy(syncParsed)) {
    return;
  }

  const syncDestExtras = extrasForDestination('sync', syncExtras, localExtras);
  const expectedEligible = projectSyncEligibleSite(canonical, syncDestExtras, now);
  const currentEligible = syncRecord ? projectSyncEligibleSite(syncRecord, syncExtras, now) : null;
  const syncNeedsRepair =
    Boolean(expectedEligible) &&
    (!currentEligible ||
      !siteKnownAndExtrasEqual(
        currentEligible.record,
        currentEligible.extras,
        expectedEligible!.record,
        expectedEligible!.extras,
      ));
  const syncNeedsTouch =
    touchUsage && syncRecord != null && now - syncRecord.lastUsedAt >= SYNC_LRU_STALE_MS;

  if (syncNeedsRepair) {
    const lastFail = siteRepairFailedAt.get(storageKey);
    if (lastFail != null && now - lastFail < REPAIR_BACKOFF_MS) {
      return;
    }
    try {
      await publishSyncSite(sync, storageKey, canonical, syncDestExtras, now);
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
        syncDestExtras,
        now,
      );
    } catch {
      // LRU must not fail the read.
    }
  }
}

async function loadMergedSite(url: string, deps: SiteSettingsDeps): Promise<LoadedSite | null> {
  const siteKey = getSiteKey(url);
  if (!siteKey.supported) {
    return null;
  }
  const { sync, local, now } = stores(deps);
  const at = now();
  const storageKey = getSiteStorageKey(siteKey);
  const [syncAll, localAll, globalOverrides] = await Promise.all([
    sync.get(storageKey),
    local.get(storageKey),
    readGlobalBehaviorOverrides({ sync, local, now }),
  ]);
  const syncParsed = migrateSiteSettings(syncAll[storageKey]);
  const localParsed = migrateSiteSettings(localAll[storageKey]);
  const syncRecord = readyRecord(syncParsed);
  const localRecord = readyRecord(localParsed);
  return {
    storageKey,
    syncParsed,
    localParsed,
    syncRecord,
    localRecord,
    syncExtras: readyExtras(syncParsed),
    localExtras: readyExtras(localParsed),
    mergedOverrides: mergeBehaviorOverrides(
      syncRecord?.overrides ?? {},
      localRecord?.overrides ?? {},
    ),
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
    await maybeRepairAndTouchSite(loaded, Boolean(deps.touchUsage));
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

async function writePersistedSides(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
  storageKey: string,
  record: SiteSettingsV1,
  syncParsed: SettingsParseResult<SiteSettingsV1>,
  localParsed: SettingsParseResult<SiteSettingsV1>,
  syncExtras: OpaqueFields,
  localExtras: OpaqueFields,
  now: number,
): Promise<void> {
  assertCanPersistSite(syncParsed, localParsed);
  const writes: Promise<unknown>[] = [];
  if (!isUnsupportedCopy(localParsed)) {
    writes.push(
      local
        .set({
          [storageKey]: serializeSiteRecord(
            record,
            extrasForDestination('local', syncExtras, localExtras),
          ),
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        ),
    );
  }
  if (!isUnsupportedCopy(syncParsed)) {
    writes.push(
      publishSyncSite(
        sync,
        storageKey,
        record,
        extrasForDestination('sync', syncExtras, localExtras),
        now,
      ).then(
        () => undefined,
        (error: unknown) => error,
      ),
    );
  }
  const results = await Promise.all(writes);
  const failure = results.find((result) => result != null);
  if (failure instanceof Error) {
    throw failure;
  }
  if (failure) {
    throw new Error('Failed to persist site settings');
  }
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
    const record: SiteSettingsV1 = {
      schemaVersion: 1,
      overrides: mutate(loaded.mergedOverrides, loaded.now),
      lastUsedAt: loaded.now,
    };
    await writePersistedSides(
      loaded.sync,
      loaded.local,
      loaded.storageKey,
      record,
      loaded.syncParsed,
      loaded.localParsed,
      loaded.syncExtras,
      loaded.localExtras,
      loaded.now,
    );
  });
}

export async function persistSiteBehaviorChanges(
  url: string,
  changes: readonly BehaviorSettingChange[],
  deps: SiteSettingsDeps = {},
): Promise<void> {
  await persistMutatedSite(
    url,
    (current, now) => {
      let next = current;
      for (const change of changes) {
        next = applyBehaviorSettingChange(next, change, now);
      }
      return next;
    },
    deps,
  );
}

export async function persistSiteBehaviorChange(
  url: string,
  change: BehaviorSettingChange,
  deps: SiteSettingsDeps = {},
): Promise<void> {
  await persistSiteBehaviorChanges(url, [change], deps);
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

function copiesForKey(
  syncAll: Record<string, unknown>,
  localAll: Record<string, unknown>,
  key: string,
): {
  syncParsed: SettingsParseResult<SiteSettingsV1>;
  localParsed: SettingsParseResult<SiteSettingsV1>;
  merged: BehaviorOverrides;
} {
  const syncParsed = migrateSiteSettings(syncAll[key]);
  const localParsed = migrateSiteSettings(localAll[key]);
  return {
    syncParsed,
    localParsed,
    merged: mergeBehaviorOverrides(
      readyRecord(syncParsed)?.overrides ?? {},
      readyRecord(localParsed)?.overrides ?? {},
    ),
  };
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
    return hasValueOverrides(copiesForKey(syncAll, localAll, storageKey).merged);
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
      if (hasValueOverrides(copiesForKey(syncAll, localAll, key).merged)) {
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
    const copies = copiesForKey(syncAll, localAll, storageKey);
    assertCanDestroySite(copies.syncParsed, copies.localParsed);
    const record = tombstoneMergedSite(copies.merged, at);
    if (!record) {
      return;
    }
    await writePersistedSides(
      sync,
      local,
      storageKey,
      record,
      copies.syncParsed,
      copies.localParsed,
      readyExtras(copies.syncParsed),
      readyExtras(copies.localParsed),
      at,
    );
  });
}

async function writeSyncSiteBatchUnlocked(
  sync: DurableSettingsStore,
  records: ReadonlyArray<{ key: string; record: SiteSettingsV1; extras: OpaqueFields }>,
  now: number,
): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const apply = async (): Promise<void> => {
    const items: Record<string, unknown> = {};
    const removals: string[] = [];
    for (const { key, record, extras } of records) {
      const eligible = projectSyncEligibleSite(record, extras, now);
      if (!eligible) {
        removals.push(key);
        continue;
      }
      items[key] = serializeSiteRecord(eligible.record, eligible.extras);
    }
    if (Object.keys(items).length > 0) {
      await sync.set(items);
    }
    if (removals.length > 0) {
      await sync.remove(removals);
    }
  };

  try {
    await apply();
  } catch (error) {
    if (!isCapacityError(error) || isWriteRateError(error)) {
      throw error;
    }
    await reconcileSyncHotSetUnlocked(sync, now);
    await apply();
  }

  try {
    await reconcileSyncHotSetUnlocked(sync, now);
  } catch {
    // Post-publication maintenance must not fail a successful Sync write.
  }
}

export async function deleteAllSiteSettings(deps: SiteSettingsDeps = {}): Promise<ResetAllResult> {
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
    const localItems: Record<string, unknown> = {};
    const syncRecords: { key: string; record: SiteSettingsV1; extras: OpaqueFields }[] = [];
    let skippedNewerVersionCount = 0;
    for (const key of keys) {
      const copies = copiesForKey(syncAll, localAll, key);
      if (isUnsupportedCopy(copies.syncParsed) || isUnsupportedCopy(copies.localParsed)) {
        skippedNewerVersionCount += 1;
        continue;
      }
      const record = tombstoneMergedSite(copies.merged, at);
      if (!record) {
        continue;
      }
      localItems[key] = serializeSiteRecord(
        record,
        extrasForDestination(
          'local',
          readyExtras(copies.syncParsed),
          readyExtras(copies.localParsed),
        ),
      );
      if (Object.prototype.hasOwnProperty.call(syncAll, key)) {
        syncRecords.push({
          key,
          record,
          extras: extrasForDestination(
            'sync',
            readyExtras(copies.syncParsed),
            readyExtras(copies.localParsed),
          ),
        });
      }
    }
    if (Object.keys(localItems).length > 0) {
      await local.set(localItems);
    }
    await writeSyncSiteBatchUnlocked(sync, syncRecords, at);
    return resetAllResult(skippedNewerVersionCount);
  });
}

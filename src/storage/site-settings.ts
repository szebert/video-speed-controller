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
 * Site inherit retention is a minimum / best-effort window under the hybrid
 * clock, not an exact wall-clock TTL. Observing a clock-ahead peer can inflate
 * later updatedAt values and stretch the nominal 30 days. Expired tombstones
 * may remain in Sync while the hot set is under the soft target. They are
 * stripped from subsequent publication of that record and pruned when
 * capacity pressure exists. Expired Local tombstones remain durable Local
 * state and must never be promoted back into absent Sync. Hard-capacity
 * last-resort inherit eviction is what prevents a future-skewed tombstone
 * from permanently wedging Sync.
 *
 * Reset All resurrection is fenced by per-record generation among
 * generation-aware builds. Individual-delete resurrection after tombstone
 * expiry or eviction remains the accepted bounded-ledger limit. An older
 * build that predates meta:site-generation can still re-publish a Local
 * override after a new client removes Sync site keys; generation-aware
 * clients treat that republish as generation 0 and ignore it.
 */

import {
  LOCAL_LRU_THROTTLE_MS,
  REPAIR_BACKOFF_MS,
  SYNC_LRU_STALE_MS,
  behaviorOverridesEqual,
  mergeBehaviorOverrides,
  resolveSiteBehavior,
  toEffectiveBehavior,
  hasSemanticOverrides,
  withSpeedInherit,
  applyBehaviorSettingChange,
  hasValueOverrides,
  tombstoneExistingSiteFields,
  type BehaviorSettingChange,
  type BehaviorOverrides,
  type SiteSettingsV1,
} from '../settings/site-behavior';
import { cannotSafelyDestroy } from '../settings/destroy-policy';
import {
  SETTINGS_CREATED_BY_NEWER_VERSION,
  extrasForDestination,
  emptyOpaqueFields,
  migrateSiteSettings,
  projectSyncEligibleSite,
  serializeSiteRecord,
  serializedRecordsEqual,
  type OpaqueFields,
  type SettingsParseResult,
} from '../settings/migrate';
import { checkedIncrement, isLogicalValue } from '../settings/logical-value';
import { normalizeSiteHostname } from '../settings/site-hostname';
import { readGlobalBehaviorOverrides } from './behavior-defaults';
import { defaultLocalStore, defaultSyncStore, type DurableSettingsStore } from './durable-store';
import type { ControlMetadataParse } from './control-metadata';
import {
  SITE_HLC_KEY,
  assertHybridClockUsable,
  collectOverrideTimestamps,
  issueHybridTimestamp,
  parseHybridClockRecord,
} from './hybrid-clock';
import {
  SITE_OUTBOX_KEY,
  REPLICA_OUTBOX_CORRUPT,
  addPublishSite,
  applyResetAllToOutbox,
  parseSiteReplicaOutbox,
  serializeSiteOutbox,
  usableSiteOutbox,
  type SiteReplicaOutbox,
} from './replica-outbox';
import {
  SITE_GENERATION_KEY,
  assertKnownGeneration,
  generationUpdatedAt,
  mergeGenerationEpochs,
  parseSiteGenerationRecord,
  replicaNeedsGenerationRepair,
  serializeSiteGeneration,
  shouldApplySiteCopy,
  type MergedGeneration,
  type SiteGenerationRecord,
} from './site-generation';
import {
  isCapacityError,
  isWriteRateError,
  mustPreserveSyncCopy,
  publishSyncSite,
  reconcileSyncHotSetUnlocked,
  recoverCorruptSiteOutbox,
  replaySiteOutboxUnlocked,
  repairGenerationUpward,
  type ReconcileHotSetOptions,
} from './site-replica-sync';
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

export { isCapacityError, isWriteRateError };

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
    left.generation === right.generation &&
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
  if (cannotSafelyDestroy(syncParsed) || cannotSafelyDestroy(localParsed)) {
    throw new Error(SETTINGS_CREATED_BY_NEWER_VERSION);
  }
}

function appliedOverrides(
  parsed: SettingsParseResult<SiteSettingsV1>,
  raw: unknown,
  merged: MergedGeneration,
): BehaviorOverrides {
  return shouldApplySiteCopy(parsed, raw, merged) ? (readyRecord(parsed)?.overrides ?? {}) : {};
}

function withReadGeneration(record: SiteSettingsV1, epoch: number | undefined): SiteSettingsV1 {
  if (epoch === undefined || record.generation === epoch) {
    return record;
  }
  if (record.generation === undefined && epoch === 0) {
    return {
      schemaVersion: 1,
      overrides: record.overrides,
      lastUsedAt: record.lastUsedAt,
    };
  }
  return { ...record, generation: epoch };
}

function observedHlcTimestamps(
  syncRecord: SiteSettingsV1 | null,
  localRecord: SiteSettingsV1 | null,
  localGeneration: ControlMetadataParse<SiteGenerationRecord>,
  syncGeneration: ControlMetadataParse<SiteGenerationRecord>,
): number[] {
  const timestamps = collectOverrideTimestamps(syncRecord?.overrides, localRecord?.overrides);
  for (const value of [generationUpdatedAt(localGeneration), generationUpdatedAt(syncGeneration)]) {
    if (isLogicalValue(value)) {
      timestamps.push(value);
    }
  }
  return timestamps;
}

export async function reconcileSyncHotSet(
  sync: DurableSettingsStore,
  now: number,
  options?: ReconcileHotSetOptions,
): Promise<void> {
  return enqueueStorageMutation(SITE_SETTINGS_LOCK, () =>
    reconcileSyncHotSetUnlocked(sync, now, options),
  );
}

export async function reconcilePendingSiteReplicas(deps: SiteSettingsDeps = {}): Promise<void> {
  return enqueueStorageMutation(SITE_SETTINGS_LOCK, async () => {
    const { sync, local, now } = stores(deps);
    await replaySiteOutboxUnlocked(sync, local, now());
  });
}

type LoadedSite = {
  storageKey: string;
  syncParsed: SettingsParseResult<SiteSettingsV1>;
  localParsed: SettingsParseResult<SiteSettingsV1>;
  syncRecord: SiteSettingsV1 | null;
  localRecord: SiteSettingsV1 | null;
  syncRaw: unknown;
  localRaw: unknown;
  syncExtras: OpaqueFields;
  localExtras: OpaqueFields;
  mergedOverrides: BehaviorOverrides;
  globalOverrides: BehaviorOverrides;
  mergedGeneration: MergedGeneration;
  localGeneration: ControlMetadataParse<SiteGenerationRecord>;
  syncGeneration: ControlMetadataParse<SiteGenerationRecord>;
  siteOutbox: ControlMetadataParse<SiteReplicaOutbox>;
  siteClock: ReturnType<typeof parseHybridClockRecord>;
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
    syncRaw,
    localRaw,
    syncExtras,
    localExtras,
    mergedOverrides,
    mergedGeneration,
    localGeneration,
    syncGeneration,
    now,
  } = loaded;

  await repairGenerationUpward(sync, local, mergedGeneration, localGeneration, syncGeneration);

  if (isUnsupportedCopy(syncParsed) && isUnsupportedCopy(localParsed)) {
    return;
  }
  const syncEligible = shouldApplySiteCopy(syncParsed, syncRaw, mergedGeneration);
  const localEligible = shouldApplySiteCopy(localParsed, localRaw, mergedGeneration);
  if (!localEligible && !syncEligible && !hasSemanticOverrides(mergedOverrides)) {
    return;
  }

  const localLastUsedAt = touchUsage
    ? now
    : (localRecord?.lastUsedAt ?? syncRecord?.lastUsedAt ?? now);
  const generation = mergedGeneration.status === 'known' ? mergedGeneration.epoch : undefined;
  const nextLocal = withReadGeneration(
    {
      schemaVersion: 1,
      overrides: mergedOverrides,
      lastUsedAt: localLastUsedAt,
      generation: localRecord?.generation,
    },
    generation,
  );
  const canonical = withReadGeneration(
    {
      schemaVersion: 1,
      overrides: mergedOverrides,
      lastUsedAt: touchUsage ? now : (localRecord?.lastUsedAt ?? syncRecord?.lastUsedAt ?? now),
      generation: syncRecord?.generation ?? localRecord?.generation,
    },
    generation,
  );

  if (!isUnsupportedCopy(localParsed) && (localEligible || hasSemanticOverrides(mergedOverrides))) {
    const destExtras = extrasForDestination('local', syncExtras, localExtras);
    const shouldWriteLocal =
      Boolean(localRecord || hasSemanticOverrides(mergedOverrides) || (touchUsage && syncRecord)) &&
      (!localRecord ||
        !siteKnownAndExtrasEqual(localRecord, localExtras, nextLocal, destExtras) ||
        (touchUsage && now - localRecord.lastUsedAt >= LOCAL_LRU_THROTTLE_MS));
    if (shouldWriteLocal) {
      try {
        await local.set({
          [storageKey]: serializeSiteRecord(nextLocal, destExtras),
        });
      } catch {
        // Local repair must not change the resolved value.
      }
    }
  }

  if (
    mustPreserveSyncCopy(syncParsed, syncRaw, mergedGeneration) ||
    mergedGeneration.status === 'unknown'
  ) {
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
      await publishSyncSite(sync, storageKey, canonical, syncDestExtras, now, mergedGeneration);
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
        {
          schemaVersion: 1,
          overrides: mergedOverrides,
          lastUsedAt: now,
          ...(generation !== undefined ? { generation } : {}),
        },
        syncDestExtras,
        now,
        mergedGeneration,
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
    sync.get([storageKey, SITE_GENERATION_KEY]),
    local.get([storageKey, SITE_GENERATION_KEY, SITE_HLC_KEY, SITE_OUTBOX_KEY]),
    readGlobalBehaviorOverrides({ sync, local, now }),
  ]);
  const syncParsed = migrateSiteSettings(syncAll[storageKey]);
  const localParsed = migrateSiteSettings(localAll[storageKey]);
  const syncRecord = readyRecord(syncParsed);
  const localRecord = readyRecord(localParsed);
  const localGeneration = parseSiteGenerationRecord(localAll[SITE_GENERATION_KEY]);
  const syncGeneration = parseSiteGenerationRecord(syncAll[SITE_GENERATION_KEY]);
  const siteOutbox = parseSiteReplicaOutbox(localAll[SITE_OUTBOX_KEY]);
  const siteClock = parseHybridClockRecord(localAll[SITE_HLC_KEY]);
  if (localGeneration.status === 'corrupt') {
    console.warn('Failed to parse local site generation metadata', localAll[SITE_GENERATION_KEY]);
  }
  if (syncGeneration.status === 'corrupt') {
    console.warn('Failed to parse sync site generation metadata', syncAll[SITE_GENERATION_KEY]);
  }
  if (siteOutbox.status === 'corrupt') {
    console.warn('Failed to parse site replica outbox', localAll[SITE_OUTBOX_KEY]);
  }
  if (siteClock.status === 'corrupt') {
    console.warn('Failed to parse site hybrid clock', localAll[SITE_HLC_KEY]);
  }
  const mergedGeneration = mergeGenerationEpochs(localGeneration, syncGeneration);
  return {
    storageKey,
    syncParsed,
    localParsed,
    syncRecord,
    localRecord,
    syncRaw: syncAll[storageKey],
    localRaw: localAll[storageKey],
    syncExtras: readyExtras(syncParsed),
    localExtras: readyExtras(localParsed),
    mergedOverrides: mergeBehaviorOverrides(
      appliedOverrides(syncParsed, syncAll[storageKey], mergedGeneration),
      appliedOverrides(localParsed, localAll[storageKey], mergedGeneration),
    ),
    globalOverrides,
    mergedGeneration,
    localGeneration,
    syncGeneration,
    siteOutbox,
    siteClock,
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

async function commitLocalThenReplay(
  local: DurableSettingsStore,
  sync: DurableSettingsStore,
  items: Record<string, unknown>,
  now: number,
): Promise<void> {
  await local.set(items);
  try {
    await replaySiteOutboxUnlocked(sync, local, now);
  } catch {
    // Local+outbox already committed.
  }
}

function generationWrite(
  localGeneration: ControlMetadataParse<SiteGenerationRecord>,
  epoch: number,
  updatedAt: number,
): SiteGenerationRecord | null {
  if (localGeneration.status === 'corrupt' || localGeneration.status === 'unsupported') {
    return null;
  }
  if (!replicaNeedsGenerationRepair(localGeneration, epoch) && localGeneration.status === 'valid') {
    return null;
  }
  return serializeSiteGeneration(epoch, updatedAt);
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
    assertCanPersistSite(loaded.syncParsed, loaded.localParsed);
    assertHybridClockUsable(loaded.siteClock);
    assertKnownGeneration(loaded.mergedGeneration);
    let outbox = loaded.siteOutbox;
    if (outbox.status === 'corrupt') {
      const recovered = await recoverCorruptSiteOutbox(
        loaded.sync,
        loaded.local,
        loaded.now,
        loaded.mergedGeneration,
        loaded.localGeneration,
        loaded.syncGeneration,
      );
      if (!recovered) {
        throw new Error(REPLICA_OUTBOX_CORRUPT);
      }
      outbox = { status: 'absent' };
    }
    const currentOutbox = usableSiteOutbox(outbox);
    const issued = issueHybridTimestamp(
      loaded.siteClock,
      loaded.now,
      observedHlcTimestamps(
        loaded.syncRecord,
        loaded.localRecord,
        loaded.localGeneration,
        loaded.syncGeneration,
      ),
    );
    const record: SiteSettingsV1 = {
      schemaVersion: 1,
      overrides: mutate(loaded.mergedOverrides, issued.timestamp),
      lastUsedAt: loaded.now,
      generation: loaded.mergedGeneration.epoch,
    };
    const localItems: Record<string, unknown> = {
      [SITE_HLC_KEY]: issued.record,
    };
    const generationRecord = generationWrite(
      loaded.localGeneration,
      loaded.mergedGeneration.epoch,
      issued.timestamp,
    );
    if (generationRecord) {
      localItems[SITE_GENERATION_KEY] = generationRecord;
    }

    if (isUnsupportedCopy(loaded.localParsed)) {
      await loaded.local.set(localItems);
      await publishSyncSite(
        loaded.sync,
        loaded.storageKey,
        record,
        extrasForDestination('sync', loaded.syncExtras, loaded.localExtras),
        loaded.now,
        loaded.mergedGeneration,
      );
      return;
    }

    localItems[loaded.storageKey] = serializeSiteRecord(
      record,
      extrasForDestination('local', loaded.syncExtras, loaded.localExtras),
    );
    if (!isUnsupportedCopy(loaded.syncParsed)) {
      localItems[SITE_OUTBOX_KEY] = serializeSiteOutbox(
        addPublishSite(currentOutbox, loaded.storageKey),
      );
    }
    await commitLocalThenReplay(loaded.local, loaded.sync, localItems, loaded.now);
  });
}

export async function persistSiteBehaviorChanges(
  url: string,
  changes: readonly BehaviorSettingChange[],
  deps: SiteSettingsDeps = {},
): Promise<void> {
  await persistMutatedSite(
    url,
    (current, at) => {
      let next = current;
      for (const change of changes) {
        next = applyBehaviorSettingChange(next, change, at);
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
  merged: MergedGeneration,
): {
  syncParsed: SettingsParseResult<SiteSettingsV1>;
  localParsed: SettingsParseResult<SiteSettingsV1>;
  merged: BehaviorOverrides;
  rawMerged: BehaviorOverrides;
} {
  const syncParsed = migrateSiteSettings(syncAll[key]);
  const localParsed = migrateSiteSettings(localAll[key]);
  return {
    syncParsed,
    localParsed,
    merged: mergeBehaviorOverrides(
      appliedOverrides(syncParsed, syncAll[key], merged),
      appliedOverrides(localParsed, localAll[key], merged),
    ),
    rawMerged: mergeBehaviorOverrides(
      readyRecord(syncParsed)?.overrides ?? {},
      readyRecord(localParsed)?.overrides ?? {},
    ),
  };
}

function generationFromStores(
  syncAll: Record<string, unknown>,
  localAll: Record<string, unknown>,
): {
  localGeneration: ControlMetadataParse<SiteGenerationRecord>;
  syncGeneration: ControlMetadataParse<SiteGenerationRecord>;
  merged: MergedGeneration;
} {
  const localGeneration = parseSiteGenerationRecord(localAll[SITE_GENERATION_KEY]);
  const syncGeneration = parseSiteGenerationRecord(syncAll[SITE_GENERATION_KEY]);
  return {
    localGeneration,
    syncGeneration,
    merged: mergeGenerationEpochs(localGeneration, syncGeneration),
  };
}

function tombstoneMergedSite(merged: BehaviorOverrides, at: number): SiteSettingsV1 | null {
  const overrides = tombstoneExistingSiteFields(merged, at);
  if (!hasSemanticOverrides(overrides)) {
    return null;
  }
  return { schemaVersion: 1, overrides, lastUsedAt: at };
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
    const [syncAll, localAll] = await Promise.all([
      sync.get([storageKey, SITE_GENERATION_KEY]),
      local.get([storageKey, SITE_GENERATION_KEY]),
    ]);
    const generation = generationFromStores(syncAll, localAll);
    return hasValueOverrides(copiesForKey(syncAll, localAll, storageKey, generation.merged).merged);
  });
}

export async function listCustomSiteHostnames(deps: SiteSettingsDeps = {}): Promise<string[]> {
  return enqueueStorageMutation(SITE_SETTINGS_LOCK, async () => {
    const { sync, local } = stores(deps);
    const [syncAll, localAll] = await Promise.all([sync.get(null), local.get(null)]);
    const generation = generationFromStores(syncAll, localAll);
    const hostnames = new Set<string>();
    const keys = new Set([...Object.keys(syncAll), ...Object.keys(localAll)]);
    for (const key of keys) {
      const hostname = hostnameFromSiteStorageKey(key);
      if (!hostname || !normalizeSiteHostname(hostname)) {
        continue;
      }
      if (hasValueOverrides(copiesForKey(syncAll, localAll, key, generation.merged).merged)) {
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
    const [syncAll, localAll] = await Promise.all([
      sync.get([storageKey, SITE_GENERATION_KEY]),
      local.get([storageKey, SITE_GENERATION_KEY, SITE_HLC_KEY, SITE_OUTBOX_KEY]),
    ]);
    const generation = generationFromStores(syncAll, localAll);
    const copies = copiesForKey(syncAll, localAll, storageKey, generation.merged);
    assertCanDestroySite(copies.syncParsed, copies.localParsed);
    if (!hasSemanticOverrides(copies.rawMerged)) {
      return;
    }
    assertKnownGeneration(generation.merged);
    const siteClock = parseHybridClockRecord(localAll[SITE_HLC_KEY]);
    const siteOutbox = parseSiteReplicaOutbox(localAll[SITE_OUTBOX_KEY]);
    if (siteClock.status === 'corrupt') {
      console.warn('Failed to parse site hybrid clock', localAll[SITE_HLC_KEY]);
    }
    if (siteOutbox.status === 'corrupt') {
      console.warn('Failed to parse site replica outbox', localAll[SITE_OUTBOX_KEY]);
    }
    assertHybridClockUsable(siteClock);
    let outbox = siteOutbox;
    if (outbox.status === 'corrupt') {
      const recovered = await recoverCorruptSiteOutbox(
        sync,
        local,
        at,
        generation.merged,
        generation.localGeneration,
        generation.syncGeneration,
      );
      if (!recovered) {
        throw new Error(REPLICA_OUTBOX_CORRUPT);
      }
      outbox = { status: 'absent' };
    }
    const issued = issueHybridTimestamp(
      siteClock,
      at,
      observedHlcTimestamps(
        readyRecord(copies.syncParsed),
        readyRecord(copies.localParsed),
        generation.localGeneration,
        generation.syncGeneration,
      ),
    );
    const record = tombstoneMergedSite(copies.rawMerged, issued.timestamp);
    if (!record) {
      return;
    }
    record.generation = generation.merged.epoch;
    record.lastUsedAt = at;
    const localItems: Record<string, unknown> = {
      [storageKey]: serializeSiteRecord(
        record,
        extrasForDestination(
          'local',
          readyExtras(copies.syncParsed),
          readyExtras(copies.localParsed),
        ),
      ),
      [SITE_HLC_KEY]: issued.record,
    };
    const generationRecord = generationWrite(
      generation.localGeneration,
      generation.merged.epoch,
      issued.timestamp,
    );
    if (generationRecord) {
      localItems[SITE_GENERATION_KEY] = generationRecord;
    }
    if (!isUnsupportedCopy(copies.syncParsed)) {
      localItems[SITE_OUTBOX_KEY] = serializeSiteOutbox(
        addPublishSite(usableSiteOutbox(outbox), storageKey),
      );
    }
    await commitLocalThenReplay(local, sync, localItems, at);
  });
}

export async function deleteAllSiteSettings(
  deps: SiteSettingsDeps = {},
): Promise<{ skippedRecordCount: number }> {
  return enqueueStorageMutation(SITE_SETTINGS_LOCK, async () => {
    const { sync, local, now } = stores(deps);
    const at = now();
    const [syncAll, localAll] = await Promise.all([sync.get(null), local.get(null)]);
    const generation = generationFromStores(syncAll, localAll);
    assertKnownGeneration(generation.merged);
    const siteClock = parseHybridClockRecord(localAll[SITE_HLC_KEY]);
    const siteOutbox = parseSiteReplicaOutbox(localAll[SITE_OUTBOX_KEY]);
    if (siteClock.status === 'corrupt') {
      console.warn('Failed to parse site hybrid clock', localAll[SITE_HLC_KEY]);
    }
    if (siteOutbox.status === 'corrupt') {
      console.warn('Failed to parse site replica outbox', localAll[SITE_OUTBOX_KEY]);
    }
    assertHybridClockUsable(siteClock);
    let outbox = siteOutbox;
    if (outbox.status === 'corrupt') {
      const recovered = await recoverCorruptSiteOutbox(
        sync,
        local,
        at,
        generation.merged,
        generation.localGeneration,
        generation.syncGeneration,
      );
      if (!recovered) {
        throw new Error(REPLICA_OUTBOX_CORRUPT);
      }
      outbox = { status: 'absent' };
    }
    const nextEpoch = checkedIncrement(generation.merged.epoch);
    const issued = issueHybridTimestamp(
      siteClock,
      at,
      observedHlcTimestamps(null, null, generation.localGeneration, generation.syncGeneration),
    );
    const keys = [
      ...new Set(
        [...Object.keys(syncAll), ...Object.keys(localAll)].filter((key) =>
          key.startsWith('site:'),
        ),
      ),
    ];
    const localItems: Record<string, unknown> = {
      [SITE_HLC_KEY]: issued.record,
      [SITE_GENERATION_KEY]: serializeSiteGeneration(nextEpoch, issued.timestamp),
    };
    const resetKeys: string[] = [];
    let skippedRecordCount = 0;
    for (const key of keys) {
      const copies = copiesForKey(syncAll, localAll, key, generation.merged);
      if (cannotSafelyDestroy(copies.syncParsed) || cannotSafelyDestroy(copies.localParsed)) {
        skippedRecordCount += 1;
        continue;
      }
      resetKeys.push(key);
      const record = tombstoneMergedSite(copies.rawMerged, issued.timestamp);
      if (!record) {
        continue;
      }
      record.generation = nextEpoch;
      record.lastUsedAt = at;
      localItems[key] = serializeSiteRecord(
        record,
        extrasForDestination(
          'local',
          readyExtras(copies.syncParsed),
          readyExtras(copies.localParsed),
        ),
      );
    }
    localItems[SITE_OUTBOX_KEY] = serializeSiteOutbox(
      applyResetAllToOutbox(usableSiteOutbox(outbox), nextEpoch, resetKeys),
    );
    await commitLocalThenReplay(local, sync, localItems, at);
    return { skippedRecordCount };
  });
}

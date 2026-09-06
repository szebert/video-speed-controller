// SPDX-License-Identifier: GPL-3.0-only

import { cannotSafelyDestroy } from '../settings/destroy-policy';
import {
  SETTINGS_CREATED_BY_NEWER_VERSION,
  extrasForDestination,
  hasOpaqueContent,
  migrateSiteSettings,
  projectSyncEligibleSite,
  serializeSiteRecord,
  serializedRecordsEqual,
  type OpaqueFields,
  type SettingsParseResult,
} from '../settings/migrate';
import {
  SYNC_TARGET_MAX_BYTES,
  SYNC_TARGET_MAX_SITE_ITEMS,
  hasSyncRetainedInherit,
  hasValueOverrides,
  mergeBehaviorOverrides,
  type BehaviorOverrides,
  type SiteSettingsV1,
} from '../settings/site-behavior';
import { estimateStorageEntryBytes, type DurableSettingsStore } from './durable-store';
import {
  SITE_GENERATION_KEY,
  generationUpdatedAt,
  isFutureOrUnknownGeneration,
  isOldGenerationCopy,
  knownEpochOf,
  mergeGenerationEpochs,
  parseSiteGenerationRecord,
  parseSiteRecordGeneration,
  replicaNeedsGenerationRepair,
  serializeSiteGeneration,
  shouldApplySiteCopy,
  type MergedGeneration,
  type ParsedGeneration,
  type SiteGenerationRecord,
} from './site-generation';
import type { ControlMetadataParse } from './control-metadata';
import {
  SITE_OUTBOX_KEY,
  clearResetAll,
  decidePublishSiteReplay,
  decideResetAllReplay,
  emptySiteOutbox,
  parseSiteReplicaOutbox,
  serializeSiteOutbox,
  siteOutboxIsIdle,
  type SiteReplicaOutbox,
} from './replica-outbox';

export type RawSiteEntry = {
  key: string;
  raw: unknown;
  parsed: SettingsParseResult<SiteSettingsV1>;
};

export function isCapacityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /QUOTA_BYTES|QUOTA_BYTES_PER_ITEM|MAX_ITEMS/i.test(message);
}

export function isWriteRateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /MAX_WRITE_OPERATIONS/i.test(message);
}

function readyRecord(parsed: SettingsParseResult<SiteSettingsV1>): SiteSettingsV1 | null {
  return parsed.status === 'ready' ? parsed.record : null;
}

function readyExtras(parsed: SettingsParseResult<SiteSettingsV1>): OpaqueFields {
  return parsed.status === 'ready' ? parsed.extras : { record: {}, overrides: {} };
}

function isUnsupportedCopy(parsed: SettingsParseResult<SiteSettingsV1>): boolean {
  return parsed.status === 'unsupported';
}

function opaqueReadyEvictionRank(parsed: SettingsParseResult<SiteSettingsV1>): number {
  return parsed.status === 'ready' && hasOpaqueContent(parsed.extras) ? 1 : 0;
}

export async function listRawSiteEntries(sync: DurableSettingsStore): Promise<RawSiteEntry[]> {
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

export async function loadMergedGeneration(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
): Promise<{
  localGeneration: ControlMetadataParse<SiteGenerationRecord>;
  syncGeneration: ControlMetadataParse<SiteGenerationRecord>;
  merged: MergedGeneration;
}> {
  const [localAll, syncAll] = await Promise.all([
    local.get(SITE_GENERATION_KEY),
    sync.get(SITE_GENERATION_KEY),
  ]);
  const localGeneration = parseSiteGenerationRecord(localAll[SITE_GENERATION_KEY]);
  const syncGeneration = parseSiteGenerationRecord(syncAll[SITE_GENERATION_KEY]);
  if (localGeneration.status === 'corrupt') {
    console.warn('Failed to parse local site generation metadata', localAll[SITE_GENERATION_KEY]);
  }
  if (syncGeneration.status === 'corrupt') {
    console.warn('Failed to parse sync site generation metadata', syncAll[SITE_GENERATION_KEY]);
  }
  return {
    localGeneration,
    syncGeneration,
    merged: mergeGenerationEpochs(localGeneration, syncGeneration),
  };
}

export async function repairGenerationUpward(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
  merged: MergedGeneration,
  localGeneration: ControlMetadataParse<SiteGenerationRecord>,
  syncGeneration: ControlMetadataParse<SiteGenerationRecord>,
): Promise<void> {
  if (merged.status !== 'known') {
    return;
  }
  const updatedAt = generationUpdatedAt(localGeneration) ?? generationUpdatedAt(syncGeneration);
  const record = serializeSiteGeneration(merged.epoch, updatedAt);
  if (replicaNeedsGenerationRepair(localGeneration, merged.epoch)) {
    try {
      await local.set({ [SITE_GENERATION_KEY]: record });
    } catch {
      // Local generation repair is best-effort.
    }
  }
  if (replicaNeedsGenerationRepair(syncGeneration, merged.epoch)) {
    try {
      await sync.set({ [SITE_GENERATION_KEY]: record });
    } catch {
      // Sync generation repair is best-effort; the higher Local value retries later.
    }
  }
}

export async function tryPublishCommittedGeneration(
  sync: DurableSettingsStore,
  epoch: number,
  updatedAt?: number,
): Promise<boolean> {
  const current = parseSiteGenerationRecord(
    (await sync.get(SITE_GENERATION_KEY))[SITE_GENERATION_KEY],
  );
  if (current.status === 'unsupported' || current.status === 'corrupt') {
    return false;
  }
  if (current.status === 'valid' && current.value.epoch >= epoch) {
    return true;
  }
  try {
    await sync.set({ [SITE_GENERATION_KEY]: serializeSiteGeneration(epoch, updatedAt) });
    return true;
  } catch {
    return false;
  }
}

export async function cleanupOldGenerationSyncSites(
  sync: DurableSettingsStore,
  epoch: number,
): Promise<void> {
  const entries = await listRawSiteEntries(sync);
  const removals: string[] = [];
  for (const entry of entries) {
    if (cannotSafelyDestroy(entry.parsed)) {
      continue;
    }
    if (isOldGenerationCopy(entry.raw, epoch)) {
      removals.push(entry.key);
    }
  }
  if (removals.length > 0) {
    await sync.remove(removals);
  }
}

function isSoftProtected(entry: RawSiteEntry, now: number, epoch: MergedGeneration): boolean {
  if (entry.parsed.status === 'unsupported') {
    return true;
  }
  if (entry.parsed.status !== 'ready') {
    return false;
  }
  if (isFutureOrUnknownGeneration(entry.raw, epoch)) {
    return true;
  }
  return hasSyncRetainedInherit(entry.parsed.record.overrides, now);
}

function lastUsedAtOf(entry: RawSiteEntry): number {
  return readyRecord(entry.parsed)?.lastUsedAt ?? 0;
}

function isInheritOnlyReady(entry: RawSiteEntry, now: number): boolean {
  const record = readyRecord(entry.parsed);
  return (
    record != null &&
    hasSyncRetainedInherit(record.overrides, now) &&
    !hasValueOverrides(record.overrides)
  );
}

async function evictEntries(
  sync: DurableSettingsStore,
  entries: RawSiteEntry[],
  candidates: RawSiteEntry[],
): Promise<RawSiteEntry[]> {
  let remaining = entries;
  for (const candidate of candidates) {
    if (!isOverTarget(remaining.length, await measureSiteBytes(sync, remaining))) {
      break;
    }
    await sync.remove(candidate.key);
    remaining = remaining.filter((entry) => entry.key !== candidate.key);
  }
  return remaining;
}

export type ReconcileHotSetOptions = {
  protectedKey?: string;
  mode?: 'soft' | 'capacity';
  epoch?: MergedGeneration;
};

export async function reconcileSyncHotSetUnlocked(
  sync: DurableSettingsStore,
  now: number,
  options?: ReconcileHotSetOptions,
): Promise<void> {
  const epoch =
    options?.epoch ??
    mergeGenerationEpochs(
      { status: 'absent' },
      parseSiteGenerationRecord((await sync.get(SITE_GENERATION_KEY))[SITE_GENERATION_KEY]),
    );
  const mode = options?.mode ?? 'soft';
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
    if (isFutureOrUnknownGeneration(entry.raw, epoch)) {
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
      return !isSoftProtected(entry, now, epoch);
    })
    .sort((left, right) => {
      const rank = opaqueReadyEvictionRank(left.parsed) - opaqueReadyEvictionRank(right.parsed);
      if (rank !== 0) {
        return rank;
      }
      return lastUsedAtOf(left) - lastUsedAtOf(right);
    });

  entries = await evictEntries(sync, entries, evictable);
  if (mode !== 'capacity' || !isOverTarget(entries.length, await measureSiteBytes(sync, entries))) {
    return;
  }

  const inheritOnly = entries
    .filter((entry) => {
      if (options?.protectedKey && entry.key === options.protectedKey) {
        return false;
      }
      if (entry.parsed.status === 'unsupported') {
        return false;
      }
      return isInheritOnlyReady(entry, now);
    })
    .sort((left, right) => lastUsedAtOf(left) - lastUsedAtOf(right));
  entries = await evictEntries(sync, entries, inheritOnly);
  if (!isOverTarget(entries.length, await measureSiteBytes(sync, entries))) {
    return;
  }

  const lastResort = entries
    .filter((entry) => {
      if (options?.protectedKey && entry.key === options.protectedKey) {
        return false;
      }
      if (entry.parsed.status === 'unsupported') {
        return false;
      }
      return isFutureOrUnknownGeneration(entry.raw, epoch);
    })
    .sort((left, right) => lastUsedAtOf(left) - lastUsedAtOf(right));
  await evictEntries(sync, entries, lastResort);
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

export async function publishSyncSite(
  sync: DurableSettingsStore,
  storageKey: string,
  record: SiteSettingsV1,
  extras: OpaqueFields,
  now: number,
  epoch?: MergedGeneration,
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
    try {
      await reconcileSyncHotSetUnlocked(sync, now, { epoch });
      result = await write();
    } catch (retryError) {
      if (!isCapacityError(retryError) || isWriteRateError(retryError)) {
        throw retryError;
      }
      await reconcileSyncHotSetUnlocked(sync, now, { epoch, mode: 'capacity' });
      result = await write();
    }
  }

  if (result === 'set') {
    try {
      await reconcileSyncHotSetUnlocked(sync, now, { protectedKey: storageKey, epoch });
    } catch {
      // Post-publication maintenance must not fail a successful Sync write.
    }
  }
}

function appliedOverrides(
  parsed: SettingsParseResult<SiteSettingsV1>,
  raw: unknown,
  epoch: MergedGeneration,
): BehaviorOverrides {
  return shouldApplySiteCopy(parsed, raw, epoch) ? (readyRecord(parsed)?.overrides ?? {}) : {};
}

export function mustPreserveSyncCopy(
  syncParsed: SettingsParseResult<SiteSettingsV1>,
  syncRaw: unknown,
  epoch: MergedGeneration,
): boolean {
  return (
    syncRaw != null &&
    (isUnsupportedCopy(syncParsed) || isFutureOrUnknownGeneration(syncRaw, epoch))
  );
}

function generationAtEpoch(parsed: ParsedGeneration, epoch: number): boolean {
  return parsed.status !== 'unknown' && parsed.value === epoch;
}

function mergedReplayGeneration(
  localRaw: unknown,
  syncRaw: unknown,
  localRecord: SiteSettingsV1 | null,
  syncRecord: SiteSettingsV1 | null,
  localEligible: boolean,
  syncEligible: boolean,
  epoch: MergedGeneration,
): number | undefined {
  if (epoch.status !== 'known') {
    return localRecord?.generation ?? syncRecord?.generation;
  }
  if (
    (localEligible && generationAtEpoch(parseSiteRecordGeneration(localRaw), epoch.epoch)) ||
    (syncEligible && generationAtEpoch(parseSiteRecordGeneration(syncRaw), epoch.epoch))
  ) {
    return epoch.epoch;
  }
  return localRecord?.generation ?? syncRecord?.generation;
}

export type ReplayPublishResult = 'completed' | 'blocked';

async function replayPublishSite(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
  storageKey: string,
  now: number,
  epoch: MergedGeneration,
): Promise<ReplayPublishResult> {
  const [localRaw, syncRaw] = await Promise.all([
    local.get(storageKey).then((all) => all[storageKey]),
    sync.get(storageKey).then((all) => all[storageKey]),
  ]);
  const localParsed = migrateSiteSettings(localRaw);
  const syncParsed = migrateSiteSettings(syncRaw);
  if (mustPreserveSyncCopy(syncParsed, syncRaw, epoch)) {
    return 'blocked';
  }
  if (isUnsupportedCopy(localParsed)) {
    throw new Error(SETTINGS_CREATED_BY_NEWER_VERSION);
  }

  const localEligible =
    localParsed.status === 'ready' && shouldApplySiteCopy(localParsed, localRaw, epoch);
  const syncEligible =
    syncParsed.status === 'ready' && shouldApplySiteCopy(syncParsed, syncRaw, epoch);
  if (!localEligible) {
    if (cannotSafelyDestroy(syncParsed)) {
      return 'completed';
    }
    if (epoch.status === 'known' && syncRaw != null && isOldGenerationCopy(syncRaw, epoch.epoch)) {
      await sync.remove(storageKey);
    }
    return 'completed';
  }

  const localRecord = readyRecord(localParsed);
  const syncRecord = readyRecord(syncParsed);
  const generation = mergedReplayGeneration(
    localRaw,
    syncRaw,
    localRecord,
    syncRecord,
    localEligible,
    syncEligible,
    epoch,
  );
  const record: SiteSettingsV1 = {
    schemaVersion: 1,
    overrides: mergeBehaviorOverrides(
      appliedOverrides(syncParsed, syncRaw, epoch),
      appliedOverrides(localParsed, localRaw, epoch),
    ),
    lastUsedAt: Math.max(
      localRecord?.lastUsedAt ?? 0,
      syncEligible ? (syncRecord?.lastUsedAt ?? 0) : 0,
    ),
    ...(generation === undefined ? {} : { generation }),
  };
  if (record.lastUsedAt <= 0) {
    record.lastUsedAt = now;
  }
  const localExtras = readyExtras(localParsed);
  const syncExtras = readyExtras(syncParsed);
  try {
    await local.set({
      [storageKey]: serializeSiteRecord(
        record,
        extrasForDestination('local', syncExtras, localExtras),
      ),
    });
  } catch {
    // The outbox stays durable until Sync accepts the merged winner.
  }
  await publishSyncSite(
    sync,
    storageKey,
    record,
    extrasForDestination('sync', syncExtras, localExtras),
    now,
    epoch,
  );
  return 'completed';
}

export async function recoverCorruptSiteOutbox(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
  now: number,
  merged: MergedGeneration,
  localGeneration: ControlMetadataParse<SiteGenerationRecord>,
  syncGeneration: ControlMetadataParse<SiteGenerationRecord>,
): Promise<boolean> {
  if (merged.status !== 'known') {
    return false;
  }
  await repairGenerationUpward(sync, local, merged, localGeneration, syncGeneration);
  let complete = true;
  const entries = await listRawSiteEntries(sync);
  for (const entry of entries) {
    if (cannotSafelyDestroy(entry.parsed)) {
      continue;
    }
    if (isOldGenerationCopy(entry.raw, merged.epoch)) {
      try {
        await sync.remove(entry.key);
      } catch {
        complete = false;
      }
      continue;
    }
    try {
      await replayPublishSite(sync, local, entry.key, now, merged);
    } catch {
      complete = false;
    }
  }
  return complete;
}

async function tryShrinkSiteOutbox(
  local: DurableSettingsStore,
  next: SiteReplicaOutbox,
): Promise<void> {
  try {
    if (siteOutboxIsIdle(next)) {
      await local.remove(SITE_OUTBOX_KEY);
      return;
    }
    await local.set({ [SITE_OUTBOX_KEY]: serializeSiteOutbox(next) });
  } catch {
    // A stale satisfied obligation must not fail the user mutation.
  }
}

export async function replaySiteOutboxUnlocked(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
  now: number,
): Promise<void> {
  const [localMeta, syncMeta] = await Promise.all([
    local.get([SITE_OUTBOX_KEY, SITE_GENERATION_KEY]),
    sync.get(SITE_GENERATION_KEY),
  ]);
  const outboxParsed = parseSiteReplicaOutbox(localMeta[SITE_OUTBOX_KEY]);
  if (outboxParsed.status === 'corrupt') {
    console.warn('Failed to parse site replica outbox', localMeta[SITE_OUTBOX_KEY]);
  }
  const localGeneration = parseSiteGenerationRecord(localMeta[SITE_GENERATION_KEY]);
  const syncGeneration = parseSiteGenerationRecord(syncMeta[SITE_GENERATION_KEY]);
  const merged = mergeGenerationEpochs(localGeneration, syncGeneration);

  if (outboxParsed.status === 'unsupported') {
    return;
  }
  if (outboxParsed.status === 'corrupt') {
    if (merged.status === 'unknown') {
      return;
    }
    await recoverCorruptSiteOutbox(sync, local, now, merged, localGeneration, syncGeneration);
    return;
  }

  await repairGenerationUpward(sync, local, merged, localGeneration, syncGeneration);
  const repaired = await loadMergedGeneration(sync, local);
  const mergedAfter = repaired.merged;
  let syncEpoch = knownEpochOf(repaired.syncGeneration);

  let nextOutbox = outboxParsed.status === 'valid' ? outboxParsed.value : emptySiteOutbox();
  if (siteOutboxIsIdle(nextOutbox)) {
    return;
  }

  if (nextOutbox.resetAll) {
    const decision = decideResetAllReplay(nextOutbox.resetAll, mergedAfter);
    if (decision === 'superseded') {
      nextOutbox = clearResetAll(nextOutbox);
    } else if (decision === 'active' && mergedAfter.status === 'known') {
      const published =
        syncEpoch != null && syncEpoch >= mergedAfter.epoch
          ? true
          : await tryPublishCommittedGeneration(
              sync,
              mergedAfter.epoch,
              generationUpdatedAt(repaired.localGeneration) ??
                generationUpdatedAt(repaired.syncGeneration),
            );
      if (published) {
        syncEpoch = Math.max(syncEpoch ?? 0, mergedAfter.epoch);
        await cleanupOldGenerationSyncSites(sync, mergedAfter.epoch);
        nextOutbox = clearResetAll(nextOutbox);
      }
    }
  }

  const remaining: string[] = [];
  for (const key of nextOutbox.publishSites) {
    const [localRaw, syncRaw] = await Promise.all([
      local.get(key).then((all) => all[key]),
      sync.get(key).then((all) => all[key]),
    ]);
    const generationExempt =
      cannotSafelyDestroy(migrateSiteSettings(localRaw)) ||
      cannotSafelyDestroy(migrateSiteSettings(syncRaw));
    const decision = decidePublishSiteReplay(
      parseSiteRecordGeneration(localRaw),
      mergedAfter,
      syncEpoch,
      generationExempt,
    );
    if (decision.action === 'obsolete') {
      continue;
    }
    if (decision.action !== 'eligible') {
      remaining.push(key);
      continue;
    }
    if (decision.publishGenerationFirst && mergedAfter.status === 'known') {
      const published = await tryPublishCommittedGeneration(
        sync,
        mergedAfter.epoch,
        generationUpdatedAt(repaired.localGeneration) ??
          generationUpdatedAt(repaired.syncGeneration),
      );
      if (!published) {
        remaining.push(key);
        continue;
      }
      syncEpoch = mergedAfter.epoch;
    }
    try {
      if ((await replayPublishSite(sync, local, key, now, mergedAfter)) === 'blocked') {
        remaining.push(key);
      }
    } catch {
      remaining.push(key);
      continue;
    }
  }
  nextOutbox = { schemaVersion: 1, publishSites: remaining, resetAll: nextOutbox.resetAll };
  await tryShrinkSiteOutbox(local, nextOutbox);
}

export function warnIfCorruptControl(kind: string, parsed: { status: string }, raw: unknown): void {
  if (parsed.status === 'corrupt') {
    console.warn(`Failed to parse ${kind}`, raw);
  }
}

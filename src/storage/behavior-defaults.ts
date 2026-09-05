// SPDX-License-Identifier: GPL-3.0-only

import {
  GLOBAL_BEHAVIOR_KEY,
  REPAIR_BACKOFF_MS,
  applyBehaviorSettingChange,
  hasSemanticOverrides,
  inheritAllEditableFields,
  mergeBehaviorOverrides,
  type BehaviorOverrides,
  type BehaviorSettingChange,
  type GlobalBehaviorSettingsV1,
} from '../settings/site-behavior';
import { cannotSafelyDestroy } from '../settings/destroy-policy';
import {
  SETTINGS_CREATED_BY_NEWER_VERSION,
  emptyOpaqueFields,
  extrasForDestination,
  hasOpaqueContent,
  migrateGlobalBehaviorSettings,
  serializeGlobalRecord,
  serializedRecordsEqual,
  type OpaqueFields,
  type SettingsParseResult,
} from '../settings/migrate';
import { defaultLocalStore, defaultSyncStore, type DurableSettingsStore } from './durable-store';
import {
  GLOBAL_HLC_KEY,
  assertHybridClockUsable,
  collectOverrideTimestamps,
  issueHybridTimestamp,
  parseHybridClockRecord,
  type HybridClockRecord,
} from './hybrid-clock';
import {
  GLOBAL_OUTBOX_KEY,
  REPLICA_OUTBOX_UNSUPPORTED,
  parseGlobalReplicaOutbox,
  serializeGlobalOutbox,
  usableGlobalOutbox,
} from './replica-outbox';
import { GLOBAL_DEFAULTS_LOCK, enqueueStorageMutation } from './storage-mutation-queue';

export type StorageClock = () => number;

export type BehaviorDefaultsDeps = {
  sync?: DurableSettingsStore;
  local?: DurableSettingsStore;
  now?: StorageClock;
};

const globalRepairFailedAt = new Map<string, number>();

function stores(deps: BehaviorDefaultsDeps): {
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

export function resetBehaviorDefaultsRepairBackoff(): void {
  globalRepairFailedAt.delete(GLOBAL_BEHAVIOR_KEY);
}

function readyRecord(
  parsed: SettingsParseResult<GlobalBehaviorSettingsV1>,
): GlobalBehaviorSettingsV1 | null {
  return parsed.status === 'ready' ? parsed.record : null;
}

function readyExtras(parsed: SettingsParseResult<GlobalBehaviorSettingsV1>): OpaqueFields {
  return parsed.status === 'ready' ? parsed.extras : emptyOpaqueFields();
}

function isUnsupportedCopy(parsed: SettingsParseResult<GlobalBehaviorSettingsV1>): boolean {
  return parsed.status === 'unsupported';
}

async function replayGlobalOutboxUnlocked(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
): Promise<void> {
  const localAll = await local.get([GLOBAL_BEHAVIOR_KEY, GLOBAL_OUTBOX_KEY]);
  const outboxParsed = parseGlobalReplicaOutbox(localAll[GLOBAL_OUTBOX_KEY]);
  if (outboxParsed.status === 'corrupt') {
    console.warn('Failed to parse global replica outbox', localAll[GLOBAL_OUTBOX_KEY]);
  }
  if (outboxParsed.status === 'unsupported') {
    return;
  }
  const outbox =
    outboxParsed.status === 'corrupt' ? { publish: true } : usableGlobalOutbox(outboxParsed);
  if (!outbox.publish && outboxParsed.status !== 'corrupt') {
    return;
  }
  const localParsed = migrateGlobalBehaviorSettings(localAll[GLOBAL_BEHAVIOR_KEY]);
  if (isUnsupportedCopy(localParsed)) {
    return;
  }
  const syncAll = await sync.get(GLOBAL_BEHAVIOR_KEY);
  const syncParsed = migrateGlobalBehaviorSettings(syncAll[GLOBAL_BEHAVIOR_KEY]);
  if (isUnsupportedCopy(syncParsed)) {
    try {
      await local.remove(GLOBAL_OUTBOX_KEY);
    } catch {
      // Stale obligation must not fail later work.
    }
    return;
  }
  try {
    const record: GlobalBehaviorSettingsV1 = {
      schemaVersion: 1,
      overrides: readyRecord(localParsed)?.overrides ?? {},
    };
    await sync.set({
      [GLOBAL_BEHAVIOR_KEY]: serializeGlobalRecord(
        record,
        extrasForDestination('sync', readyExtras(syncParsed), readyExtras(localParsed)),
      ),
    });
    try {
      await local.remove(GLOBAL_OUTBOX_KEY);
    } catch {
      // Sync already published; a later replay is idempotent.
    }
  } catch {
    // Keep the outbox for a later locked replay.
  }
}

export async function reconcilePendingGlobalReplicas(
  deps: BehaviorDefaultsDeps = {},
): Promise<void> {
  return enqueueStorageMutation(GLOBAL_DEFAULTS_LOCK, async () => {
    const { sync, local } = stores(deps);
    await replayGlobalOutboxUnlocked(sync, local);
  });
}

async function readCopies(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
): Promise<{
  syncParsed: SettingsParseResult<GlobalBehaviorSettingsV1>;
  localParsed: SettingsParseResult<GlobalBehaviorSettingsV1>;
  merged: BehaviorOverrides;
}> {
  const [syncAll, localAll] = await Promise.all([
    sync.get(GLOBAL_BEHAVIOR_KEY),
    local.get(GLOBAL_BEHAVIOR_KEY),
  ]);
  const syncParsed = migrateGlobalBehaviorSettings(syncAll[GLOBAL_BEHAVIOR_KEY]);
  const localParsed = migrateGlobalBehaviorSettings(localAll[GLOBAL_BEHAVIOR_KEY]);
  return {
    syncParsed,
    localParsed,
    merged: mergeBehaviorOverrides(
      readyRecord(syncParsed)?.overrides ?? {},
      readyRecord(localParsed)?.overrides ?? {},
    ),
  };
}

async function maybeRepairGlobal(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
  syncParsed: SettingsParseResult<GlobalBehaviorSettingsV1>,
  localParsed: SettingsParseResult<GlobalBehaviorSettingsV1>,
  merged: BehaviorOverrides,
  now: number,
): Promise<void> {
  if (isUnsupportedCopy(syncParsed) && isUnsupportedCopy(localParsed)) {
    return;
  }
  const record: GlobalBehaviorSettingsV1 = { schemaVersion: 1, overrides: merged };
  const syncExtras = readyExtras(syncParsed);
  const localExtras = readyExtras(localParsed);
  const hasKnownOrReady =
    syncParsed.status === 'ready' ||
    localParsed.status === 'ready' ||
    hasSemanticOverrides(merged) ||
    hasOpaqueContent(syncExtras) ||
    hasOpaqueContent(localExtras);
  if (!hasKnownOrReady) {
    return;
  }

  if (!isUnsupportedCopy(localParsed)) {
    const expected = serializeGlobalRecord(
      record,
      extrasForDestination('local', syncExtras, localExtras),
    );
    const current =
      localParsed.status === 'ready'
        ? serializeGlobalRecord(localParsed.record, localParsed.extras)
        : undefined;
    if (!serializedRecordsEqual(current, expected)) {
      try {
        await local.set({ [GLOBAL_BEHAVIOR_KEY]: expected });
      } catch {
        // Local repair must not change the resolved value.
      }
    }
  }

  if (isUnsupportedCopy(syncParsed)) {
    return;
  }
  const expectedSync = serializeGlobalRecord(
    record,
    extrasForDestination('sync', syncExtras, localExtras),
  );
  const currentSync =
    syncParsed.status === 'ready'
      ? serializeGlobalRecord(syncParsed.record, syncParsed.extras)
      : undefined;
  if (serializedRecordsEqual(currentSync, expectedSync)) {
    return;
  }
  const lastFail = globalRepairFailedAt.get(GLOBAL_BEHAVIOR_KEY);
  if (lastFail != null && now - lastFail < REPAIR_BACKOFF_MS) {
    return;
  }
  try {
    await sync.set({ [GLOBAL_BEHAVIOR_KEY]: expectedSync });
    globalRepairFailedAt.delete(GLOBAL_BEHAVIOR_KEY);
  } catch {
    globalRepairFailedAt.set(GLOBAL_BEHAVIOR_KEY, now);
  }
}

export async function readGlobalBehaviorOverrides(
  deps: BehaviorDefaultsDeps = {},
): Promise<BehaviorOverrides> {
  return enqueueStorageMutation(GLOBAL_DEFAULTS_LOCK, async () => {
    const { sync, local, now } = stores(deps);
    const copies = await readCopies(sync, local);
    await maybeRepairGlobal(
      sync,
      local,
      copies.syncParsed,
      copies.localParsed,
      copies.merged,
      now(),
    );
    return copies.merged;
  });
}

async function persistGlobalRecord(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
  record: GlobalBehaviorSettingsV1,
  syncParsed: SettingsParseResult<GlobalBehaviorSettingsV1>,
  localParsed: SettingsParseResult<GlobalBehaviorSettingsV1>,
  clockRecord: HybridClockRecord,
): Promise<void> {
  if (isUnsupportedCopy(syncParsed) && isUnsupportedCopy(localParsed)) {
    throw new Error(SETTINGS_CREATED_BY_NEWER_VERSION);
  }
  const outboxParsed = parseGlobalReplicaOutbox(
    (await local.get(GLOBAL_OUTBOX_KEY))[GLOBAL_OUTBOX_KEY],
  );
  if (outboxParsed.status === 'unsupported') {
    throw new Error(REPLICA_OUTBOX_UNSUPPORTED);
  }
  if (outboxParsed.status === 'corrupt') {
    console.warn(
      'Failed to parse global replica outbox',
      (await local.get(GLOBAL_OUTBOX_KEY))[GLOBAL_OUTBOX_KEY],
    );
  }
  const localItems: Record<string, unknown> = {
    [GLOBAL_HLC_KEY]: clockRecord,
  };
  if (!isUnsupportedCopy(localParsed)) {
    localItems[GLOBAL_BEHAVIOR_KEY] = serializeGlobalRecord(
      record,
      extrasForDestination('local', readyExtras(syncParsed), readyExtras(localParsed)),
    );
    if (!isUnsupportedCopy(syncParsed)) {
      localItems[GLOBAL_OUTBOX_KEY] = serializeGlobalOutbox(true);
    }
    await local.set(localItems);
  } else {
    await local.set(localItems);
    await sync.set({
      [GLOBAL_BEHAVIOR_KEY]: serializeGlobalRecord(
        record,
        extrasForDestination('sync', readyExtras(syncParsed), readyExtras(localParsed)),
      ),
    });
    return;
  }
  try {
    await replayGlobalOutboxUnlocked(sync, local);
  } catch {
    // Local+outbox already committed.
  }
}

export async function persistGlobalBehaviorOverrides(
  mutate: (current: BehaviorOverrides, now: number) => BehaviorOverrides,
  deps: BehaviorDefaultsDeps = {},
): Promise<void> {
  return enqueueStorageMutation(GLOBAL_DEFAULTS_LOCK, async () => {
    const { sync, local, now } = stores(deps);
    const at = now();
    const copies = await readCopies(sync, local);
    const localMeta = await local.get(GLOBAL_HLC_KEY);
    const clock = parseHybridClockRecord(localMeta[GLOBAL_HLC_KEY]);
    if (clock.status === 'corrupt') {
      console.warn('Failed to parse global hybrid clock', localMeta[GLOBAL_HLC_KEY]);
    }
    assertHybridClockUsable(clock);
    const issued = issueHybridTimestamp(
      clock,
      at,
      collectOverrideTimestamps(
        readyRecord(copies.syncParsed)?.overrides,
        readyRecord(copies.localParsed)?.overrides,
      ),
    );
    const next: GlobalBehaviorSettingsV1 = {
      schemaVersion: 1,
      overrides: mutate(copies.merged, issued.timestamp),
    };
    await persistGlobalRecord(
      sync,
      local,
      next,
      copies.syncParsed,
      copies.localParsed,
      issued.record,
    );
  });
}

export async function persistGlobalBehaviorChanges(
  changes: readonly BehaviorSettingChange[],
  deps: BehaviorDefaultsDeps = {},
): Promise<void> {
  await persistGlobalBehaviorOverrides((current, at) => {
    let next = current;
    for (const change of changes) {
      next = applyBehaviorSettingChange(next, change, at);
    }
    return next;
  }, deps);
}

export async function persistGlobalBehaviorChange(
  change: BehaviorSettingChange,
  deps: BehaviorDefaultsDeps = {},
): Promise<void> {
  await persistGlobalBehaviorChanges([change], deps);
}

export async function resetGlobalBehaviorOverrides(
  deps: BehaviorDefaultsDeps = {},
  options: { ifUnsupported?: 'throw' | 'skip' } = {},
): Promise<'reset' | 'skipped'> {
  return enqueueStorageMutation(GLOBAL_DEFAULTS_LOCK, async () => {
    const { sync, local, now } = stores(deps);
    const at = now();
    const copies = await readCopies(sync, local);
    if (cannotSafelyDestroy(copies.syncParsed) || cannotSafelyDestroy(copies.localParsed)) {
      if (options.ifUnsupported === 'skip') {
        return 'skipped';
      }
      throw new Error(SETTINGS_CREATED_BY_NEWER_VERSION);
    }
    const localMeta = await local.get(GLOBAL_HLC_KEY);
    const clock = parseHybridClockRecord(localMeta[GLOBAL_HLC_KEY]);
    if (clock.status === 'corrupt') {
      console.warn('Failed to parse global hybrid clock', localMeta[GLOBAL_HLC_KEY]);
    }
    assertHybridClockUsable(clock);
    const issued = issueHybridTimestamp(
      clock,
      at,
      collectOverrideTimestamps(
        readyRecord(copies.syncParsed)?.overrides,
        readyRecord(copies.localParsed)?.overrides,
      ),
    );
    const next: GlobalBehaviorSettingsV1 = {
      schemaVersion: 1,
      overrides: inheritAllEditableFields(issued.timestamp),
    };
    await persistGlobalRecord(sync, local, next, copies.syncParsed, copies.localParsed, issued.record);
    return 'reset';
  });
}


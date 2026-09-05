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
import {
  SETTINGS_CREATED_BY_NEWER_VERSION,
  cannotSafelyDestroy,
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

async function writeGlobalSides(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
  record: GlobalBehaviorSettingsV1,
  syncParsed: SettingsParseResult<GlobalBehaviorSettingsV1>,
  localParsed: SettingsParseResult<GlobalBehaviorSettingsV1>,
): Promise<void> {
  if (isUnsupportedCopy(syncParsed) && isUnsupportedCopy(localParsed)) {
    throw new Error(SETTINGS_CREATED_BY_NEWER_VERSION);
  }
  const syncExtras = readyExtras(syncParsed);
  const localExtras = readyExtras(localParsed);
  const writes: Promise<unknown>[] = [];
  if (!isUnsupportedCopy(localParsed)) {
    writes.push(
      local
        .set({
          [GLOBAL_BEHAVIOR_KEY]: serializeGlobalRecord(
            record,
            extrasForDestination('local', syncExtras, localExtras),
          ),
        })
        .catch((error: unknown) => error),
    );
  }
  if (!isUnsupportedCopy(syncParsed)) {
    writes.push(
      sync
        .set({
          [GLOBAL_BEHAVIOR_KEY]: serializeGlobalRecord(
            record,
            extrasForDestination('sync', syncExtras, localExtras),
          ),
        })
        .catch((error: unknown) => error),
    );
  }
  const results = await Promise.all(writes);
  const failure = results.find((result) => result != null);
  if (failure instanceof Error) {
    throw failure;
  }
  if (failure) {
    throw new Error('Failed to persist global behavior');
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
    const next: GlobalBehaviorSettingsV1 = {
      schemaVersion: 1,
      overrides: mutate(copies.merged, at),
    };
    await writeGlobalSides(sync, local, next, copies.syncParsed, copies.localParsed);
  });
}

export async function persistGlobalBehaviorChanges(
  changes: readonly BehaviorSettingChange[],
  deps: BehaviorDefaultsDeps = {},
): Promise<void> {
  await persistGlobalBehaviorOverrides((current, now) => {
    let next = current;
    for (const change of changes) {
      next = applyBehaviorSettingChange(next, change, now);
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
    const copies = await readCopies(sync, local);
    if (cannotSafelyDestroy(copies.syncParsed) || cannotSafelyDestroy(copies.localParsed)) {
      if (options.ifUnsupported === 'skip') {
        return 'skipped';
      }
      throw new Error(SETTINGS_CREATED_BY_NEWER_VERSION);
    }
    const next: GlobalBehaviorSettingsV1 = {
      schemaVersion: 1,
      overrides: inheritAllEditableFields(now()),
    };
    await writeGlobalSides(sync, local, next, copies.syncParsed, copies.localParsed);
    return 'reset';
  });
}

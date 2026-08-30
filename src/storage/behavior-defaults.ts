// SPDX-License-Identifier: GPL-3.0-only

import {
  GLOBAL_BEHAVIOR_KEY,
  REPAIR_BACKOFF_MS,
  behaviorOverridesEqual,
  mergeBehaviorOverrides,
  parseGlobalBehaviorSettings,
  type BehaviorOverrides,
  type GlobalBehaviorSettingsV1,
} from '../settings/site-behavior';
import { defaultLocalStore, defaultSyncStore, type DurableSettingsStore } from './durable-store';

export type StorageClock = () => number;

export type BehaviorDefaultsDeps = {
  sync?: DurableSettingsStore;
  local?: DurableSettingsStore;
  now?: StorageClock;
};

const repairAttemptedAt = new Map<string, number>();

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
  repairAttemptedAt.delete(GLOBAL_BEHAVIOR_KEY);
}

async function readParsed(store: DurableSettingsStore): Promise<GlobalBehaviorSettingsV1 | null> {
  const result = await store.get(GLOBAL_BEHAVIOR_KEY);
  return parseGlobalBehaviorSettings(result[GLOBAL_BEHAVIOR_KEY]);
}

export async function readGlobalBehaviorOverrides(
  deps: BehaviorDefaultsDeps = {},
): Promise<BehaviorOverrides> {
  const { sync, local, now } = stores(deps);
  const [syncRecord, localRecord] = await Promise.all([readParsed(sync), readParsed(local)]);
  const merged = mergeBehaviorOverrides(syncRecord?.overrides ?? {}, localRecord?.overrides ?? {});
  await maybeRepairGlobal(sync, local, syncRecord, localRecord, merged, now());
  return merged;
}

async function maybeRepairGlobal(
  sync: DurableSettingsStore,
  local: DurableSettingsStore,
  syncRecord: GlobalBehaviorSettingsV1 | null,
  localRecord: GlobalBehaviorSettingsV1 | null,
  merged: BehaviorOverrides,
  now: number,
): Promise<void> {
  const record: GlobalBehaviorSettingsV1 = { schemaVersion: 1, overrides: merged };
  if (!behaviorOverridesEqual(localRecord?.overrides ?? {}, merged)) {
    try {
      await local.set({ [GLOBAL_BEHAVIOR_KEY]: record });
    } catch {
      // Local repair must not change the resolved value.
    }
  }
  if (!behaviorOverridesEqual(syncRecord?.overrides ?? {}, merged)) {
    const last = repairAttemptedAt.get(GLOBAL_BEHAVIOR_KEY);
    if (last != null && now - last < REPAIR_BACKOFF_MS) {
      return;
    }
    repairAttemptedAt.set(GLOBAL_BEHAVIOR_KEY, now);
    try {
      await sync.set({ [GLOBAL_BEHAVIOR_KEY]: record });
    } catch {
      // Sync repair failure is ignored on read.
    }
  }
}

export async function persistGlobalBehaviorOverrides(
  mutate: (current: BehaviorOverrides, now: number) => BehaviorOverrides,
  deps: BehaviorDefaultsDeps = {},
): Promise<void> {
  const { sync, local, now } = stores(deps);
  const at = now();
  const [syncRecord, localRecord] = await Promise.all([readParsed(sync), readParsed(local)]);
  const merged = mergeBehaviorOverrides(syncRecord?.overrides ?? {}, localRecord?.overrides ?? {});
  const next: GlobalBehaviorSettingsV1 = {
    schemaVersion: 1,
    overrides: mutate(merged, at),
  };
  const writes = [
    local.set({ [GLOBAL_BEHAVIOR_KEY]: next }).catch((error: unknown) => error),
    sync.set({ [GLOBAL_BEHAVIOR_KEY]: next }).catch((error: unknown) => error),
  ];
  const results = await Promise.all(writes);
  const failure = results.find((result) => result instanceof Error);
  if (failure instanceof Error) {
    throw failure;
  }
}

// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import { LogicalValueSchema } from '../settings/behavior-schema';
import { parseSchemaVersionedControl, type ControlMetadataParse } from './control-metadata';
import type { MergedGeneration, ParsedGeneration } from './site-generation';

export const SITE_OUTBOX_KEY = 'meta:dirty:sites';
export const GLOBAL_OUTBOX_KEY = 'meta:dirty:global';

export const REPLICA_OUTBOX_UNSUPPORTED = 'Replica outbox metadata is unsupported';
export const REPLICA_OUTBOX_CORRUPT = 'Replica outbox metadata is corrupt';

export type SiteResetAllIntent = {
  epoch: number;
  cleanupPending: boolean;
};

export type SiteReplicaOutbox = {
  schemaVersion: 1;
  publishSites: string[];
  resetAll?: SiteResetAllIntent;
};

export type GlobalReplicaOutbox = {
  schemaVersion: 1;
  publish: boolean;
};

const SiteResetAllSchema = z.object({
  epoch: LogicalValueSchema,
  cleanupPending: z.boolean(),
});

const SiteOutboxV1Schema = z.object({
  publishSites: z.array(z.string().min(1)),
});

const GlobalOutboxV1Schema = z.object({
  publish: z.boolean(),
});

export function parseSiteReplicaOutbox(raw: unknown): ControlMetadataParse<SiteReplicaOutbox> {
  return parseSchemaVersionedControl(raw, (record) => {
    const parsed = SiteOutboxV1Schema.safeParse(record);
    if (!parsed.success) {
      return null;
    }
    let resetAll: SiteResetAllIntent | undefined;
    if (record.resetAll != null) {
      const intent = SiteResetAllSchema.safeParse(record.resetAll);
      if (!intent.success) {
        return null;
      }
      resetAll = intent.data;
    }
    return {
      schemaVersion: 1,
      publishSites: [...new Set(parsed.data.publishSites)],
      resetAll,
    };
  });
}

export function parseGlobalReplicaOutbox(raw: unknown): ControlMetadataParse<GlobalReplicaOutbox> {
  return parseSchemaVersionedControl(raw, (record) => {
    const parsed = GlobalOutboxV1Schema.safeParse(record);
    return parsed.success ? { schemaVersion: 1, publish: parsed.data.publish } : null;
  });
}

export function emptySiteOutbox(): SiteReplicaOutbox {
  return { schemaVersion: 1, publishSites: [] };
}

export function emptyGlobalOutbox(): GlobalReplicaOutbox {
  return { schemaVersion: 1, publish: false };
}

export function siteOutboxIsIdle(outbox: SiteReplicaOutbox): boolean {
  return outbox.publishSites.length === 0 && outbox.resetAll == null;
}

export function addPublishSite(outbox: SiteReplicaOutbox, storageKey: string): SiteReplicaOutbox {
  if (outbox.publishSites.includes(storageKey)) {
    return outbox;
  }
  return {
    schemaVersion: 1,
    publishSites: [...outbox.publishSites, storageKey],
    resetAll: outbox.resetAll,
  };
}

export function applyResetAllToOutbox(
  outbox: SiteReplicaOutbox,
  epoch: number,
  resetKeys: readonly string[],
): SiteReplicaOutbox {
  const reset = new Set(resetKeys);
  return {
    schemaVersion: 1,
    publishSites: outbox.publishSites.filter((key) => !reset.has(key)),
    resetAll: { epoch, cleanupPending: true },
  };
}

export function removePublishSites(
  outbox: SiteReplicaOutbox,
  keys: readonly string[],
): SiteReplicaOutbox {
  if (keys.length === 0) {
    return outbox;
  }
  const drop = new Set(keys);
  return {
    schemaVersion: 1,
    publishSites: outbox.publishSites.filter((key) => !drop.has(key)),
    resetAll: outbox.resetAll,
  };
}

export function clearResetAll(outbox: SiteReplicaOutbox): SiteReplicaOutbox {
  if (!outbox.resetAll) {
    return outbox;
  }
  return { schemaVersion: 1, publishSites: outbox.publishSites };
}

export function serializeSiteOutbox(outbox: SiteReplicaOutbox): SiteReplicaOutbox {
  return outbox.resetAll
    ? {
        schemaVersion: 1,
        publishSites: outbox.publishSites,
        resetAll: outbox.resetAll,
      }
    : { schemaVersion: 1, publishSites: outbox.publishSites };
}

export function serializeGlobalOutbox(publish: boolean): GlobalReplicaOutbox {
  return { schemaVersion: 1, publish };
}

export function usableSiteOutbox(
  parsed: ControlMetadataParse<SiteReplicaOutbox>,
): SiteReplicaOutbox {
  if (parsed.status === 'unsupported') {
    throw new Error(REPLICA_OUTBOX_UNSUPPORTED);
  }
  if (parsed.status === 'corrupt') {
    throw new Error(REPLICA_OUTBOX_CORRUPT);
  }
  return parsed.status === 'valid' ? parsed.value : emptySiteOutbox();
}

export function usableGlobalOutbox(
  parsed: ControlMetadataParse<GlobalReplicaOutbox>,
): GlobalReplicaOutbox {
  if (parsed.status === 'unsupported') {
    throw new Error(REPLICA_OUTBOX_UNSUPPORTED);
  }
  if (parsed.status === 'corrupt') {
    throw new Error(REPLICA_OUTBOX_CORRUPT);
  }
  return parsed.status === 'valid' ? parsed.value : emptyGlobalOutbox();
}

export type ResetAllReplayDecision = 'superseded' | 'active' | 'pending';

export function decideResetAllReplay(
  resetAll: SiteResetAllIntent,
  merged: MergedGeneration,
): ResetAllReplayDecision {
  if (merged.status === 'unknown') {
    return 'pending';
  }
  if (resetAll.epoch < merged.epoch) {
    return 'superseded';
  }
  if (resetAll.epoch === merged.epoch) {
    return 'active';
  }
  return 'pending';
}

export type PublishSiteReplayDecision =
  | { action: 'obsolete' }
  | { action: 'eligible'; publishGenerationFirst: boolean }
  | { action: 'pending' }
  | { action: 'ineligible' };

export function decidePublishSiteReplay(
  siteGeneration: ParsedGeneration,
  merged: MergedGeneration,
  syncEpoch: number | null,
): PublishSiteReplayDecision {
  if (siteGeneration.status === 'unknown') {
    return { action: 'ineligible' };
  }
  if (merged.status === 'unknown') {
    return { action: 'pending' };
  }
  const generation = siteGeneration.value;
  if (generation < merged.epoch) {
    return { action: 'obsolete' };
  }
  if (generation > merged.epoch) {
    return { action: 'pending' };
  }
  const syncBehind = syncEpoch == null || syncEpoch < merged.epoch;
  return { action: 'eligible', publishGenerationFirst: syncBehind };
}

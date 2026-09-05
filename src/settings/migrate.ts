// SPDX-License-Identifier: GPL-3.0-only

/**
 * Versioned settings parse and rewrite.
 *
 * Adding an optional setting does not bump schemaVersion. Changing the
 * representation or meaning of an existing field does: add a migrator and
 * increment CURRENT_BEHAVIOR_SCHEMA_VERSION or CURRENT_THEME_SCHEMA_VERSION.
 *
 * Unknown envelope or override-map keys are preserved on rewrite. Malformed
 * known fields are dropped. Extra keys inside a known Override object fail
 * that field only. schemaVersion newer than this build is unsupported and
 * must never be rewritten as V1.
 */

import { parseReadyGlobalBehaviorSettings, parseReadySiteSettings } from './behavior-schema';
import {
  toSyncEligibleSiteRecord,
  type GlobalBehaviorSettingsV1,
  type SiteSettingsV1,
} from './site-behavior';
import {
  EMPTY_OPAQUE_FIELDS,
  emptyOpaqueFields,
  extrasForDestination,
  hasOpaqueContent,
  mergeOpaqueFields,
  serializedRecordsEqual,
  type OpaqueFields,
} from './opaque-fields';

export const CURRENT_BEHAVIOR_SCHEMA_VERSION = 1;
export const CURRENT_THEME_SCHEMA_VERSION = 1;

export const SETTINGS_CREATED_BY_NEWER_VERSION = 'Settings were created by a newer version';

export type SettingsParseResult<T> =
  | { status: 'ready'; record: T; extras: OpaqueFields }
  | { status: 'unsupported'; schemaVersion: number }
  | { status: 'invalid' };

export {
  EMPTY_OPAQUE_FIELDS,
  emptyOpaqueFields,
  extrasForDestination,
  hasOpaqueContent,
  mergeOpaqueFields,
  serializedRecordsEqual,
  type OpaqueFields,
};

export function detectVersion(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion;
  if (
    typeof schemaVersion === 'number' &&
    Number.isSafeInteger(schemaVersion) &&
    schemaVersion >= 1
  ) {
    return schemaVersion;
  }
  return null;
}

export function migrateByDetectedVersion<T>(
  value: unknown,
  parseV1: (value: unknown) => { record: T; extras: OpaqueFields } | null,
  currentVersion: number,
): SettingsParseResult<T> {
  const version = detectVersion(value);
  if (version == null) {
    return { status: 'invalid' };
  }
  if (version > currentVersion) {
    return { status: 'unsupported', schemaVersion: version };
  }
  if (version !== 1) {
    return { status: 'invalid' };
  }
  const parsed = parseV1(value);
  if (!parsed) {
    return { status: 'invalid' };
  }
  return { status: 'ready', record: parsed.record, extras: parsed.extras };
}

export function migrateSiteSettings(value: unknown): SettingsParseResult<SiteSettingsV1> {
  return migrateByDetectedVersion(value, parseReadySiteSettings, CURRENT_BEHAVIOR_SCHEMA_VERSION);
}

export function migrateGlobalBehaviorSettings(
  value: unknown,
): SettingsParseResult<GlobalBehaviorSettingsV1> {
  return migrateByDetectedVersion(
    value,
    parseReadyGlobalBehaviorSettings,
    CURRENT_BEHAVIOR_SCHEMA_VERSION,
  );
}

export function serializeSiteRecord(
  record: SiteSettingsV1,
  extras: OpaqueFields,
): Record<string, unknown> {
  return {
    ...extras.record,
    schemaVersion: 1,
    lastUsedAt: record.lastUsedAt,
    overrides: {
      ...extras.overrides,
      ...record.overrides,
    },
  };
}

export function serializeGlobalRecord(
  record: GlobalBehaviorSettingsV1,
  extras: OpaqueFields,
): Record<string, unknown> {
  return {
    ...extras.record,
    schemaVersion: 1,
    overrides: {
      ...extras.overrides,
      ...record.overrides,
    },
  };
}

export function projectSyncEligibleSite(
  record: SiteSettingsV1,
  extras: OpaqueFields,
  now: number,
): { record: SiteSettingsV1; extras: OpaqueFields } | null {
  const known = toSyncEligibleSiteRecord(record, now);
  if (!known && !hasOpaqueContent(extras)) {
    return null;
  }
  return {
    record: known ?? { schemaVersion: 1, overrides: {}, lastUsedAt: record.lastUsedAt },
    extras,
  };
}

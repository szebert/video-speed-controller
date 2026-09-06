// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import type { Equal } from '../types/equal';
import { EDITABLE_BEHAVIOR_FIELDS, type EditableBehaviorField } from './behavior-fields';
import { behaviorValueSchemas } from './behavior-schema';
import { normalizeSiteHostname } from './site-hostname';
import {
  canonicalizeBehaviorSettingChange,
  type BehaviorFieldValue,
  type BehaviorOverrides,
  type BehaviorSettingChange,
} from './site-behavior';
import type { ThemePreference } from './theme';

export const CURRENT_BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 4 * 1024 * 1024;
export const MAX_BACKUP_SITES = 10_000;
export const MAX_BACKUP_HOSTNAME_LENGTH = 253;

export const BACKUP_CREATED_BY_NEWER_VERSION =
  'This backup was created by a newer version of Video Speed Controller.';
export const BACKUP_INVALID = 'This file is not a valid Video Speed Controller backup.';
export const BACKUP_TOO_LARGE = 'This backup file is too large.';
export const BACKUP_TOO_MANY_SITES = 'This backup contains too many sites.';

export type LogicalFieldValues = {
  [K in EditableBehaviorField]?: BehaviorFieldValue<K>;
};

export type LogicalBackup = {
  formatVersion: 1;
  global: LogicalFieldValues;
  sites: Record<string, LogicalFieldValues>;
  theme?: ThemePreference;
};

export type BackupSiteRank = {
  hostname: string;
  lastUsedAt: number;
};

export type BackupParseResult =
  | { status: 'ready'; backup: LogicalBackup }
  | { status: 'unsupported'; formatVersion: number }
  | { status: 'invalid'; error: string };

type OptionalBehaviorValueShape = {
  [K in EditableBehaviorField]: z.ZodOptional<(typeof behaviorValueSchemas)[K]>;
};

function optionalBehaviorValueShape(): OptionalBehaviorValueShape {
  const shape = {} as OptionalBehaviorValueShape;
  for (const field of EDITABLE_BEHAVIOR_FIELDS) {
    Object.assign(shape, { [field]: behaviorValueSchemas[field].optional() });
  }
  return shape;
}

// Privileged JSON only. Optional storage value schemas — not a Mini/RPC twin.
const LogicalFieldValuesSchema = z.strictObject(optionalBehaviorValueShape());

true satisfies Equal<z.infer<typeof LogicalFieldValuesSchema>, LogicalFieldValues>;

const BackupFormatV1Schema = z.strictObject({
  formatVersion: z.literal(1),
  global: LogicalFieldValuesSchema.optional(),
  sites: z.record(z.string(), LogicalFieldValuesSchema).optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
});

export const LogicalBackupSchema = z.object({
  formatVersion: z.literal(1),
  global: LogicalFieldValuesSchema,
  sites: z.record(z.string(), LogicalFieldValuesSchema),
  theme: z.enum(['dark', 'light', 'system']).optional(),
});

export function utf8BackupByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function rankBackupSitesNewestFirst(sites: readonly BackupSiteRank[]): BackupSiteRank[] {
  return [...sites].sort((left, right) => {
    if (right.lastUsedAt !== left.lastUsedAt) {
      return right.lastUsedAt - left.lastUsedAt;
    }
    if (left.hostname < right.hostname) {
      return -1;
    }
    if (left.hostname > right.hostname) {
      return 1;
    }
    return 0;
  });
}

export function fitLogicalBackup(
  backup: LogicalBackup,
  rankedNewestFirst: readonly string[],
  limits: { maxSites?: number; maxBytes?: number } = {},
): LogicalBackup {
  const maxSites = limits.maxSites ?? MAX_BACKUP_SITES;
  const maxBytes = limits.maxBytes ?? MAX_BACKUP_BYTES;
  const ranked = new Set(rankedNewestFirst);
  const unranked = Object.keys(backup.sites)
    .filter((hostname) => !ranked.has(hostname))
    .sort();
  const present: string[] = [];
  const seen = new Set<string>();
  for (const hostname of [...rankedNewestFirst, ...unranked]) {
    if (seen.has(hostname) || backup.sites[hostname] == null) {
      continue;
    }
    seen.add(hostname);
    present.push(hostname);
  }
  let picked = present.slice(0, maxSites);
  const rebuild = (hostnames: readonly string[]): LogicalBackup => {
    const sites: Record<string, LogicalFieldValues> = {};
    for (const hostname of hostnames) {
      const fields = backup.sites[hostname];
      if (fields) {
        sites[hostname] = fields;
      }
    }
    return {
      formatVersion: 1,
      global: backup.global,
      sites,
      ...(backup.theme ? { theme: backup.theme } : {}),
    };
  };
  let next = rebuild(picked);
  while (picked.length > 0 && utf8BackupByteLength(serializeBackup(next)) > maxBytes) {
    picked = picked.slice(0, -1);
    next = rebuild(picked);
  }
  if (utf8BackupByteLength(serializeBackup(next)) > maxBytes) {
    throw new Error(BACKUP_TOO_LARGE);
  }
  return next;
}

function detectFormatVersion(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const formatVersion = (value as { formatVersion?: unknown }).formatVersion;
  if (
    typeof formatVersion === 'number' &&
    Number.isSafeInteger(formatVersion) &&
    formatVersion >= 1
  ) {
    return formatVersion;
  }
  return null;
}

function orderedFields(values: LogicalFieldValues): LogicalFieldValues {
  const next: LogicalFieldValues = {};
  for (const field of EDITABLE_BEHAVIOR_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(values, field) && values[field] !== undefined) {
      Object.assign(next, { [field]: values[field] });
    }
  }
  return next;
}

function canonicalizeLogicalFields(raw: LogicalFieldValues): LogicalFieldValues | null {
  const next: LogicalFieldValues = {};
  for (const field of EDITABLE_BEHAVIOR_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(raw, field) || raw[field] === undefined) {
      continue;
    }
    const change = canonicalizeBehaviorSettingChange({
      kind: 'value',
      field,
      value: raw[field],
    } as BehaviorSettingChange);
    if (!change || change.kind !== 'value') {
      return null;
    }
    Object.assign(next, { [field]: change.value });
  }
  return next;
}

export function projectLogicalFieldValues(overrides: BehaviorOverrides): LogicalFieldValues {
  const values: LogicalFieldValues = {};
  for (const field of EDITABLE_BEHAVIOR_FIELDS) {
    const current = overrides[field];
    if (current?.kind === 'value') {
      Object.assign(values, { [field]: current.value });
    }
  }
  return values;
}

export function logicalFieldChanges(values: LogicalFieldValues): BehaviorSettingChange[] {
  const changes: BehaviorSettingChange[] = [];
  for (const field of EDITABLE_BEHAVIOR_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(values, field) || values[field] === undefined) {
      continue;
    }
    const change = canonicalizeBehaviorSettingChange({
      kind: 'value',
      field,
      value: values[field],
    } as BehaviorSettingChange);
    if (change) {
      changes.push(change);
    }
  }
  return changes;
}

export function projectBackup(input: {
  global: BehaviorOverrides;
  sites: Record<string, BehaviorOverrides>;
  theme: ThemePreference;
}): LogicalBackup {
  const sites: Record<string, LogicalFieldValues> = {};
  for (const hostname of Object.keys(input.sites).sort()) {
    const fields = orderedFields(projectLogicalFieldValues(input.sites[hostname] ?? {}));
    if (Object.keys(fields).length > 0) {
      sites[hostname] = fields;
    }
  }
  return {
    formatVersion: 1,
    global: orderedFields(projectLogicalFieldValues(input.global)),
    sites,
    theme: input.theme,
  };
}

export function serializeBackup(backup: LogicalBackup): string {
  const sites: Record<string, LogicalFieldValues> = {};
  for (const hostname of Object.keys(backup.sites).sort()) {
    const fields = orderedFields(backup.sites[hostname] ?? {});
    if (Object.keys(fields).length > 0) {
      sites[hostname] = fields;
    }
  }
  return `${JSON.stringify(
    {
      formatVersion: 1,
      global: orderedFields(backup.global),
      sites,
      theme: backup.theme,
    },
    null,
    2,
  )}\n`;
}

function invalid(error = BACKUP_INVALID): BackupParseResult {
  return { status: 'invalid', error };
}

function parseBackupV1(value: unknown): BackupParseResult {
  const parsed = BackupFormatV1Schema.safeParse(value);
  if (!parsed.success) {
    return invalid();
  }
  const rawSites = parsed.data.sites ?? {};
  const sourceNames = Object.keys(rawSites);
  if (sourceNames.length > MAX_BACKUP_SITES) {
    return invalid(BACKUP_TOO_MANY_SITES);
  }
  const global = canonicalizeLogicalFields(parsed.data.global ?? {});
  if (!global) {
    return invalid();
  }
  const sites: Record<string, LogicalFieldValues> = {};
  const seen = new Map<string, string>();
  for (const source of sourceNames) {
    if (source.length > MAX_BACKUP_HOSTNAME_LENGTH) {
      return invalid(`Hostname too long: "${source}"`);
    }
    const hostname = normalizeSiteHostname(source);
    if (!hostname) {
      return invalid(`Invalid hostname: "${source}"`);
    }
    const previous = seen.get(hostname);
    if (previous !== undefined) {
      return invalid(`Duplicate site hostname: "${previous}" and "${source}"`);
    }
    seen.set(hostname, source);
    const fields = canonicalizeLogicalFields(rawSites[source] ?? {});
    if (!fields) {
      return invalid();
    }
    if (Object.keys(fields).length > 0) {
      sites[hostname] = fields;
    }
  }
  return {
    status: 'ready',
    backup: {
      formatVersion: 1,
      global,
      sites,
      ...(parsed.data.theme ? { theme: parsed.data.theme } : {}),
    },
  };
}

export function migrateBackup(value: unknown): BackupParseResult {
  const formatVersion = detectFormatVersion(value);
  if (formatVersion == null) {
    return invalid();
  }
  if (formatVersion > CURRENT_BACKUP_FORMAT_VERSION) {
    return { status: 'unsupported', formatVersion };
  }
  if (formatVersion !== 1) {
    return invalid();
  }
  return parseBackupV1(value);
}

export function parseBackupText(text: string): BackupParseResult {
  if (utf8BackupByteLength(text) > MAX_BACKUP_BYTES) {
    return invalid(BACKUP_TOO_LARGE);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return invalid();
  }
  return migrateBackup(parsed);
}

// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import type { Equal } from '../types/equal';
import { EDITABLE_BEHAVIOR_FIELDS, type EditableBehaviorField } from './behavior-fields';
import { normalizeSiteHostname } from './site-hostname';
import {
  canonicalizeBehaviorSettingChange,
  type BehaviorFieldValue,
  type BehaviorOverrides,
  type BehaviorSettingChange,
  type OverlayPosition,
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

export type BackupParseResult =
  | { status: 'ready'; backup: LogicalBackup }
  | { status: 'unsupported'; formatVersion: number }
  | { status: 'invalid'; error: string };

// Historical formatVersion 1 field contract. Do not compose this from the live
// storage salvage schemas — changing a current range must not change what a V1
// file means. Import still canonicalizes through the current domain after parse.
const BackupV1DelaySchema = z
  .number()
  .refine(Number.isInteger)
  .refine((value) => value >= 0);

const BackupV1OverlayPositionSchema = z.literal([
  0, 1, 2, 3, 4, 5, 6, 7, 8,
]) satisfies z.ZodType<OverlayPosition>;

const LogicalFieldValuesSchema = z.strictObject({
  speed: z.number().optional(),
  speedMin: z.number().optional(),
  speedMax: z.number().optional(),
  speedTick: z.number().optional(),
  overlayVisible: z.boolean().optional(),
  overlayPosition: BackupV1OverlayPositionSchema.optional(),
  overlayPositionButton: z.boolean().optional(),
  overlaySettingsButton: z.boolean().optional(),
  overlayAutoHide: z.boolean().optional(),
  overlayHoverHold: z.boolean().optional(),
  overlayAutoHideDelayMs: BackupV1DelaySchema.optional(),
});

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

export function assertCompleteBackup(
  backup: LogicalBackup,
  limits: { maxSites?: number; maxBytes?: number } = {},
): void {
  const maxSites = limits.maxSites ?? MAX_BACKUP_SITES;
  const maxBytes = limits.maxBytes ?? MAX_BACKUP_BYTES;
  if (Object.keys(backup.sites).length > maxSites) {
    throw new Error(BACKUP_TOO_MANY_SITES);
  }
  if (utf8BackupByteLength(serializeBackup(backup)) > maxBytes) {
    throw new Error(BACKUP_TOO_LARGE);
  }
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
  // formatVersion 1 is the historical on-disk contract. A future V2 must keep
  // parseBackupV1 unchanged and add migrateBackupV1ToCurrent plus fixtures.
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

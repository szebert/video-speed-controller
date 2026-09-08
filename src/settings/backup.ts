// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import type { Equal } from '../types/equal';
import { EDITABLE_BEHAVIOR_FIELDS, type EditableBehaviorField } from './behavior-fields';
import { normalizeSiteHostname } from './site-hostname';
import { isHotkeyBinding } from './hotkey-binding';
import {
  canonicalizeBehaviorSettingChange,
  canonicalizeHotkeySettingChange,
  SITE_HOTKEY_ACTIONS,
  type BehaviorFieldValue,
  type BehaviorOverrides,
  type BehaviorSettingChange,
  type HotkeyBinding,
  type HotkeySettingChange,
  type OverlayPosition,
  type SiteHotkeyAction,
} from './site-behavior';
import type { ThemePreference } from './theme';

export const CURRENT_BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 4 * 1024 * 1024;
export const MAX_BACKUP_SITES = 10_000;
export const MAX_BACKUP_HOSTNAME_LENGTH = 253;

export const BACKUP_CREATED_BY_NEWER_VERSION =
  'This backup was created by a newer version of Video Speed Controller.';
export const BACKUP_CONTAINS_NEWER_SETTINGS =
  'This backup contains settings added by a newer version of Video Speed Controller.';
export const BACKUP_INVALID = 'This file is not a valid Video Speed Controller backup.';
export const BACKUP_TOO_LARGE = 'This backup file is too large.';
export const BACKUP_TOO_MANY_SITES = 'This backup contains too many sites.';

export type LogicalFieldValues = {
  [K in EditableBehaviorField]?: BehaviorFieldValue<K>;
};

export type LogicalHotkeyValues = Partial<Record<SiteHotkeyAction, HotkeyBinding | null>>;

export type LogicalBackupScope = LogicalFieldValues & {
  hotkeys?: LogicalHotkeyValues;
};

export type LogicalBackup = {
  formatVersion: 1;
  global: LogicalBackupScope;
  sites: Record<string, LogicalBackupScope>;
  theme?: ThemePreference;
};

export type BackupParseResult =
  | { status: 'ready'; backup: LogicalBackup }
  | { status: 'unsupported'; formatVersion: number }
  | { status: 'invalid'; error: string };

// V1 backup protocol. Existing field representations are historical contracts
// and must not change incompatibly. New optional settings may be added while
// remaining formatVersion 1. Increment formatVersion only when an existing
// representation or backup structure changes incompatibly.
//
// Do not compose these from live storage salvage schemas — changing a current
// range must not change what a V1 file is syntactically allowed to contain.
// Import still canonicalizes through the current domain after parse.
const BackupV1NonNegativeIntegerSchema = z
  .number()
  .refine(Number.isInteger)
  .refine((value) => value >= 0);

const BackupV1OverlayPositionSchema = z.literal([
  0, 1, 2, 3, 4, 5, 6, 7, 8,
]) satisfies z.ZodType<OverlayPosition>;

const BackupV1FieldSchema = z.strictObject({
  // Original V1 fields.
  speed: z.number().optional(),
  speedMin: z.number().optional(),
  speedMax: z.number().optional(),
  speedTick: z.number().optional(),
  overlayVisible: z.boolean().optional(),
  overlayPosition: BackupV1OverlayPositionSchema.optional(),
  overlayPositionButton: z.boolean().optional(),
  overlaySettingsButton: z.boolean().optional(),
  overlayHotkeyHints: z.boolean().optional(),
  overlayAutoHide: z.boolean().optional(),
  overlayHoverHold: z.boolean().optional(),
  overlayAutoHideDelayMs: BackupV1NonNegativeIntegerSchema.optional(),
  overlayOpacity: BackupV1NonNegativeIntegerSchema.optional(),
});

// Adding an editable field must also add an optional V1 field.
true satisfies Equal<z.infer<typeof BackupV1FieldSchema>, LogicalFieldValues>;

const BackupV1HotkeyBindingSchema = z.strictObject({
  code: z.string(),
  ctrl: z.boolean(),
  alt: z.boolean(),
  shift: z.boolean(),
  meta: z.boolean(),
}) satisfies z.ZodType<HotkeyBinding>;

const BackupV1HotkeysSchema = z.strictObject({
  increaseSpeed: z.union([BackupV1HotkeyBindingSchema, z.null()]).optional(),
  decreaseSpeed: z.union([BackupV1HotkeyBindingSchema, z.null()]).optional(),
  resetSpeed: z.union([BackupV1HotkeyBindingSchema, z.null()]).optional(),
}) satisfies z.ZodType<LogicalHotkeyValues>;

const BackupV1ScopeSchema = BackupV1FieldSchema.extend({
  hotkeys: BackupV1HotkeysSchema.optional(),
}) satisfies z.ZodType<LogicalBackupScope>;

const BackupFormatV1Schema = z.strictObject({
  formatVersion: z.literal(1),
  global: BackupV1ScopeSchema.optional(),
  sites: z.record(z.string(), BackupV1ScopeSchema).optional(),
  theme: z.enum(['dark', 'light', 'system']).optional(),
});

export const LogicalBackupSchema = z.object({
  formatVersion: z.literal(1),
  global: BackupV1ScopeSchema,
  sites: z.record(z.string(), BackupV1ScopeSchema),
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

function orderedHotkeys(values: LogicalHotkeyValues | undefined): LogicalHotkeyValues | undefined {
  if (!values) {
    return undefined;
  }
  const next: LogicalHotkeyValues = {};
  for (const action of SITE_HOTKEY_ACTIONS) {
    if (Object.prototype.hasOwnProperty.call(values, action)) {
      next[action] = values[action] ?? null;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function orderedScope(values: LogicalBackupScope): LogicalBackupScope {
  const next: LogicalBackupScope = orderedFields(values);
  const hotkeys = orderedHotkeys(values.hotkeys);
  if (hotkeys) {
    next.hotkeys = hotkeys;
  }
  return next;
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

function canonicalizeLogicalHotkeys(
  raw: LogicalHotkeyValues | undefined,
): LogicalHotkeyValues | null | undefined {
  if (!raw) {
    return undefined;
  }
  const next: LogicalHotkeyValues = {};
  for (const action of SITE_HOTKEY_ACTIONS) {
    if (!Object.prototype.hasOwnProperty.call(raw, action)) {
      continue;
    }
    const value = raw[action];
    if (value === null) {
      next[action] = null;
      continue;
    }
    if (!isHotkeyBinding(value)) {
      return null;
    }
    next[action] = value;
  }
  return next;
}

function canonicalizeLogicalScope(raw: LogicalBackupScope): LogicalBackupScope | null {
  const fields = canonicalizeLogicalFields(raw);
  if (!fields) {
    return null;
  }
  const hotkeys = canonicalizeLogicalHotkeys(raw.hotkeys);
  if (hotkeys === null) {
    return null;
  }
  return hotkeys && Object.keys(hotkeys).length > 0 ? { ...fields, hotkeys } : fields;
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

export function projectLogicalHotkeys(
  overrides: BehaviorOverrides,
): LogicalHotkeyValues | undefined {
  const values: LogicalHotkeyValues = {};
  for (const action of SITE_HOTKEY_ACTIONS) {
    const current = overrides.hotkeys?.[action];
    if (current?.kind === 'value') {
      values[action] = current.value;
    }
  }
  return Object.keys(values).length > 0 ? values : undefined;
}

function projectLogicalScope(overrides: BehaviorOverrides): LogicalBackupScope {
  const scope: LogicalBackupScope = projectLogicalFieldValues(overrides);
  const hotkeys = projectLogicalHotkeys(overrides);
  if (hotkeys) {
    scope.hotkeys = hotkeys;
  }
  return scope;
}

export function logicalHotkeyChanges(
  values: LogicalHotkeyValues | undefined,
): HotkeySettingChange[] {
  if (!values) {
    return [];
  }
  const changes: HotkeySettingChange[] = [];
  for (const action of SITE_HOTKEY_ACTIONS) {
    if (!Object.prototype.hasOwnProperty.call(values, action)) {
      continue;
    }
    const change = canonicalizeHotkeySettingChange({
      kind: 'hotkey-value',
      action,
      value: values[action] ?? null,
    });
    if (change) {
      changes.push(change);
    }
  }
  return changes;
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
  const sites: Record<string, LogicalBackupScope> = {};
  for (const hostname of Object.keys(input.sites).sort()) {
    const scope = orderedScope(projectLogicalScope(input.sites[hostname] ?? {}));
    if (Object.keys(scope).length > 0) {
      sites[hostname] = scope;
    }
  }
  return {
    formatVersion: 1,
    global: orderedScope(projectLogicalScope(input.global)),
    sites,
    theme: input.theme,
  };
}

export function serializeBackup(backup: LogicalBackup): string {
  const sites: Record<string, LogicalBackupScope> = {};
  for (const hostname of Object.keys(backup.sites).sort()) {
    const scope = orderedScope(backup.sites[hostname] ?? {});
    if (Object.keys(scope).length > 0) {
      sites[hostname] = scope;
    }
  }
  return `${JSON.stringify(
    {
      formatVersion: 1,
      global: orderedScope(backup.global),
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

function isUnrecognizedSettingKeys(error: z.ZodError): boolean {
  return (
    error.issues.length > 0 &&
    error.issues.every((issue) => {
      if (issue.code !== 'unrecognized_keys') {
        return false;
      }
      const path = issue.path;
      return (
        (path.length === 1 && path[0] === 'global') ||
        (path.length === 2 && path[0] === 'global' && path[1] === 'hotkeys') ||
        (path.length === 2 && path[0] === 'sites') ||
        (path.length === 3 && path[0] === 'sites' && path[2] === 'hotkeys')
      );
    })
  );
}

function parseBackupV1(value: unknown): BackupParseResult {
  const parsed = BackupFormatV1Schema.safeParse(value);
  if (!parsed.success) {
    return invalid(
      isUnrecognizedSettingKeys(parsed.error) ? BACKUP_CONTAINS_NEWER_SETTINGS : BACKUP_INVALID,
    );
  }
  const rawSites = parsed.data.sites ?? {};
  const sourceNames = Object.keys(rawSites);
  if (sourceNames.length > MAX_BACKUP_SITES) {
    return invalid(BACKUP_TOO_MANY_SITES);
  }
  const global = canonicalizeLogicalScope(parsed.data.global ?? {});
  if (!global) {
    return invalid();
  }
  const sites: Record<string, LogicalBackupScope> = {};
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
    const fields = canonicalizeLogicalScope(rawSites[source] ?? {});
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
  // A future V2 must continue accepting all historically valid V1 files.
  // parseBackupV1 may grow to recognize later additive V1 fields.
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

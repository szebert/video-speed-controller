// SPDX-License-Identifier: GPL-3.0-only

import { THEME_KEY } from './site-behavior';
import { defaultSyncStore, type DurableSettingsStore } from '../storage/durable-store';
import {
  CURRENT_THEME_SCHEMA_VERSION,
  SETTINGS_CREATED_BY_NEWER_VERSION,
  migrateByDetectedVersion,
  type SettingsParseResult,
} from './migrate';
import { pickUnknownKeys, type OpaqueFields } from './opaque-fields';

export type ThemePreference = 'dark' | 'light' | 'system';

export const DARK_DEFAULT: ThemePreference = 'dark';

export type ThemeRecordV1 = {
  schemaVersion: 1;
  preference?: ThemePreference;
};

export type ThemeDeps = {
  sync?: DurableSettingsStore;
};

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function parseReadyThemeRecord(
  value: unknown,
): { record: ThemeRecordV1; extras: OpaqueFields } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) {
    return null;
  }
  const record: ThemeRecordV1 = { schemaVersion: 1 };
  if (isThemePreference(raw.preference)) {
    record.preference = raw.preference;
  }
  return {
    record,
    extras: {
      record: pickUnknownKeys(raw, ['schemaVersion', 'preference']),
      overrides: {},
    },
  };
}

export function migrateThemeRecord(value: unknown): SettingsParseResult<ThemeRecordV1> {
  return migrateByDetectedVersion(value, parseReadyThemeRecord, CURRENT_THEME_SCHEMA_VERSION);
}

export function parseThemeRecord(
  value: unknown,
): { schemaVersion: 1; preference: ThemePreference } | null {
  const parsed = migrateThemeRecord(value);
  if (parsed.status !== 'ready' || !parsed.record.preference) {
    return null;
  }
  return { schemaVersion: 1, preference: parsed.record.preference };
}

function serializeThemeRecord(
  record: ThemeRecordV1,
  extras: OpaqueFields,
): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    ...extras.record,
    schemaVersion: 1,
  };
  if (record.preference) {
    serialized.preference = record.preference;
  }
  return serialized;
}

export async function getStoredTheme(deps: ThemeDeps = {}): Promise<ThemePreference> {
  try {
    const sync = deps.sync ?? defaultSyncStore();
    const result = await sync.get(THEME_KEY);
    const parsed = migrateThemeRecord(result[THEME_KEY]);
    if (parsed.status === 'ready') {
      return parsed.record.preference ?? DARK_DEFAULT;
    }
    return DARK_DEFAULT;
  } catch {
    return DARK_DEFAULT;
  }
}

export async function persistTheme(
  preference: ThemePreference,
  deps: ThemeDeps = {},
): Promise<void> {
  const sync = deps.sync ?? defaultSyncStore();
  const existing = await sync.get(THEME_KEY);
  const parsed = migrateThemeRecord(existing[THEME_KEY]);
  if (parsed.status === 'unsupported') {
    throw new Error(SETTINGS_CREATED_BY_NEWER_VERSION);
  }
  const extras = parsed.status === 'ready' ? parsed.extras : { record: {}, overrides: {} };
  await sync.set({
    [THEME_KEY]: serializeThemeRecord({ schemaVersion: 1, preference }, extras),
  });
}

export function resolveColorScheme(
  preference: ThemePreference,
  systemDark: boolean,
): 'dark' | 'light' {
  if (preference === 'system') {
    return systemDark ? 'dark' : 'light';
  }
  return preference;
}

export function applyTheme(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
): void {
  const systemDark =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const scheme = resolveColorScheme(preference, systemDark);
  root.classList.remove('light', 'dark');
  root.classList.add(scheme);
  root.style.colorScheme = scheme;
}

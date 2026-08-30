// SPDX-License-Identifier: GPL-3.0-only

import { THEME_KEY } from './site-behavior';
import { defaultSyncStore, type DurableSettingsStore } from '../storage/durable-store';

export type ThemePreference = 'dark' | 'light' | 'system';

export const DARK_DEFAULT: ThemePreference = 'dark';

export type ThemeRecordV1 = {
  schemaVersion: 1;
  preference: ThemePreference;
};

export type ThemeDeps = {
  sync?: DurableSettingsStore;
};

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function parseThemeRecord(value: unknown): ThemeRecordV1 | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as { schemaVersion?: unknown; preference?: unknown };
  if (record.schemaVersion !== 1 || !isThemePreference(record.preference)) {
    return null;
  }
  return { schemaVersion: 1, preference: record.preference };
}

export async function getStoredTheme(deps: ThemeDeps = {}): Promise<ThemePreference> {
  try {
    const sync = deps.sync ?? defaultSyncStore();
    const result = await sync.get(THEME_KEY);
    return parseThemeRecord(result[THEME_KEY])?.preference ?? DARK_DEFAULT;
  } catch {
    return DARK_DEFAULT;
  }
}

export async function persistTheme(
  preference: ThemePreference,
  deps: ThemeDeps = {},
): Promise<void> {
  const sync = deps.sync ?? defaultSyncStore();
  const record: ThemeRecordV1 = { schemaVersion: 1, preference };
  await sync.set({ [THEME_KEY]: record });
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

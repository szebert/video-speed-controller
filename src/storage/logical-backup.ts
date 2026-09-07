// SPDX-License-Identifier: GPL-3.0-only

import {
  assertCompleteBackup,
  BACKUP_CREATED_BY_NEWER_VERSION,
  BACKUP_TOO_LARGE,
  logicalFieldChanges,
  logicalHotkeyChanges,
  MAX_BACKUP_BYTES,
  parseBackupText,
  projectBackup,
  serializeBackup,
  utf8BackupByteLength,
  type LogicalBackup,
} from '../settings/backup';
import { cannotSafelyDestroy } from '../settings/destroy-policy';
import { SETTINGS_CREATED_BY_NEWER_VERSION } from '../settings/migrate';
import {
  applyBehaviorSettingChange,
  applyHotkeySettingChange,
  inheritAllKnownSettings,
} from '../settings/site-behavior';
import { DARK_DEFAULT, getStoredTheme, persistThemeUnlocked } from '../settings/theme';
import {
  persistGlobalBehaviorOverridesUnlocked,
  readGlobalBehaviorCopiesUnlocked,
  type BehaviorDefaultsDeps,
} from './behavior-defaults';
import {
  importLogicalSitesUnlocked,
  readMergedSiteOverridesUnlocked,
  type SiteSettingsDeps,
} from './site-settings';
import {
  enqueueStorageMutations,
  GLOBAL_DEFAULTS_LOCK,
  SITE_SETTINGS_LOCK,
  THEME_LOCK,
} from './storage-mutation-queue';

export type LogicalBackupDeps = BehaviorDefaultsDeps & SiteSettingsDeps;

export type ImportLogicalSettingsMode = 'merge' | 'replace';

const BACKUP_LOCKS = [GLOBAL_DEFAULTS_LOCK, THEME_LOCK, SITE_SETTINGS_LOCK];

function backupError(
  parsed: { status: 'invalid'; error: string } | { status: 'unsupported' },
): Error {
  if (parsed.status === 'unsupported') {
    return new Error(BACKUP_CREATED_BY_NEWER_VERSION);
  }
  return new Error(parsed.error);
}

export async function exportLogicalBackup(deps: LogicalBackupDeps = {}): Promise<LogicalBackup> {
  return enqueueStorageMutations(BACKUP_LOCKS, async () => {
    const [copies, sites, theme] = await Promise.all([
      readGlobalBehaviorCopiesUnlocked(deps),
      readMergedSiteOverridesUnlocked(deps),
      getStoredTheme({ sync: deps.sync }),
    ]);
    const backup = projectBackup({
      global: copies.merged,
      sites,
      theme,
    });
    assertCompleteBackup(backup);
    return backup;
  });
}

export async function exportLogicalBackupText(deps: LogicalBackupDeps = {}): Promise<string> {
  const text = serializeBackup(await exportLogicalBackup(deps));
  if (utf8BackupByteLength(text) > MAX_BACKUP_BYTES) {
    throw new Error(BACKUP_TOO_LARGE);
  }
  return text;
}

export async function importLogicalSettings(
  text: string,
  mode: ImportLogicalSettingsMode,
  deps: LogicalBackupDeps = {},
): Promise<{ skippedRecordCount: number }> {
  const parsed = parseBackupText(text);
  if (parsed.status !== 'ready') {
    throw backupError(parsed);
  }
  return enqueueStorageMutations(BACKUP_LOCKS, () =>
    importLogicalSettingsUnlocked(parsed.backup, mode, deps),
  );
}

async function importLogicalSettingsUnlocked(
  backup: LogicalBackup,
  mode: ImportLogicalSettingsMode,
  deps: LogicalBackupDeps,
): Promise<{ skippedRecordCount: number }> {
  let skippedRecordCount = 0;
  const globalChanges = logicalFieldChanges(backup.global);
  const globalHotkeyChanges = logicalHotkeyChanges(backup.global.hotkeys);
  const copies = await readGlobalBehaviorCopiesUnlocked(deps);
  const globalBlocked =
    cannotSafelyDestroy(copies.syncParsed) || cannotSafelyDestroy(copies.localParsed);
  if (mode === 'replace') {
    if (globalBlocked) {
      skippedRecordCount += 1;
    } else {
      await persistGlobalBehaviorOverridesUnlocked((_current, at) => {
        let next = inheritAllKnownSettings(at);
        for (const change of globalChanges) {
          next = applyBehaviorSettingChange(next, change, at);
        }
        for (const change of globalHotkeyChanges) {
          next = applyHotkeySettingChange(next, change, at);
        }
        return next;
      }, deps);
    }
  } else if (globalChanges.length > 0 || globalHotkeyChanges.length > 0) {
    if (globalBlocked) {
      skippedRecordCount += 1;
    } else {
      await persistGlobalBehaviorOverridesUnlocked((current, at) => {
        let next = current;
        for (const change of globalChanges) {
          next = applyBehaviorSettingChange(next, change, at);
        }
        for (const change of globalHotkeyChanges) {
          next = applyHotkeySettingChange(next, change, at);
        }
        return next;
      }, deps);
    }
  }

  const sites = await importLogicalSitesUnlocked(
    Object.keys(backup.sites)
      .sort()
      .map((hostname) => ({
        hostname,
        changes: logicalFieldChanges(backup.sites[hostname] ?? {}),
        hotkeyChanges: logicalHotkeyChanges(backup.sites[hostname]?.hotkeys),
      })),
    mode,
    deps,
  );
  skippedRecordCount += sites.skippedRecordCount;

  const theme = mode === 'replace' ? (backup.theme ?? DARK_DEFAULT) : backup.theme;
  if (theme !== undefined) {
    try {
      await persistThemeUnlocked(theme, { sync: deps.sync });
    } catch (error) {
      if (error instanceof Error && error.message === SETTINGS_CREATED_BY_NEWER_VERSION) {
        skippedRecordCount += 1;
      } else {
        throw error;
      }
    }
  }

  return { skippedRecordCount };
}

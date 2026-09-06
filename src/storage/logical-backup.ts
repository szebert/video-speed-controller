// SPDX-License-Identifier: GPL-3.0-only

import {
  BACKUP_CREATED_BY_NEWER_VERSION,
  BACKUP_TOO_LARGE,
  fitLogicalBackup,
  logicalFieldChanges,
  MAX_BACKUP_BYTES,
  parseBackupText,
  projectBackup,
  rankBackupSitesNewestFirst,
  serializeBackup,
  utf8BackupByteLength,
  type BackupSiteRank,
  type LogicalBackup,
} from '../settings/backup';
import type { BehaviorOverrides } from '../settings/site-behavior';
import { cannotSafelyDestroy } from '../settings/destroy-policy';
import { SETTINGS_CREATED_BY_NEWER_VERSION } from '../settings/migrate';
import { applyBehaviorSettingChange, inheritAllEditableFields } from '../settings/site-behavior';
import { DARK_DEFAULT, getStoredTheme, persistThemeUnlocked } from '../settings/theme';
import {
  persistGlobalBehaviorChangesUnlocked,
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

export async function exportLogicalBackup(
  deps: LogicalBackupDeps = {},
  limits?: { maxSites?: number; maxBytes?: number },
): Promise<LogicalBackup> {
  return enqueueStorageMutations(BACKUP_LOCKS, async () => {
    const [copies, sites, theme] = await Promise.all([
      readGlobalBehaviorCopiesUnlocked(deps),
      readMergedSiteOverridesUnlocked(deps),
      getStoredTheme({ sync: deps.sync }),
    ]);
    const overrides: Record<string, BehaviorOverrides> = {};
    const ranks: BackupSiteRank[] = [];
    for (const site of sites) {
      overrides[site.hostname] = site.overrides;
      ranks.push({ hostname: site.hostname, lastUsedAt: site.lastUsedAt });
    }
    const backup = projectBackup({
      global: copies.merged,
      sites: overrides,
      theme,
    });
    return fitLogicalBackup(
      backup,
      rankBackupSitesNewestFirst(ranks).map((site) => site.hostname),
      limits,
    );
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
  const copies = await readGlobalBehaviorCopiesUnlocked(deps);
  const globalBlocked =
    cannotSafelyDestroy(copies.syncParsed) || cannotSafelyDestroy(copies.localParsed);
  if (mode === 'replace') {
    if (globalBlocked) {
      skippedRecordCount += 1;
    } else {
      await persistGlobalBehaviorOverridesUnlocked((_current, at) => {
        let next = inheritAllEditableFields(at);
        for (const change of globalChanges) {
          next = applyBehaviorSettingChange(next, change, at);
        }
        return next;
      }, deps);
    }
  } else if (globalChanges.length > 0) {
    if (globalBlocked) {
      skippedRecordCount += 1;
    } else {
      await persistGlobalBehaviorChangesUnlocked(globalChanges, deps);
    }
  }

  const sites = await importLogicalSitesUnlocked(
    Object.keys(backup.sites)
      .sort()
      .map((hostname) => ({
        hostname,
        changes: logicalFieldChanges(backup.sites[hostname] ?? {}),
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

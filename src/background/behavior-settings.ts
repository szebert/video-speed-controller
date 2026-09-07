// SPDX-License-Identifier: GPL-3.0-only

import type {
  DeleteSiteSettingsRequest,
  DeleteSiteSettingsResponse,
  ExportBackupResponse,
  GetBehaviorSettingsRequest,
  GetBehaviorSettingsResponse,
  GetCustomSitesResponse,
  ImportBackupRequest,
  ImportBackupResponse,
  ResetAllBehaviorRequest,
  ResetAllBehaviorResponse,
  ResetGlobalBehaviorRequest,
  ResetGlobalBehaviorResponse,
  SetBehaviorSettingRequest,
  SetBehaviorSettingResponse,
  SetHotkeySettingRequest,
  SetHotkeySettingResponse,
} from '../protocol/schemas/options-background';
import type {
  BehaviorMutationSuccess,
  BehaviorSettingsSnapshot,
  SiteMembershipUpdate,
} from '../protocol/schemas/shared';
import {
  canonicalizeBehaviorSettingChange,
  canonicalizeHotkeySettingChange,
  resolveSiteBehavior,
  toEditableResolvedBehavior,
  type BehaviorSettingChange,
  type HotkeySettingChange,
} from '../settings/site-behavior';
import { normalizeSiteHostname, siteResolutionUrl } from '../settings/site-hostname';
import {
  persistGlobalBehaviorChanges,
  persistGlobalHotkeyChanges,
  readGlobalBehaviorOverrides,
  resetGlobalBehaviorOverrides,
  type BehaviorDefaultsDeps,
} from '../storage/behavior-defaults';
import { exportLogicalBackupText, importLogicalSettings } from '../storage/logical-backup';
import {
  deleteAllSiteSettings,
  deleteSiteSettings,
  listCustomSiteHostnames,
  persistSiteBehaviorChanges,
  persistSiteHotkeyChanges,
  readSiteMembership,
  resolveSiteBehaviorForUrl,
  type SiteSettingsDeps,
} from '../storage/site-settings';
import { isExtensionPageSender } from './extension-page-sender';
import {
  reapplyBehaviorSettings,
  reapplyModeForFields,
  type ReapplyBehaviorRequest,
  type ReapplyBehaviorSettingsDeps,
} from './reapply-behavior-settings';
import { reapplyHotkeysToTabs, type ReapplyHotkeysDeps } from './reapply-hotkeys';

export type BehaviorSettingsDeps = BehaviorDefaultsDeps &
  SiteSettingsDeps &
  ReapplyBehaviorSettingsDeps &
  ReapplyHotkeysDeps;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function readBehaviorSettingsSnapshot(
  hostname: string | null,
  deps: BehaviorSettingsDeps = {},
): Promise<BehaviorSettingsSnapshot> {
  const globalOverrides = await readGlobalBehaviorOverrides(deps);
  const globalResolved = resolveSiteBehavior(globalOverrides, {});
  const global = toEditableResolvedBehavior(globalResolved);
  const globalHotkeys = globalResolved.hotkeys;
  if (!hostname) {
    return { global, globalHotkeys, site: null };
  }
  const resolved = await resolveSiteBehaviorForUrl(siteResolutionUrl(hostname), {
    ...deps,
    touchUsage: false,
  });
  return {
    global,
    globalHotkeys,
    site: {
      hostname,
      behavior: resolved ? toEditableResolvedBehavior(resolved) : global,
      hotkeys: resolved ? resolved.hotkeys : globalHotkeys,
    },
  };
}

function validatedOptionalHostname(
  hostname: string | undefined,
): { ok: true; hostname: string | null } | { ok: false; error: string } {
  if (hostname == null) {
    return { ok: true, hostname: null };
  }
  const normalized = normalizeSiteHostname(hostname);
  if (!normalized) {
    return { ok: false, error: 'Invalid hostname' };
  }
  return { ok: true, hostname: normalized };
}

async function siteMembershipOf(
  hostname: string,
  deps: BehaviorSettingsDeps,
): Promise<SiteMembershipUpdate | undefined> {
  try {
    return {
      hostname,
      customized: await readSiteMembership(hostname, deps),
    };
  } catch {
    return undefined;
  }
}

async function afterPersist(
  snapshotHostname: string | null,
  request: ReapplyBehaviorRequest,
  deps: BehaviorSettingsDeps,
): Promise<BehaviorMutationSuccess> {
  const reapply = await reapplyBehaviorSettings(request, deps);
  try {
    const state = await readBehaviorSettingsSnapshot(snapshotHostname, deps);
    return {
      ok: true,
      state,
      ...reapply,
    };
  } catch (error) {
    return {
      ok: true,
      snapshotError: errorMessage(error, 'Failed to refresh settings'),
      ...reapply,
    };
  }
}

export async function getBehaviorSettings(
  message: GetBehaviorSettingsRequest,
  sender: chrome.runtime.MessageSender,
  deps: BehaviorSettingsDeps = {},
): Promise<GetBehaviorSettingsResponse> {
  if (!isExtensionPageSender(sender)) {
    return { ok: false, error: 'Unauthorized' };
  }
  const hostname = validatedOptionalHostname(message.hostname);
  if (!hostname.ok) {
    return hostname;
  }
  try {
    return { ok: true, state: await readBehaviorSettingsSnapshot(hostname.hostname, deps) };
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'Failed to read settings') };
  }
}

export async function getCustomSites(
  sender: chrome.runtime.MessageSender,
  deps: BehaviorSettingsDeps = {},
): Promise<GetCustomSitesResponse> {
  if (!isExtensionPageSender(sender)) {
    return { ok: false, error: 'Unauthorized' };
  }
  try {
    return { ok: true, customSites: await listCustomSiteHostnames(deps) };
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'Failed to list sites') };
  }
}

function requestedBehaviorChanges(
  message: SetBehaviorSettingRequest,
): BehaviorSettingChange[] | null {
  const raw = message.changes ?? (message.change ? [message.change] : []);
  const canonical: BehaviorSettingChange[] = [];
  for (const change of raw) {
    const next = canonicalizeBehaviorSettingChange(change);
    if (!next) {
      return null;
    }
    canonical.push(next);
  }
  return canonical.length > 0 ? canonical : null;
}

export async function setBehaviorSetting(
  message: SetBehaviorSettingRequest,
  sender: chrome.runtime.MessageSender,
  deps: BehaviorSettingsDeps = {},
): Promise<SetBehaviorSettingResponse> {
  if (!isExtensionPageSender(sender)) {
    return { ok: false, error: 'Unauthorized' };
  }

  const changes = requestedBehaviorChanges(message);
  if (!changes) {
    return { ok: false, error: 'Invalid change' };
  }

  let persistHostname: string | null = null;
  if (message.scope.kind === 'site') {
    persistHostname = normalizeSiteHostname(message.scope.hostname);
    if (!persistHostname) {
      return { ok: false, error: 'Invalid hostname' };
    }
  }

  const snapshot = validatedOptionalHostname(message.snapshotHostname);
  if (!snapshot.ok) {
    return snapshot;
  }

  try {
    if (message.scope.kind === 'global') {
      await persistGlobalBehaviorChanges(changes, deps);
    } else {
      await persistSiteBehaviorChanges(siteResolutionUrl(persistHostname!), changes, deps);
    }
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'Failed to persist setting') };
  }

  const scope = message.scope.kind === 'global' ? 'global' : 'site';
  const result = await afterPersist(
    snapshot.hostname,
    {
      scope: scope === 'global' ? { kind: 'global' } : { kind: 'site', hostname: persistHostname! },
      mode: reapplyModeForFields(scope, changes),
    },
    deps,
  );
  if (scope === 'site' && persistHostname) {
    const siteMembership = await siteMembershipOf(persistHostname, deps);
    return siteMembership ? { ...result, siteMembership } : result;
  }
  return result;
}

function requestedHotkeyChanges(message: SetHotkeySettingRequest): HotkeySettingChange[] | null {
  const raw = message.changes ?? (message.change ? [message.change] : []);
  const canonical: HotkeySettingChange[] = [];
  for (const change of raw) {
    const next = canonicalizeHotkeySettingChange(change);
    if (!next) {
      return null;
    }
    canonical.push(next);
  }
  return canonical.length > 0 ? canonical : null;
}

export async function setHotkeySetting(
  message: SetHotkeySettingRequest,
  sender: chrome.runtime.MessageSender,
  deps: BehaviorSettingsDeps = {},
): Promise<SetHotkeySettingResponse> {
  if (!isExtensionPageSender(sender)) {
    return { ok: false, error: 'Unauthorized' };
  }

  const changes = requestedHotkeyChanges(message);
  if (!changes) {
    return { ok: false, error: 'Invalid change' };
  }

  let persistHostname: string | null = null;
  if (message.scope.kind === 'site') {
    persistHostname = normalizeSiteHostname(message.scope.hostname);
    if (!persistHostname) {
      return { ok: false, error: 'Invalid hostname' };
    }
  }

  const snapshot = validatedOptionalHostname(message.snapshotHostname);
  if (!snapshot.ok) {
    return snapshot;
  }

  try {
    if (message.scope.kind === 'global') {
      await persistGlobalHotkeyChanges(changes, deps);
    } else {
      await persistSiteHotkeyChanges(siteResolutionUrl(persistHostname!), changes, deps);
    }
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'Failed to persist setting') };
  }

  const reapply = await reapplyHotkeysToTabs(
    message.scope.kind === 'global'
      ? { kind: 'global' }
      : { kind: 'site', hostname: persistHostname! },
    deps,
  );
  let result: BehaviorMutationSuccess;
  try {
    const state = await readBehaviorSettingsSnapshot(snapshot.hostname, deps);
    result = { ok: true, state, ...reapply };
  } catch (error) {
    result = {
      ok: true,
      snapshotError: errorMessage(error, 'Failed to refresh settings'),
      ...reapply,
    };
  }
  if (message.scope.kind === 'site' && persistHostname) {
    const siteMembership = await siteMembershipOf(persistHostname, deps);
    return siteMembership ? { ...result, siteMembership } : result;
  }
  return result;
}

export async function deleteSiteBehaviorSettings(
  message: DeleteSiteSettingsRequest,
  sender: chrome.runtime.MessageSender,
  deps: BehaviorSettingsDeps = {},
): Promise<DeleteSiteSettingsResponse> {
  if (!isExtensionPageSender(sender)) {
    return { ok: false, error: 'Unauthorized' };
  }

  const hostname = normalizeSiteHostname(message.hostname);
  if (!hostname) {
    return { ok: false, error: 'Invalid hostname' };
  }
  const snapshot = validatedOptionalHostname(message.snapshotHostname);
  if (!snapshot.ok) {
    return snapshot;
  }

  try {
    await deleteSiteSettings(hostname, deps);
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'Failed to delete site settings') };
  }

  const result = await afterPersist(
    snapshot.hostname,
    { scope: { kind: 'site', hostname }, mode: 'resolve-target' },
    deps,
  );
  const siteMembership = await siteMembershipOf(hostname, deps);
  return siteMembership ? { ...result, siteMembership } : result;
}

export async function resetGlobalBehaviorSettings(
  message: ResetGlobalBehaviorRequest,
  sender: chrome.runtime.MessageSender,
  deps: BehaviorSettingsDeps = {},
): Promise<ResetGlobalBehaviorResponse> {
  if (!isExtensionPageSender(sender)) {
    return { ok: false, error: 'Unauthorized' };
  }

  const snapshot = validatedOptionalHostname(message.snapshotHostname);
  if (!snapshot.ok) {
    return snapshot;
  }

  try {
    await resetGlobalBehaviorOverrides(deps);
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'Failed to reset default settings') };
  }

  return afterPersist(
    snapshot.hostname,
    { scope: { kind: 'global' }, mode: 'revalidate-target' },
    deps,
  );
}

export async function resetAllBehaviorSettings(
  message: ResetAllBehaviorRequest,
  sender: chrome.runtime.MessageSender,
  deps: BehaviorSettingsDeps = {},
): Promise<ResetAllBehaviorResponse> {
  if (!isExtensionPageSender(sender)) {
    return { ok: false, error: 'Unauthorized' };
  }

  const snapshot = validatedOptionalHostname(message.snapshotHostname);
  if (!snapshot.ok) {
    return snapshot;
  }

  try {
    const globalOutcome = await resetGlobalBehaviorOverrides(deps, { ifUnsupported: 'skip' });
    const sites = await deleteAllSiteSettings(deps);
    const skippedRecordCount = (globalOutcome === 'skipped' ? 1 : 0) + sites.skippedRecordCount;
    const result = await afterPersist(
      snapshot.hostname,
      { scope: { kind: 'all' }, mode: 'resolve-target' },
      deps,
    );
    return { ...result, skippedRecordCount };
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'Failed to reset settings') };
  }
}

export async function exportBehaviorBackup(
  sender: chrome.runtime.MessageSender,
  deps: BehaviorSettingsDeps = {},
): Promise<ExportBackupResponse> {
  if (!isExtensionPageSender(sender)) {
    return { ok: false, error: 'Unauthorized' };
  }
  try {
    return { ok: true, backupText: await exportLogicalBackupText(deps) };
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'Failed to export settings') };
  }
}

export async function importBehaviorBackup(
  message: ImportBackupRequest,
  sender: chrome.runtime.MessageSender,
  deps: BehaviorSettingsDeps = {},
): Promise<ImportBackupResponse> {
  if (!isExtensionPageSender(sender)) {
    return { ok: false, error: 'Unauthorized' };
  }
  const snapshot = validatedOptionalHostname(message.snapshotHostname);
  if (!snapshot.ok) {
    return snapshot;
  }
  try {
    const imported = await importLogicalSettings(message.backupText, message.mode, deps);
    const customSites = await listCustomSiteHostnames(deps);
    const result = await afterPersist(
      snapshot.hostname,
      { scope: { kind: 'all' }, mode: 'resolve-target' },
      deps,
    );
    return { ...result, skippedRecordCount: imported.skippedRecordCount, customSites };
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'Failed to import settings') };
  }
}

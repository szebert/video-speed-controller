// SPDX-License-Identifier: GPL-3.0-only

import type {
  DeleteSiteSettingsRequest,
  DeleteSiteSettingsResponse,
  GetBehaviorSettingsRequest,
  GetBehaviorSettingsResponse,
  GetCustomSitesResponse,
  ResetAllBehaviorRequest,
  ResetAllBehaviorResponse,
  ResetGlobalBehaviorRequest,
  ResetGlobalBehaviorResponse,
  SetBehaviorSettingRequest,
  SetBehaviorSettingResponse,
} from '../protocol/schemas/options-background';
import type {
  BehaviorMutationSuccess,
  BehaviorSettingsSnapshot,
  SiteMembershipUpdate,
} from '../protocol/schemas/shared';
import {
  canonicalizeBehaviorSettingChange,
  resolveSiteBehavior,
  toEditableResolvedBehavior,
  type BehaviorSettingChange,
} from '../settings/site-behavior';
import { normalizeSiteHostname, siteResolutionUrl } from '../settings/site-hostname';
import {
  persistGlobalBehaviorChanges,
  readGlobalBehaviorOverrides,
  resetGlobalBehaviorOverrides,
  type BehaviorDefaultsDeps,
} from '../storage/behavior-defaults';
import {
  deleteAllSiteSettings,
  deleteSiteSettings,
  listCustomSiteHostnames,
  persistSiteBehaviorChanges,
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

export type BehaviorSettingsDeps = BehaviorDefaultsDeps &
  SiteSettingsDeps &
  ReapplyBehaviorSettingsDeps;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function readBehaviorSettingsSnapshot(
  hostname: string | null,
  deps: BehaviorSettingsDeps = {},
): Promise<BehaviorSettingsSnapshot> {
  const globalOverrides = await readGlobalBehaviorOverrides(deps);
  const global = toEditableResolvedBehavior(resolveSiteBehavior(globalOverrides, {}));
  if (!hostname) {
    return { global, site: null };
  }
  const resolved = await resolveSiteBehaviorForUrl(siteResolutionUrl(hostname), {
    ...deps,
    touchUsage: false,
  });
  return {
    global,
    site: {
      hostname,
      behavior: resolved ? toEditableResolvedBehavior(resolved) : global,
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

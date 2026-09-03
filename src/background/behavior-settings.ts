// SPDX-License-Identifier: GPL-3.0-only

import type {
  BehaviorSettingsSnapshot,
  DeleteSiteSettingsRequest,
  GetBehaviorSettingsRequest,
  GetBehaviorSettingsResponse,
  ResetAllBehaviorRequest,
  ResetGlobalBehaviorRequest,
  SetBehaviorSettingRequest,
  SetBehaviorSettingResponse,
} from '../core/messages';
import {
  canonicalizeBehaviorSettingChange,
  resolveSiteBehavior,
  toEditableResolvedBehavior,
} from '../settings/site-behavior';
import { normalizeSiteHostname, siteResolutionUrl } from '../settings/site-hostname';
import {
  persistGlobalBehaviorChange,
  readGlobalBehaviorOverrides,
  resetGlobalBehaviorOverrides,
  type BehaviorDefaultsDeps,
} from '../storage/behavior-defaults';
import {
  deleteAllSiteSettings,
  deleteSiteSettings,
  listCustomSiteHostnames,
  persistSiteBehaviorChange,
  resolveSiteBehaviorForUrl,
  type SiteSettingsDeps,
} from '../storage/site-settings';
import { isExtensionPageSender } from './extension-page-sender';
import {
  reapplyBehaviorSettings,
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
  const [globalOverrides, customSites] = await Promise.all([
    readGlobalBehaviorOverrides(deps),
    listCustomSiteHostnames(deps),
  ]);
  const global = toEditableResolvedBehavior(resolveSiteBehavior(globalOverrides, {}));
  if (!hostname) {
    return { global, site: null, customSites };
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
    customSites,
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

async function afterPersist(
  snapshotHostname: string | null,
  request: ReapplyBehaviorRequest,
  deps: BehaviorSettingsDeps,
): Promise<SetBehaviorSettingResponse> {
  const reapply = await reapplyBehaviorSettings(request, deps);
  try {
    const state = await readBehaviorSettingsSnapshot(snapshotHostname, deps);
    return { ok: true, state, ...reapply };
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

export async function setBehaviorSetting(
  message: SetBehaviorSettingRequest,
  sender: chrome.runtime.MessageSender,
  deps: BehaviorSettingsDeps = {},
): Promise<SetBehaviorSettingResponse> {
  if (!isExtensionPageSender(sender)) {
    return { ok: false, error: 'Unauthorized' };
  }

  const change = canonicalizeBehaviorSettingChange(message.change);
  if (!change) {
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
      await persistGlobalBehaviorChange(change, deps);
    } else {
      await persistSiteBehaviorChange(siteResolutionUrl(persistHostname!), change, deps);
    }
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'Failed to persist setting') };
  }

  return afterPersist(
    snapshot.hostname,
    {
      scope:
        message.scope.kind === 'global'
          ? { kind: 'global' }
          : { kind: 'site', hostname: persistHostname! },
      change,
    },
    deps,
  );
}

export async function deleteSiteBehaviorSettings(
  message: DeleteSiteSettingsRequest,
  sender: chrome.runtime.MessageSender,
  deps: BehaviorSettingsDeps = {},
): Promise<SetBehaviorSettingResponse> {
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

  return afterPersist(
    snapshot.hostname,
    { scope: { kind: 'site', hostname }, change: { kind: 'inherit', field: 'speed' } },
    deps,
  );
}

export async function resetGlobalBehaviorSettings(
  message: ResetGlobalBehaviorRequest,
  sender: chrome.runtime.MessageSender,
  deps: BehaviorSettingsDeps = {},
): Promise<SetBehaviorSettingResponse> {
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
    { scope: { kind: 'global' }, change: { kind: 'inherit', field: 'overlayVisible' } },
    deps,
  );
}

export async function resetAllBehaviorSettings(
  message: ResetAllBehaviorRequest,
  sender: chrome.runtime.MessageSender,
  deps: BehaviorSettingsDeps = {},
): Promise<SetBehaviorSettingResponse> {
  if (!isExtensionPageSender(sender)) {
    return { ok: false, error: 'Unauthorized' };
  }

  const snapshot = validatedOptionalHostname(message.snapshotHostname);
  if (!snapshot.ok) {
    return snapshot;
  }

  try {
    await resetGlobalBehaviorOverrides(deps);
    await deleteAllSiteSettings(deps);
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'Failed to reset settings') };
  }

  return afterPersist(
    snapshot.hostname,
    { scope: { kind: 'all' }, change: { kind: 'inherit', field: 'speed' } },
    deps,
  );
}

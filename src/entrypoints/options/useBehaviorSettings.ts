// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  BehaviorSettingsSnapshot,
  GetBehaviorSettingsResponse,
  GetCustomSitesResponse,
  SetBehaviorSettingResponse,
  SiteMembershipUpdate,
} from '../../core/messages';
import { clampPolicyNumber } from '../../core/speed';
import { t } from '@/i18n/t';
import {
  canonicalizeOverlayAutoHideDelayMs,
  speedPolicyFromResolved,
  type BehaviorSettingChange,
} from '../../settings/site-behavior';
import {
  currentBehavior,
  focusedHostnameFromLocation,
  type DraftKey,
  type RecoverKind,
  type Selection,
} from './options-model';

async function requestGet(hostname: string | null): Promise<GetBehaviorSettingsResponse> {
  const message =
    hostname == null
      ? { type: 'GET_BEHAVIOR_SETTINGS' as const }
      : { type: 'GET_BEHAVIOR_SETTINGS' as const, hostname };
  return (await chrome.runtime.sendMessage(message)) as GetBehaviorSettingsResponse;
}

async function requestCustomSites(): Promise<GetCustomSitesResponse> {
  return (await chrome.runtime.sendMessage({
    type: 'GET_CUSTOM_SITES',
  })) as GetCustomSitesResponse;
}

function applyMembership(current: string[], update: SiteMembershipUpdate): string[] {
  const has = current.includes(update.hostname);
  if (update.customized && !has) {
    return [...current, update.hostname].sort((left, right) => left.localeCompare(right));
  }
  if (!update.customized && has) {
    return current.filter((hostname) => hostname !== update.hostname);
  }
  return current;
}

export function useBehaviorSettings() {
  const pageHostname = useMemo(() => focusedHostnameFromLocation(), []);
  const [selection, setSelection] = useState<Selection>(
    pageHostname ? { kind: 'site', hostname: pageHostname } : { kind: 'global' },
  );
  const [snapshot, setSnapshot] = useState<BehaviorSettingsSnapshot | null>(null);
  const [customSites, setCustomSites] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [sliderPreview, setSliderPreview] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<DraftKey, string>>>({});
  const draftsRef = useRef<Partial<Record<DraftKey, string>>>({});

  const snapshotHostname = selection.kind === 'site' ? selection.hostname : pageHostname;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [settings, sites] = await Promise.all([
          requestGet(pageHostname),
          requestCustomSites(),
        ]);
        if (cancelled) {
          return;
        }
        if (settings.ok) {
          setSnapshot(settings.state);
        } else {
          setError(settings.error);
        }
        if (sites.ok) {
          setCustomSites(sites.customSites);
        } else if (settings.ok) {
          setError(sites.error);
        }
      } catch {
        if (!cancelled) {
          setError(t('settingsSaveError'));
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageHostname]);

  const behavior = snapshot ? currentBehavior(snapshot, selection) : null;
  const overlayEnabled = behavior?.overlayVisible.value ?? true;

  function applyResponse(
    response: SetBehaviorSettingResponse | undefined,
    options: { clearCustomSites?: boolean } = {},
  ): boolean {
    if (!response) {
      setError(t('settingsSaveError'));
      return false;
    }
    if (!response.ok) {
      setError(response.error || t('settingsSaveError'));
      return false;
    }
    if (response.reapplyFailures > 0 || response.reapplyError) {
      setWarning(t('settingsReapplyError'));
    }
    if (response.state) {
      setSnapshot(response.state);
      if (options.clearCustomSites) {
        setCustomSites([]);
      } else if (response.siteMembership) {
        setCustomSites((current) => applyMembership(current, response.siteMembership!));
      }
      clearAllDrafts();
      setSliderPreview(null);
      return true;
    }
    setWarning(t('settingsRefreshError'));
    return false;
  }

  async function recover(kind: RecoverKind): Promise<void> {
    const recovered = await requestGet(snapshotHostname).catch(() => null);
    if (recovered?.ok) {
      setSnapshot(recovered.state);
      clearAllDrafts();
      setSliderPreview(null);
    }
    if (kind === 'pane-and-sidebar') {
      const sites = await requestCustomSites().catch(() => null);
      if (sites?.ok) {
        setCustomSites(sites.customSites);
      }
    }
  }

  async function sendPrivileged(
    message: Record<string, unknown>,
  ): Promise<SetBehaviorSettingResponse | undefined> {
    return (await chrome.runtime.sendMessage({
      ...message,
      ...(snapshotHostname ? { snapshotHostname } : {}),
    })) as SetBehaviorSettingResponse | undefined;
  }

  async function mutate(change: BehaviorSettingChange): Promise<void> {
    if (!snapshot || pending) {
      return;
    }
    setPending(true);
    setError(null);
    setWarning(null);
    const membership = selection.kind === 'site';
    try {
      const response = await sendPrivileged({
        type: 'SET_BEHAVIOR_SETTING',
        scope:
          selection.kind === 'site'
            ? { kind: 'site', hostname: selection.hostname }
            : { kind: 'global' },
        change,
      });
      if (!applyResponse(response) || (response && !response.ok)) {
        await recover(membership ? 'pane-and-sidebar' : 'pane');
      }
    } catch {
      setError(t('settingsSaveError'));
    } finally {
      setPending(false);
    }
  }

  async function selectSite(hostname: string): Promise<void> {
    clearAllDrafts();
    setSliderPreview(null);
    if (snapshot?.site?.hostname === hostname) {
      setSelection({ kind: 'site', hostname });
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await requestGet(hostname);
      if (response.ok) {
        setSnapshot(response.state);
        setSelection({ kind: 'site', hostname });
      } else {
        setError(response.error);
      }
    } catch {
      setError(t('settingsSaveError'));
    } finally {
      setPending(false);
    }
  }

  async function resetDefaults(): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    setWarning(null);
    try {
      const response = await sendPrivileged({ type: 'RESET_GLOBAL_BEHAVIOR' });
      if (!applyResponse(response) || (response && !response.ok)) {
        await recover('pane');
      }
    } catch {
      setError(t('settingsSaveError'));
    } finally {
      setPending(false);
    }
  }

  async function resetAll(): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    setWarning(null);
    try {
      const response = await sendPrivileged({ type: 'RESET_ALL_BEHAVIOR' });
      if (!applyResponse(response, { clearCustomSites: true }) || (response && !response.ok)) {
        await recover('pane-and-sidebar');
      }
    } catch {
      setError(t('settingsSaveError'));
    } finally {
      setPending(false);
    }
  }

  function selectPane(next: Selection): void {
    setSelection(next);
    clearAllDrafts();
    setSliderPreview(null);
  }

  async function deleteSite(hostname: string): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    setWarning(null);
    try {
      const response = await sendPrivileged({ type: 'DELETE_SITE_SETTINGS', hostname });
      if (!applyResponse(response) || (response && !response.ok)) {
        await recover('pane-and-sidebar');
        return;
      }
      if (selection.kind === 'site' && selection.hostname === hostname) {
        setSelection({ kind: 'global' });
      }
    } catch {
      setError(t('settingsSaveError'));
    } finally {
      setPending(false);
    }
  }

  function clearAllDrafts(): void {
    draftsRef.current = {};
    setDrafts({});
  }

  function updateDraft(key: DraftKey, value: string): void {
    draftsRef.current = { ...draftsRef.current, [key]: value };
    setDrafts((current) => ({ ...current, [key]: value }));
  }

  function takeDraft(key: DraftKey): string | undefined {
    if (!Object.prototype.hasOwnProperty.call(draftsRef.current, key)) {
      return undefined;
    }
    const draft = draftsRef.current[key];
    const next = { ...draftsRef.current };
    delete next[key];
    draftsRef.current = next;
    setDrafts(next);
    return draft;
  }

  function commitDecimal(
    key: Exclude<DraftKey, 'delay'>,
    fallback: number,
    min: number,
    max: number,
  ): void {
    const draft = takeDraft(key);
    if (draft == null) {
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const confirmed = clampPolicyNumber(parsed, min, max);
    if (confirmed === fallback) {
      return;
    }
    void mutate({
      kind: 'value',
      field: key,
      value: confirmed,
    });
  }

  function commitDelay(): void {
    const draft = takeDraft('delay');
    if (draft == null) {
      return;
    }
    const seconds = Number(draft);
    if (!Number.isFinite(seconds) || seconds < 0) {
      return;
    }
    const confirmed = canonicalizeOverlayAutoHideDelayMs(seconds * 1000);
    const canonical = behavior?.overlayAutoHideDelayMs.value;
    if (canonical != null && confirmed === canonical) {
      return;
    }
    void mutate({
      kind: 'value',
      field: 'overlayAutoHideDelayMs',
      value: confirmed,
    });
  }

  const speed = behavior ? (sliderPreview ?? behavior.speed.value) : 1;
  const delaySeconds = behavior ? String(behavior.overlayAutoHideDelayMs.value / 1000) : '2';
  const policy = behavior ? speedPolicyFromResolved(behavior) : undefined;
  const overlayLocked = pending || !overlayEnabled;
  const delayLocked = overlayLocked || !(behavior?.overlayAutoHide.value ?? true);
  const resetBadgeText = selection.kind === 'site' ? t('settingOverride') : t('settingCustom');

  return {
    pageHostname,
    selection,
    snapshot,
    customSites,
    ready,
    pending,
    error,
    warning,
    sliderPreview,
    drafts,
    updateDraft,
    behavior,
    overlayEnabled,
    snapshotHostname,
    speed,
    delaySeconds,
    policy,
    overlayLocked,
    delayLocked,
    resetBadgeText,
    mutate,
    selectSite,
    selectPane,
    deleteSite,
    resetDefaults,
    resetAll,
    commitDecimal,
    commitDelay,
    setSliderPreview,
  };
}

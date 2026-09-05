// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  BehaviorSettingsSnapshot,
  GetBehaviorSettingsResponse,
  GetCustomSitesResponse,
  SetBehaviorSettingResponse,
  SiteMembershipUpdate,
} from '../../core/messages';
import { adjustSpeed, clampPolicyNumber } from '../../core/speed';
import { t } from '@/i18n/t';
import { SETTINGS_CREATED_BY_NEWER_VERSION } from '../../settings/migrate';
import {
  canonicalizeOverlayAutoHideDelayMs,
  speedPolicyFromResolved,
  type BehaviorSettingChange,
  type EditableBehaviorField,
} from '../../settings/site-behavior';
import {
  createSettingsWriteCoalescer,
  shouldApplyGeneration,
  type SettingsWriteBatch,
  type SettingsWriteScope,
} from './coalesce-settings-writes';
import {
  applyOptimisticChange,
  applyOptimisticChanges,
  currentBehavior,
  focusedHostnameFromLocation,
  omitMatchingOptimisticChanges,
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

function persistErrorMessage(error: string | undefined): string {
  if (error === SETTINGS_CREATED_BY_NEWER_VERSION) {
    return t('settingsNewerVersion');
  }
  return error || t('settingsSaveError');
}

function writeScope(selection: Selection): SettingsWriteScope | null {
  if (selection.kind === 'global') {
    return { kind: 'global' };
  }
  if (selection.kind === 'site') {
    return { kind: 'site', hostname: selection.hostname };
  }
  return null;
}

export function useBehaviorSettings() {
  const pageHostname = useMemo(() => focusedHostnameFromLocation(), []);
  const [selection, setSelection] = useState<Selection>(
    pageHostname ? { kind: 'site', hostname: pageHostname } : { kind: 'global' },
  );
  const [snapshot, setSnapshot] = useState<BehaviorSettingsSnapshot | null>(null);
  const [customSites, setCustomSites] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [sliderPreview, setSliderPreview] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<DraftKey, string>>>({});
  const [optimistic, setOptimistic] = useState<
    Partial<Record<EditableBehaviorField, BehaviorSettingChange>>
  >({});
  const draftsRef = useRef<Partial<Record<DraftKey, string>>>({});
  const optimisticRef = useRef(optimistic);
  const snapshotRef = useRef(snapshot);
  const selectionRef = useRef(selection);
  const blockingRef = useRef(blocking);
  const behaviorRef = useRef(null as ReturnType<typeof currentBehavior> | null);
  const snapshotHostnameRef = useRef<string | null>(null);
  const latestStartedRef = useRef(0);
  const sendBatchRef = useRef<(batch: SettingsWriteBatch) => Promise<void>>(async () => {});
  const [coalescer, setCoalescer] = useState<ReturnType<
    typeof createSettingsWriteCoalescer
  > | null>(null);

  const snapshotHostname = selection.kind === 'site' ? selection.hostname : pageHostname;
  const persisted = snapshot ? currentBehavior(snapshot, selection) : null;
  const behavior =
    persisted && snapshot
      ? applyOptimisticChanges(persisted, optimistic, selection, snapshot)
      : persisted;
  const overlayEnabled = behavior?.overlayVisible.value ?? true;

  function clearAllDrafts(): void {
    draftsRef.current = {};
    setDrafts({});
  }

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

  useEffect(() => {
    const queue = createSettingsWriteCoalescer({
      send: (batch) => sendBatchRef.current(batch),
    });
    setCoalescer(queue);
    const flushHidden = (): void => {
      void queue.flush();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        flushHidden();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushHidden);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushHidden);
    };
  }, []);

  function writeOptimistic(
    next: Partial<Record<EditableBehaviorField, BehaviorSettingChange>>,
  ): void {
    optimisticRef.current = next;
    setOptimistic(next);
  }

  function applyResponse(
    response: SetBehaviorSettingResponse | undefined,
    options: { clearCustomSites?: boolean; sentChanges?: readonly BehaviorSettingChange[] } = {},
  ): boolean {
    if (!response) {
      setError(t('settingsSaveError'));
      return false;
    }
    if (!response.ok) {
      setError(persistErrorMessage(response.error));
      return false;
    }
    let nextWarning: string | null = null;
    if (response.reapplyFailures > 0 || response.reapplyError) {
      nextWarning = t('settingsReapplyError');
    }
    if (response.resetAll?.partial) {
      const partial = t('settingsResetPartial');
      nextWarning = nextWarning ? `${nextWarning} ${partial}` : partial;
    }
    if (nextWarning) {
      setWarning(nextWarning);
    }
    if (response.state) {
      setSnapshot(response.state);
      writeOptimistic(
        options.sentChanges
          ? omitMatchingOptimisticChanges(optimisticRef.current, options.sentChanges)
          : {},
      );
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
    if (kind !== 'sidebar') {
      const recovered = await requestGet(snapshotHostnameRef.current).catch(() => null);
      if (recovered?.ok) {
        setSnapshot(recovered.state);
        clearAllDrafts();
        setSliderPreview(null);
      }
    }
    if (kind !== 'pane') {
      const sites = await requestCustomSites().catch(() => null);
      if (sites?.ok) {
        setCustomSites(sites.customSites);
      }
    }
  }

  async function sendPrivileged(
    message: Record<string, unknown>,
  ): Promise<SetBehaviorSettingResponse | undefined> {
    const hostname = snapshotHostnameRef.current;
    return (await chrome.runtime.sendMessage({
      ...message,
      ...(hostname ? { snapshotHostname: hostname } : {}),
    })) as SetBehaviorSettingResponse | undefined;
  }

  useLayoutEffect(() => {
    snapshotRef.current = snapshot;
    selectionRef.current = selection;
    blockingRef.current = blocking;
    behaviorRef.current = behavior;
    snapshotHostnameRef.current = snapshotHostname;
    sendBatchRef.current = async (batch: SettingsWriteBatch) => {
      latestStartedRef.current = batch.generation;
      setSaving(true);
      const membership = batch.scope.kind === 'site';
      const payload =
        batch.changes.length === 1
          ? {
              type: 'SET_BEHAVIOR_SETTING',
              scope: batch.scope,
              change: batch.changes[0],
            }
          : {
              type: 'SET_BEHAVIOR_SETTING',
              scope: batch.scope,
              changes: batch.changes,
            };
      try {
        const response = await sendPrivileged(payload);
        if (!shouldApplyGeneration(batch.generation, latestStartedRef.current)) {
          return;
        }
        if (!applyResponse(response, { sentChanges: batch.changes }) || response?.ok === false) {
          if (!shouldApplyGeneration(batch.generation, latestStartedRef.current)) {
            return;
          }
          await recover(membership ? 'pane-and-sidebar' : 'pane');
          writeOptimistic(omitMatchingOptimisticChanges(optimisticRef.current, batch.changes));
        } else if (membership && response?.ok && !response.siteMembership) {
          await recover('sidebar');
        }
      } catch {
        if (!shouldApplyGeneration(batch.generation, latestStartedRef.current)) {
          return;
        }
        setError(t('settingsSaveError'));
        await recover(membership ? 'pane-and-sidebar' : 'pane');
        writeOptimistic(omitMatchingOptimisticChanges(optimisticRef.current, batch.changes));
      } finally {
        if (shouldApplyGeneration(batch.generation, latestStartedRef.current)) {
          setSaving(false);
        }
      }
    };
    // Persist uses the latest apply/recover closures; those are recreated each
    // render and would retrigger this effect without changing behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync refs and send
  }, [snapshot, selection, blocking, behavior, snapshotHostname]);

  function mutate(change: BehaviorSettingChange): void {
    const currentSnapshot = snapshotRef.current;
    const currentSelection = selectionRef.current;
    const scope = writeScope(currentSelection);
    if (!currentSnapshot || blockingRef.current || !scope) {
      return;
    }
    const currentBehaviorState =
      behaviorRef.current ?? currentBehavior(currentSnapshot, currentSelection);
    behaviorRef.current = applyOptimisticChange(
      currentBehaviorState,
      change,
      currentSelection,
      currentSnapshot,
    );
    writeOptimistic({ ...optimisticRef.current, [change.field]: change });
    setError(null);
    setWarning(null);
    coalescer?.enqueue(scope, change);
  }

  function adjustDisplayedSpeed(direction: 1 | -1): void {
    const current = behaviorRef.current;
    if (!current) {
      return;
    }
    mutate({
      kind: 'value',
      field: 'speed',
      value: adjustSpeed(current.speed.value, direction, speedPolicyFromResolved(current)),
    });
  }

  async function selectSite(hostname: string): Promise<void> {
    if (blocking) {
      return;
    }
    setBlocking(true);
    setError(null);
    try {
      await coalescer?.flush();
      writeOptimistic({});
      clearAllDrafts();
      setSliderPreview(null);
      if (snapshotRef.current?.site?.hostname === hostname) {
        setSelection({ kind: 'site', hostname });
        return;
      }
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
      setBlocking(false);
    }
  }

  async function runDestructive(work: () => Promise<void>): Promise<void> {
    if (blocking) {
      return;
    }
    setBlocking(true);
    setError(null);
    setWarning(null);
    try {
      await coalescer?.flush();
      writeOptimistic({});
      await work();
    } finally {
      setBlocking(false);
    }
  }

  async function resetDefaults(): Promise<void> {
    await runDestructive(async () => {
      try {
        const response = await sendPrivileged({ type: 'RESET_GLOBAL_BEHAVIOR' });
        if (!applyResponse(response) || (response && !response.ok)) {
          await recover('pane');
        }
      } catch {
        setError(t('settingsSaveError'));
        await recover('pane');
      }
    });
  }

  async function resetAll(): Promise<void> {
    await runDestructive(async () => {
      try {
        const response = await sendPrivileged({ type: 'RESET_ALL_BEHAVIOR' });
        if (!applyResponse(response, { clearCustomSites: true }) || (response && !response.ok)) {
          await recover('pane-and-sidebar');
        }
      } catch {
        setError(t('settingsSaveError'));
        await recover('pane-and-sidebar');
      }
    });
  }

  function selectPane(next: Selection): void {
    const applyPane = (): void => {
      setSelection(next);
      writeOptimistic({});
      clearAllDrafts();
      setSliderPreview(null);
    };
    if (!coalescer?.isBusy()) {
      applyPane();
      return;
    }
    void (async () => {
      setBlocking(true);
      try {
        await coalescer.flush();
        applyPane();
      } finally {
        setBlocking(false);
      }
    })();
  }

  async function deleteSite(hostname: string): Promise<void> {
    await runDestructive(async () => {
      try {
        const response = await sendPrivileged({ type: 'DELETE_SITE_SETTINGS', hostname });
        if (!applyResponse(response) || (response && !response.ok)) {
          await recover('pane-and-sidebar');
          return;
        }
        if (response?.ok && !response.siteMembership) {
          await recover('sidebar');
        }
        if (selectionRef.current.kind === 'site' && selectionRef.current.hostname === hostname) {
          setSelection({ kind: 'global' });
        }
      } catch {
        setError(t('settingsSaveError'));
        await recover('pane-and-sidebar');
      }
    });
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
    mutate({
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
    const canonical = behaviorRef.current?.overlayAutoHideDelayMs.value;
    if (canonical != null && confirmed === canonical) {
      return;
    }
    mutate({
      kind: 'value',
      field: 'overlayAutoHideDelayMs',
      value: confirmed,
    });
  }

  const speed = behavior ? (sliderPreview ?? behavior.speed.value) : 1;
  const delaySeconds = behavior ? String(behavior.overlayAutoHideDelayMs.value / 1000) : '2';
  const policy = behavior ? speedPolicyFromResolved(behavior) : undefined;
  const overlayLocked = blocking || !overlayEnabled;
  const delayLocked = overlayLocked || !(behavior?.overlayAutoHide.value ?? true);
  const resetBadgeText = selection.kind === 'site' ? t('settingOverride') : t('settingCustom');

  return {
    pageHostname,
    selection,
    snapshot,
    customSites,
    ready,
    pending: blocking,
    saving,
    blocking,
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
    adjustDisplayedSpeed,
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

// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { sendOptionsRequest } from '../../protocol/rpc';
import type {
  DeleteSiteSettingsResponse,
  OptionsToBackgroundRequest,
  ImportBackupResponse,
  ResetAllBehaviorResponse,
  ResetGlobalBehaviorResponse,
  SetBehaviorSettingResponse,
  SetHotkeySettingResponse,
} from '../../protocol/schemas/options-background';
import type { BehaviorSettingsSnapshot, SiteMembershipUpdate } from '../../protocol/schemas/shared';
import { adjustSpeed, clampPolicyNumber } from '../../core/speed';
import { t } from '@/i18n/t';
import {
  BACKUP_CONTAINS_NEWER_SETTINGS,
  BACKUP_CREATED_BY_NEWER_VERSION,
  BACKUP_INVALID,
  BACKUP_TOO_LARGE,
  BACKUP_TOO_MANY_SITES,
} from '../../settings/backup';
import { SETTINGS_CREATED_BY_NEWER_VERSION } from '../../settings/migrate';
import { backupExportFilename, backupFailureMessage } from './backup-file';
import {
  canonicalizeOverlayAutoHideDelayMs,
  speedPolicyFromResolved,
  type BehaviorSettingChange,
  type EditableBehaviorField,
  type HotkeySettingChange,
  type SiteHotkeyAction,
} from '../../settings/site-behavior';
import {
  createSerialMutationLane,
  createSettingsWriteCoalescer,
  flushSettingsWriteQueues,
  settingsWriteQueuesBusy,
  type SettingsWriteBatch,
  type SettingsWriteScope,
} from './coalesce-settings-writes';
import {
  applyOptimisticChange,
  applyOptimisticChanges,
  applyOptimisticHotkeyChanges,
  currentBehavior,
  currentHotkeys,
  focusedHostnameFromLocation,
  omitMatchingOptimisticChanges,
  omitMatchingOptimisticHotkeys,
  type DraftKey,
  type RecoverKind,
  type Selection,
} from './options-model';

async function requestGet(hostname: string | null) {
  const response = await sendOptionsRequest(
    hostname == null
      ? { type: 'GET_BEHAVIOR_SETTINGS' }
      : { type: 'GET_BEHAVIOR_SETTINGS', hostname },
  );
  return response ?? { ok: false as const, error: 'Invalid response' };
}

async function requestCustomSites() {
  const response = await sendOptionsRequest({ type: 'GET_CUSTOM_SITES' });
  return response ?? { ok: false as const, error: 'Invalid response' };
}

type MutationResponse =
  | SetBehaviorSettingResponse
  | SetHotkeySettingResponse
  | DeleteSiteSettingsResponse
  | ResetGlobalBehaviorResponse
  | ResetAllBehaviorResponse
  | ImportBackupResponse;

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

function reportActionError(message: string): void {
  toast.error(message);
}

function reportActionWarning(message: string): void {
  toast.warning(message);
}

function clearActionFeedback(): void {
  toast.dismiss();
}

function persistErrorMessage(error: string | undefined): string {
  if (error === SETTINGS_CREATED_BY_NEWER_VERSION) {
    return t('settingsNewerVersion');
  }
  if (
    error === BACKUP_CREATED_BY_NEWER_VERSION ||
    error === BACKUP_CONTAINS_NEWER_SETTINGS ||
    error === BACKUP_INVALID ||
    error === BACKUP_TOO_LARGE ||
    error === BACKUP_TOO_MANY_SITES
  ) {
    return backupFailureMessage(error);
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
  const [blocking, setBlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sliderPreview, setSliderPreview] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<DraftKey, string>>>({});
  const [optimistic, setOptimistic] = useState<
    Partial<Record<EditableBehaviorField, BehaviorSettingChange>>
  >({});
  const [optimisticHotkeys, setOptimisticHotkeys] = useState<
    Partial<Record<SiteHotkeyAction, HotkeySettingChange>>
  >({});
  const draftsRef = useRef<Partial<Record<DraftKey, string>>>({});
  const optimisticRef = useRef(optimistic);
  const optimisticHotkeysRef = useRef(optimisticHotkeys);
  const snapshotRef = useRef(snapshot);
  const selectionRef = useRef(selection);
  const blockingRef = useRef(blocking);
  const behaviorRef = useRef(null as ReturnType<typeof currentBehavior> | null);
  const snapshotHostnameRef = useRef<string | null>(null);
  const sendBatchRef = useRef<(batch: SettingsWriteBatch) => Promise<void>>(async () => {});
  const sendHotkeyBatchRef = useRef<
    (batch: SettingsWriteBatch<HotkeySettingChange>) => Promise<void>
  >(async () => {});
  const mutationLaneRef = useRef(createSerialMutationLane());
  const [coalescer, setCoalescer] = useState<ReturnType<
    typeof createSettingsWriteCoalescer<BehaviorSettingChange>
  > | null>(null);
  const [hotkeyCoalescer, setHotkeyCoalescer] = useState<ReturnType<
    typeof createSettingsWriteCoalescer<HotkeySettingChange>
  > | null>(null);

  const snapshotHostname = selection.kind === 'site' ? selection.hostname : pageHostname;
  const persisted = snapshot ? currentBehavior(snapshot, selection) : null;
  const behavior =
    persisted && snapshot
      ? applyOptimisticChanges(persisted, optimistic, selection, snapshot)
      : persisted;
  const persistedHotkeys = snapshot ? currentHotkeys(snapshot, selection) : null;
  const hotkeys =
    persistedHotkeys && snapshot
      ? applyOptimisticHotkeyChanges(persistedHotkeys, optimisticHotkeys, selection, snapshot)
      : persistedHotkeys;
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
          reportActionError(sites.error);
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
    const queue = createSettingsWriteCoalescer<BehaviorSettingChange>({
      key: (change) => change.field,
      send: (batch) => sendBatchRef.current(batch),
    });
    const hotkeyQueue = createSettingsWriteCoalescer<HotkeySettingChange>({
      key: (change) => change.action,
      send: (batch) => sendHotkeyBatchRef.current(batch),
    });
    setCoalescer(queue);
    setHotkeyCoalescer(hotkeyQueue);
    const flushHidden = (): void => {
      void flushSettingsWriteQueues(queue, hotkeyQueue);
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

  function writeOptimisticHotkeys(
    next: Partial<Record<SiteHotkeyAction, HotkeySettingChange>>,
  ): void {
    optimisticHotkeysRef.current = next;
    setOptimisticHotkeys(next);
  }

  function clearOptimistic(): void {
    writeOptimistic({});
    writeOptimisticHotkeys({});
  }

  function applyResponse(
    response: MutationResponse | undefined,
    options: {
      clearCustomSites?: boolean;
      sentChanges?: readonly BehaviorSettingChange[];
      sentHotkeys?: readonly HotkeySettingChange[];
    } = {},
  ): boolean {
    if (!response) {
      reportActionError(t('settingsSaveError'));
      return false;
    }
    if (!response.ok) {
      reportActionError(persistErrorMessage(response.error));
      return false;
    }
    let nextWarning: string | null = null;
    if (response.reapplyFailures > 0 || response.reapplyError) {
      nextWarning = t('settingsReapplyError');
    }
    if ('skippedRecordCount' in response && response.skippedRecordCount > 0) {
      const partial = t('settingsResetPartial');
      nextWarning = nextWarning ? `${nextWarning} ${partial}` : partial;
    }
    if (nextWarning) {
      reportActionWarning(nextWarning);
    }
    if (response.state) {
      setSnapshot(response.state);
      if (options.sentChanges) {
        writeOptimistic(omitMatchingOptimisticChanges(optimisticRef.current, options.sentChanges));
      } else if (!options.sentHotkeys) {
        writeOptimistic({});
      }
      if (options.sentHotkeys) {
        let nextHotkeys = optimisticHotkeysRef.current;
        for (const change of options.sentHotkeys) {
          nextHotkeys = omitMatchingOptimisticHotkeys(nextHotkeys, change);
        }
        writeOptimisticHotkeys(nextHotkeys);
      } else if (!options.sentChanges) {
        writeOptimisticHotkeys({});
      }
      if ('customSites' in response && response.customSites) {
        setCustomSites(response.customSites);
      } else if (options.clearCustomSites) {
        setCustomSites([]);
      } else if ('siteMembership' in response && response.siteMembership) {
        const membership = response.siteMembership;
        setCustomSites((current) => applyMembership(current, membership));
      }
      if (!options.sentChanges && !options.sentHotkeys) {
        clearAllDrafts();
        setSliderPreview(null);
      }
      return true;
    }
    reportActionWarning(t('settingsRefreshError'));
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

  function withSnapshotHostname<T extends OptionsToBackgroundRequest>(message: T): T {
    const hostname = snapshotHostnameRef.current;
    return hostname ? { ...message, snapshotHostname: hostname } : message;
  }

  useLayoutEffect(() => {
    snapshotRef.current = snapshot;
    selectionRef.current = selection;
    blockingRef.current = blocking;
    behaviorRef.current = behavior;
    snapshotHostnameRef.current = snapshotHostname;
    sendBatchRef.current = async (batch: SettingsWriteBatch) => {
      await mutationLaneRef.current.enqueue(async () => {
        const membership = batch.scope.kind === 'site';
        const payload =
          batch.changes.length === 1
            ? {
                type: 'SET_BEHAVIOR_SETTING' as const,
                scope: batch.scope,
                change: batch.changes[0],
              }
            : {
                type: 'SET_BEHAVIOR_SETTING' as const,
                scope: batch.scope,
                changes: batch.changes,
              };
        try {
          const response = await sendOptionsRequest(withSnapshotHostname(payload));
          if (!applyResponse(response, { sentChanges: batch.changes }) || response?.ok === false) {
            await recover(membership ? 'pane-and-sidebar' : 'pane');
            writeOptimistic(omitMatchingOptimisticChanges(optimisticRef.current, batch.changes));
          } else if (
            membership &&
            response?.ok &&
            !('siteMembership' in response && response.siteMembership)
          ) {
            await recover('sidebar');
          }
        } catch {
          reportActionError(t('settingsSaveError'));
          await recover(membership ? 'pane-and-sidebar' : 'pane');
          writeOptimistic(omitMatchingOptimisticChanges(optimisticRef.current, batch.changes));
        }
      });
    };
    sendHotkeyBatchRef.current = async (batch: SettingsWriteBatch<HotkeySettingChange>) => {
      await mutationLaneRef.current.enqueue(async () => {
        const membership = batch.scope.kind === 'site';
        const payload =
          batch.changes.length === 1
            ? {
                type: 'SET_HOTKEY_SETTING' as const,
                scope: batch.scope,
                change: batch.changes[0],
              }
            : {
                type: 'SET_HOTKEY_SETTING' as const,
                scope: batch.scope,
                changes: batch.changes,
              };
        try {
          const response = await sendOptionsRequest(withSnapshotHostname(payload));
          if (!applyResponse(response, { sentHotkeys: batch.changes }) || response?.ok === false) {
            await recover(membership ? 'pane-and-sidebar' : 'pane');
            let nextHotkeys = optimisticHotkeysRef.current;
            for (const change of batch.changes) {
              nextHotkeys = omitMatchingOptimisticHotkeys(nextHotkeys, change);
            }
            writeOptimisticHotkeys(nextHotkeys);
          } else if (
            membership &&
            response?.ok &&
            !('siteMembership' in response && response.siteMembership)
          ) {
            await recover('sidebar');
          }
        } catch {
          reportActionError(t('settingsSaveError'));
          await recover(membership ? 'pane-and-sidebar' : 'pane');
          let nextHotkeys = optimisticHotkeysRef.current;
          for (const change of batch.changes) {
            nextHotkeys = omitMatchingOptimisticHotkeys(nextHotkeys, change);
          }
          writeOptimisticHotkeys(nextHotkeys);
        }
      });
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
    clearActionFeedback();
    coalescer?.enqueue(scope, change);
  }

  function mutateHotkey(change: HotkeySettingChange): void {
    const currentSnapshot = snapshotRef.current;
    const currentSelection = selectionRef.current;
    const scope = writeScope(currentSelection);
    if (!currentSnapshot || blockingRef.current || !scope) {
      return;
    }
    writeOptimisticHotkeys({ ...optimisticHotkeysRef.current, [change.action]: change });
    clearActionFeedback();
    hotkeyCoalescer?.enqueue(scope, change);
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
    clearActionFeedback();
    try {
      await flushSettingsWriteQueues(coalescer, hotkeyCoalescer);
      clearOptimistic();
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
        reportActionError(response.error);
      }
    } catch {
      reportActionError(t('settingsSaveError'));
    } finally {
      setBlocking(false);
    }
  }

  async function runDestructive(work: () => Promise<void>): Promise<void> {
    if (blocking) {
      return;
    }
    setBlocking(true);
    clearActionFeedback();
    try {
      await flushSettingsWriteQueues(coalescer, hotkeyCoalescer);
      clearOptimistic();
      await work();
    } finally {
      setBlocking(false);
    }
  }

  async function resetDefaults(): Promise<void> {
    await runDestructive(async () => {
      try {
        const response = await sendOptionsRequest(
          withSnapshotHostname({ type: 'RESET_GLOBAL_BEHAVIOR' }),
        );
        if (!applyResponse(response) || (response && !response.ok)) {
          await recover('pane');
        }
      } catch {
        reportActionError(t('settingsSaveError'));
        await recover('pane');
      }
    });
  }

  async function exportBackup(): Promise<void> {
    if (blocking) {
      return;
    }
    setBlocking(true);
    clearActionFeedback();
    try {
      await flushSettingsWriteQueues(coalescer, hotkeyCoalescer);
      const response = await sendOptionsRequest({ type: 'EXPORT_BACKUP' });
      if (!response?.ok) {
        reportActionError(
          response?.ok === false ? persistErrorMessage(response.error) : t('backupExportError'),
        );
        return;
      }
      const blob = new Blob([response.backupText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = backupExportFilename();
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      reportActionError(t('backupExportError'));
    } finally {
      setBlocking(false);
    }
  }

  async function importBackup(mode: 'merge' | 'replace', backupText: string): Promise<boolean> {
    let imported = false;
    await runDestructive(async () => {
      try {
        const response = await sendOptionsRequest(
          withSnapshotHostname({ type: 'IMPORT_BACKUP', mode, backupText }),
        );
        const partial = Boolean(
          response?.ok && 'skippedRecordCount' in response && response.skippedRecordCount > 0,
        );
        if (response?.ok) {
          imported = true;
        }
        if (!applyResponse(response) || (response && !response.ok)) {
          await recover('pane-and-sidebar');
          return;
        }
        if (partial && !('customSites' in (response ?? {}))) {
          await recover('sidebar');
        }
      } catch {
        reportActionError(t('settingsSaveError'));
        await recover('pane-and-sidebar');
      }
    });
    return imported;
  }

  async function resetAll(): Promise<void> {
    await runDestructive(async () => {
      try {
        const response = await sendOptionsRequest(
          withSnapshotHostname({ type: 'RESET_ALL_BEHAVIOR' }),
        );
        const partial = Boolean(
          response?.ok && 'skippedRecordCount' in response && response.skippedRecordCount > 0,
        );
        if (
          !applyResponse(response, { clearCustomSites: !partial }) ||
          (response && !response.ok)
        ) {
          await recover('pane-and-sidebar');
          return;
        }
        if (partial) {
          await recover('sidebar');
        }
      } catch {
        reportActionError(t('settingsSaveError'));
        await recover('pane-and-sidebar');
      }
    });
  }

  function selectPane(next: Selection): void {
    const applyPane = (): void => {
      setSelection(next);
      clearOptimistic();
      clearAllDrafts();
      setSliderPreview(null);
    };
    if (!settingsWriteQueuesBusy(coalescer, hotkeyCoalescer)) {
      applyPane();
      return;
    }
    void (async () => {
      setBlocking(true);
      try {
        await flushSettingsWriteQueues(coalescer, hotkeyCoalescer);
        applyPane();
      } finally {
        setBlocking(false);
      }
    })();
  }

  async function deleteSite(hostname: string): Promise<void> {
    await runDestructive(async () => {
      try {
        const response = await sendOptionsRequest(
          withSnapshotHostname({ type: 'DELETE_SITE_SETTINGS', hostname }),
        );
        if (!applyResponse(response) || (response && !response.ok)) {
          await recover('pane-and-sidebar');
          return;
        }
        if (response?.ok && !('siteMembership' in response && response.siteMembership)) {
          await recover('sidebar');
        }
        if (selectionRef.current.kind === 'site' && selectionRef.current.hostname === hostname) {
          setSelection({ kind: 'global' });
        }
      } catch {
        reportActionError(t('settingsSaveError'));
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
    blocking,
    error,
    sliderPreview,
    drafts,
    updateDraft,
    behavior,
    hotkeys,
    overlayEnabled,
    snapshotHostname,
    speed,
    delaySeconds,
    policy,
    overlayLocked,
    delayLocked,
    resetBadgeText,
    mutate,
    mutateHotkey,
    adjustDisplayedSpeed,
    selectSite,
    selectPane,
    deleteSite,
    resetDefaults,
    resetAll,
    exportBackup,
    importBackup,
    commitDecimal,
    commitDelay,
    setSliderPreview,
  };
}

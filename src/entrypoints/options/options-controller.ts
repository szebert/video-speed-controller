// SPDX-License-Identifier: GPL-3.0-only

import { sendOptionsRequest } from '@/protocol/rpc';
import type {
  DeleteSiteSettingsResponse,
  ImportBackupResponse,
  OptionsToBackgroundRequest,
  ResetAllBehaviorResponse,
  ResetGlobalBehaviorResponse,
  SetBehaviorSettingResponse,
  SetHotkeySettingResponse,
} from '@/protocol/schemas/options-background';
import type { BehaviorSettingsSnapshot } from '@/protocol/schemas/shared';
import type { CustomSiteSummary } from '@/settings/site-summary';
import { adjustSpeed, clampPolicyNumber, resolveEffectiveSpeed } from '@/core/speed';
import { t } from '@/i18n/t';
import {
  BACKUP_CONTAINS_NEWER_SETTINGS,
  BACKUP_CREATED_BY_NEWER_VERSION,
  BACKUP_INVALID,
  BACKUP_TOO_LARGE,
  BACKUP_TOO_MANY_SITES,
} from '@/settings/backup';
import { SETTINGS_CREATED_BY_NEWER_VERSION } from '@/settings/migrate';
import { backupExportFilename, backupFailureMessage } from './backup-file';
import {
  canonicalizeFastForwardSpeed,
  canonicalizeFlashDelayMs,
  canonicalizeHotkeyRepeatDelayMs,
  canonicalizeOverlayAutoHideDelayMs,
  canonicalizeRewindSpeed,
  canonicalizeSkipSeconds,
  speedPolicyFromResolved,
  type BehaviorSettingChange,
  type EditableBehaviorField,
  type HotkeySettingChange,
  type SiteHotkeyAction,
} from '@/settings/site-behavior';
import { applyMembership } from './site-list-sort';
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
  displayedCurrentSpeed,
  focusedHostnameFromLocation,
  omitMatchingOptimisticChanges,
  omitMatchingOptimisticHotkeys,
  type DraftKey,
  type RecoverKind,
  type Selection,
} from './options-model';

type MutationResponse =
  | SetBehaviorSettingResponse
  | SetHotkeySettingResponse
  | DeleteSiteSettingsResponse
  | ResetGlobalBehaviorResponse
  | ResetAllBehaviorResponse
  | ImportBackupResponse;

type Listener = () => void;

export type OptionsFeedback = {
  level: 'error' | 'warning';
  message: string;
  token: number;
} | null;

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

export class OptionsController {
  readonly pageHostname: string | null;
  selection: Selection;
  snapshot: BehaviorSettingsSnapshot | null = null;
  customSites: CustomSiteSummary[] = [];
  ready = false;
  blocking = false;
  error: string | null = null;
  speedPreview: number | null = null;
  drafts: Partial<Record<DraftKey, string>> = {};
  optimistic: Partial<Record<EditableBehaviorField, BehaviorSettingChange>> = {};
  optimisticHotkeys: Partial<Record<SiteHotkeyAction, HotkeySettingChange>> = {};
  feedback: OptionsFeedback = null;

  private behaviorRef: ReturnType<typeof currentBehavior> | null = null;
  private feedbackToken = 0;
  private started = false;
  private renderQueued = false;
  private readonly listeners = new Set<Listener>();
  private readonly mutationLane = createSerialMutationLane();
  private readonly coalescer = createSettingsWriteCoalescer<BehaviorSettingChange>({
    key: (change) => change.field,
    send: (batch) => this.sendBehaviorBatch(batch),
  });
  private readonly hotkeyCoalescer = createSettingsWriteCoalescer<HotkeySettingChange>({
    key: (change) => change.action,
    send: (batch) => this.sendHotkeyBatch(batch),
  });
  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      void flushSettingsWriteQueues(this.coalescer, this.hotkeyCoalescer);
    }
  };
  private readonly onPageHide = (): void => {
    void flushSettingsWriteQueues(this.coalescer, this.hotkeyCoalescer);
  };

  constructor() {
    this.pageHostname = focusedHostnameFromLocation();
    this.selection = this.pageHostname
      ? { kind: 'site', hostname: this.pageHostname }
      : { kind: 'global' };
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    void this.load();
  }

  destroy(): void {
    if (!this.started) {
      return;
    }
    this.started = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    this.listeners.clear();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState() {
    const snapshot = this.snapshot;
    const selection = this.selection;
    const persisted = snapshot ? currentBehavior(snapshot, selection) : null;
    const behavior =
      persisted && snapshot
        ? applyOptimisticChanges(persisted, this.optimistic, selection, snapshot)
        : persisted;
    const persistedHotkeys = snapshot ? currentHotkeys(snapshot, selection) : null;
    const hotkeys =
      persistedHotkeys && snapshot
        ? applyOptimisticHotkeyChanges(
            persistedHotkeys,
            this.optimisticHotkeys,
            selection,
            snapshot,
          )
        : persistedHotkeys;
    const policy = behavior ? speedPolicyFromResolved(behavior) : undefined;
    const currentDisplay =
      behavior && snapshot
        ? displayedCurrentSpeed(selection, behavior, snapshot, this.optimistic)
        : { value: 1, muted: true };
    const overlayEnabled = behavior?.overlayVisible.value ?? true;
    const flashEnabled =
      (behavior?.buttonFlash.value ?? true) || (behavior?.hotkeyFlash.value ?? true);
    return {
      pageHostname: this.pageHostname,
      selection,
      snapshot,
      customSites: this.customSites,
      ready: this.ready,
      pending: this.blocking,
      error: this.error,
      drafts: this.drafts,
      behavior,
      hotkeys,
      currentSpeed: behavior
        ? resolveEffectiveSpeed(this.speedPreview ?? currentDisplay.value, policy)
        : 1,
      currentSpeedMuted: currentDisplay.muted && this.speedPreview == null,
      defaultSpeed: behavior ? resolveEffectiveSpeed(behavior.defaultSpeed.value, policy) : 1,
      delaySeconds: behavior ? String(behavior.overlayAutoHideDelayMs.value / 1000) : '2',
      flashDelaySeconds: behavior ? String(behavior.flashDelayMs.value / 1000) : '0.75',
      hotkeyRepeatDelaySeconds: behavior
        ? String(behavior.hotkeyRepeatDelayMs.value / 1000)
        : '0.5',
      policy,
      overlayLocked: this.blocking || !overlayEnabled,
      delayLocked: this.blocking || !overlayEnabled || !(behavior?.overlayAutoHide.value ?? true),
      flashLocked: this.blocking || !flashEnabled,
      hotkeyRepeatLocked: this.blocking || !(behavior?.hotkeyRepeat.value ?? false),
      resetBadgeText: selection.kind === 'site' ? t('settingOverride') : t('settingCustom'),
      feedback: this.feedback,
    };
  }

  mutate(change: BehaviorSettingChange): void {
    const scope = writeScope(this.selection);
    if (!this.snapshot || this.blocking || !scope) {
      return;
    }
    const base = this.behaviorRef ?? currentBehavior(this.snapshot, this.selection);
    this.behaviorRef = applyOptimisticChange(base, change, this.selection, this.snapshot);
    this.optimistic = { ...this.optimistic, [change.field]: change };
    if (
      change.field === 'speed' ||
      change.field === 'defaultSpeed' ||
      change.field === 'speedMin' ||
      change.field === 'speedMax'
    ) {
      this.speedPreview = null;
    }
    this.clearFeedback();
    this.emit();
    this.coalescer.enqueue(scope, change);
  }

  mutateHotkey(change: HotkeySettingChange): void {
    const scope = writeScope(this.selection);
    if (!this.snapshot || this.blocking || !scope) {
      return;
    }
    this.optimisticHotkeys = { ...this.optimisticHotkeys, [change.action]: change };
    this.clearFeedback();
    this.emit();
    this.hotkeyCoalescer.enqueue(scope, change);
  }

  adjustDisplayedSpeed(direction: 1 | -1): void {
    const current = this.behaviorRef;
    if (!current || !this.snapshot) {
      return;
    }
    const policy = speedPolicyFromResolved(current);
    const base = displayedCurrentSpeed(
      this.selection,
      current,
      this.snapshot,
      this.optimistic,
    ).value;
    this.mutate({
      kind: 'value',
      field: 'speed',
      value: adjustSpeed(base, direction, policy),
    });
  }

  setSpeedPreview(speed: number | null): void {
    this.speedPreview = speed;
    this.emit();
  }

  updateDraft(key: DraftKey, value: string): void {
    this.drafts = { ...this.drafts, [key]: value };
    this.emit();
  }

  commitDecimal(
    key: Exclude<DraftKey, 'delay' | 'flashDelay' | 'hotkeyRepeatDelay'>,
    fallback: number,
    min: number,
    max: number,
  ): void {
    const draft = this.takeDraft(key);
    if (draft == null) {
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const confirmed =
      key === 'fastForwardSpeed'
        ? canonicalizeFastForwardSpeed(parsed)
        : key === 'rewindSpeed'
          ? canonicalizeRewindSpeed(parsed)
          : key === 'skipBackSeconds' || key === 'skipForwardSeconds'
            ? canonicalizeSkipSeconds(parsed)
            : clampPolicyNumber(parsed, min, max);
    if (confirmed === fallback) {
      return;
    }
    this.mutate({ kind: 'value', field: key, value: confirmed });
  }

  commitDelay(): void {
    this.commitMilliseconds('delay', 'overlayAutoHideDelayMs', canonicalizeOverlayAutoHideDelayMs);
  }

  commitFlashDelay(): void {
    this.commitMilliseconds('flashDelay', 'flashDelayMs', canonicalizeFlashDelayMs);
  }

  commitHotkeyRepeatDelay(): void {
    this.commitMilliseconds(
      'hotkeyRepeatDelay',
      'hotkeyRepeatDelayMs',
      canonicalizeHotkeyRepeatDelayMs,
    );
  }

  selectPane(next: Selection): void {
    const applyPane = (): void => {
      this.selection = next;
      this.clearOptimistic();
      this.clearDrafts();
      this.speedPreview = null;
      this.captureBehavior();
      this.emit();
    };
    if (!settingsWriteQueuesBusy(this.coalescer, this.hotkeyCoalescer)) {
      applyPane();
      return;
    }
    void (async () => {
      this.blocking = true;
      this.emit();
      try {
        await flushSettingsWriteQueues(this.coalescer, this.hotkeyCoalescer);
        applyPane();
      } finally {
        this.blocking = false;
        this.emit();
      }
    })();
  }

  async selectSite(hostname: string): Promise<void> {
    if (this.blocking) {
      return;
    }
    this.blocking = true;
    this.clearFeedback();
    this.emit();
    try {
      await flushSettingsWriteQueues(this.coalescer, this.hotkeyCoalescer);
      this.clearOptimistic();
      this.clearDrafts();
      this.speedPreview = null;
      if (this.snapshot?.site?.hostname === hostname) {
        this.selection = { kind: 'site', hostname };
        this.captureBehavior();
        return;
      }
      const response = await requestGet(hostname);
      if (response.ok) {
        this.snapshot = response.state;
        this.selection = { kind: 'site', hostname };
        this.captureBehavior();
      } else {
        this.reportError(response.error);
      }
    } catch {
      this.reportError(t('settingsSaveError'));
    } finally {
      this.blocking = false;
      this.emit();
    }
  }

  async deleteSite(hostname: string): Promise<void> {
    await this.runDestructive(async () => {
      try {
        const response = await sendOptionsRequest(
          this.withSnapshotHostname({ type: 'DELETE_SITE_SETTINGS', hostname }),
        );
        if (!this.applyResponse(response) || (response && !response.ok)) {
          await this.recover('pane-and-sidebar');
          return;
        }
        if (response?.ok && !('siteMembership' in response && response.siteMembership)) {
          await this.recover('sidebar');
        }
        if (this.selection.kind === 'site' && this.selection.hostname === hostname) {
          this.selection = { kind: 'global' };
          this.captureBehavior();
        }
      } catch {
        this.reportError(t('settingsSaveError'));
        await this.recover('pane-and-sidebar');
      }
    });
  }

  async resetDefaults(): Promise<void> {
    await this.runDestructive(async () => {
      try {
        const response = await sendOptionsRequest(
          this.withSnapshotHostname({ type: 'RESET_GLOBAL_BEHAVIOR' }),
        );
        if (!this.applyResponse(response) || (response && !response.ok)) {
          await this.recover('pane');
        }
      } catch {
        this.reportError(t('settingsSaveError'));
        await this.recover('pane');
      }
    });
  }

  async resetAll(): Promise<void> {
    await this.runDestructive(async () => {
      try {
        const response = await sendOptionsRequest(
          this.withSnapshotHostname({ type: 'RESET_ALL_BEHAVIOR' }),
        );
        const partial = Boolean(
          response?.ok && 'skippedRecordCount' in response && response.skippedRecordCount > 0,
        );
        if (
          !this.applyResponse(response, { clearCustomSites: !partial }) ||
          (response && !response.ok)
        ) {
          await this.recover('pane-and-sidebar');
          return;
        }
        if (partial) {
          await this.recover('sidebar');
        }
      } catch {
        this.reportError(t('settingsSaveError'));
        await this.recover('pane-and-sidebar');
      }
    });
  }

  async exportBackup(): Promise<void> {
    if (this.blocking) {
      return;
    }
    this.blocking = true;
    this.clearFeedback();
    this.emit();
    try {
      await flushSettingsWriteQueues(this.coalescer, this.hotkeyCoalescer);
      const response = await sendOptionsRequest({ type: 'EXPORT_BACKUP' });
      if (!response?.ok) {
        this.reportError(
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
      this.reportError(t('backupExportError'));
    } finally {
      this.blocking = false;
      this.emit();
    }
  }

  async importBackup(mode: 'merge' | 'replace', backupText: string): Promise<boolean> {
    let imported = false;
    await this.runDestructive(async () => {
      try {
        const response = await sendOptionsRequest(
          this.withSnapshotHostname({ type: 'IMPORT_BACKUP', mode, backupText }),
        );
        const partial = Boolean(
          response?.ok && 'skippedRecordCount' in response && response.skippedRecordCount > 0,
        );
        if (response?.ok) {
          imported = true;
        }
        if (!this.applyResponse(response) || (response && !response.ok)) {
          await this.recover('pane-and-sidebar');
          return;
        }
        if (partial && !('customSites' in (response ?? {}))) {
          await this.recover('sidebar');
        }
      } catch {
        this.reportError(t('settingsSaveError'));
        await this.recover('pane-and-sidebar');
      }
    });
    return imported;
  }

  private async load(): Promise<void> {
    try {
      const [settings, sites] = await Promise.all([
        requestGet(this.pageHostname),
        requestCustomSites(),
      ]);
      if (!this.started) {
        return;
      }
      if (settings.ok) {
        this.snapshot = settings.state;
      } else {
        this.error = settings.error;
      }
      if (sites.ok) {
        this.customSites = sites.customSites;
      } else if (settings.ok) {
        this.reportError(sites.error);
      }
      this.captureBehavior();
    } catch {
      if (this.started) {
        this.error = t('settingsSaveError');
      }
    } finally {
      if (this.started) {
        this.ready = true;
        this.emit();
      }
    }
  }

  private captureBehavior(): void {
    const persisted = this.snapshot ? currentBehavior(this.snapshot, this.selection) : null;
    this.behaviorRef =
      persisted && this.snapshot
        ? applyOptimisticChanges(persisted, this.optimistic, this.selection, this.snapshot)
        : persisted;
  }

  private snapshotHostname(): string | null {
    return this.selection.kind === 'site' ? this.selection.hostname : this.pageHostname;
  }

  private withSnapshotHostname<T extends OptionsToBackgroundRequest>(message: T): T {
    const hostname = this.snapshotHostname();
    return hostname ? { ...message, snapshotHostname: hostname } : message;
  }

  private clearDrafts(): void {
    this.drafts = {};
  }

  private takeDraft(key: DraftKey): string | undefined {
    if (!Object.prototype.hasOwnProperty.call(this.drafts, key)) {
      return undefined;
    }
    const draft = this.drafts[key];
    const next = { ...this.drafts };
    delete next[key];
    this.drafts = next;
    this.emit();
    return draft;
  }

  private clearOptimistic(): void {
    this.optimistic = {};
    this.optimisticHotkeys = {};
  }

  private clearFeedback(): void {
    this.feedback = null;
  }

  private reportError(message: string): void {
    this.feedback = { level: 'error', message, token: ++this.feedbackToken };
  }

  private reportWarning(message: string): void {
    this.feedback = { level: 'warning', message, token: ++this.feedbackToken };
  }

  private commitMilliseconds(
    draftKey: 'delay' | 'flashDelay' | 'hotkeyRepeatDelay',
    field: 'overlayAutoHideDelayMs' | 'flashDelayMs' | 'hotkeyRepeatDelayMs',
    canonicalize: (milliseconds: number) => number,
  ): void {
    const draft = this.takeDraft(draftKey);
    if (draft == null) {
      return;
    }
    const seconds = Number(draft);
    if (!Number.isFinite(seconds) || seconds < 0) {
      return;
    }
    const confirmed = canonicalize(seconds * 1000);
    const canonical = this.behaviorRef?.[field].value;
    if (canonical != null && confirmed === canonical) {
      return;
    }
    this.mutate({ kind: 'value', field, value: confirmed });
  }

  private applyResponse(
    response: MutationResponse | undefined,
    options: {
      clearCustomSites?: boolean;
      sentChanges?: readonly BehaviorSettingChange[];
      sentHotkeys?: readonly HotkeySettingChange[];
    } = {},
  ): boolean {
    if (!response) {
      this.reportError(t('settingsSaveError'));
      this.emit();
      return false;
    }
    if (!response.ok) {
      this.reportError(persistErrorMessage(response.error));
      this.emit();
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
      this.reportWarning(nextWarning);
    }
    if (response.state) {
      this.snapshot = response.state;
      if (options.sentChanges) {
        this.optimistic = omitMatchingOptimisticChanges(this.optimistic, options.sentChanges);
      } else if (!options.sentHotkeys) {
        this.optimistic = {};
      }
      if (options.sentHotkeys) {
        let nextHotkeys = this.optimisticHotkeys;
        for (const change of options.sentHotkeys) {
          nextHotkeys = omitMatchingOptimisticHotkeys(nextHotkeys, change);
        }
        this.optimisticHotkeys = nextHotkeys;
      } else if (!options.sentChanges) {
        this.optimisticHotkeys = {};
      }
      if ('customSites' in response && response.customSites) {
        this.customSites = response.customSites;
      } else if (options.clearCustomSites) {
        this.customSites = [];
      } else if ('siteMembership' in response && response.siteMembership) {
        this.customSites = applyMembership(this.customSites, response.siteMembership);
      }
      if (!options.sentChanges && !options.sentHotkeys) {
        this.clearDrafts();
        this.speedPreview = null;
      }
      this.captureBehavior();
      this.emit();
      return true;
    }
    this.reportWarning(t('settingsRefreshError'));
    this.emit();
    return false;
  }

  private async recover(kind: RecoverKind): Promise<void> {
    if (kind !== 'sidebar') {
      const recovered = await requestGet(this.snapshotHostname()).catch(() => null);
      if (recovered?.ok) {
        this.snapshot = recovered.state;
        this.clearDrafts();
        this.speedPreview = null;
        this.captureBehavior();
      }
    }
    if (kind !== 'pane') {
      const sites = await requestCustomSites().catch(() => null);
      if (sites?.ok) {
        this.customSites = sites.customSites;
      }
    }
    this.emit();
  }

  private async runDestructive(work: () => Promise<void>): Promise<void> {
    if (this.blocking) {
      return;
    }
    this.blocking = true;
    this.clearFeedback();
    this.emit();
    try {
      await flushSettingsWriteQueues(this.coalescer, this.hotkeyCoalescer);
      this.clearOptimistic();
      await work();
    } finally {
      this.blocking = false;
      this.emit();
    }
  }

  private async sendBehaviorBatch(batch: SettingsWriteBatch): Promise<void> {
    await this.mutationLane.enqueue(async () => {
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
        const response = await sendOptionsRequest(this.withSnapshotHostname(payload));
        if (
          !this.applyResponse(response, { sentChanges: batch.changes }) ||
          response?.ok === false
        ) {
          await this.recover(membership ? 'pane-and-sidebar' : 'pane');
          this.optimistic = omitMatchingOptimisticChanges(this.optimistic, batch.changes);
          this.captureBehavior();
          this.emit();
        } else if (
          membership &&
          response?.ok &&
          !('siteMembership' in response && response.siteMembership)
        ) {
          await this.recover('sidebar');
        }
      } catch {
        this.reportError(t('settingsSaveError'));
        await this.recover(membership ? 'pane-and-sidebar' : 'pane');
        this.optimistic = omitMatchingOptimisticChanges(this.optimistic, batch.changes);
        this.captureBehavior();
        this.emit();
      }
    });
  }

  private async sendHotkeyBatch(batch: SettingsWriteBatch<HotkeySettingChange>): Promise<void> {
    await this.mutationLane.enqueue(async () => {
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
        const response = await sendOptionsRequest(this.withSnapshotHostname(payload));
        if (
          !this.applyResponse(response, { sentHotkeys: batch.changes }) ||
          response?.ok === false
        ) {
          await this.recover(membership ? 'pane-and-sidebar' : 'pane');
          let nextHotkeys = this.optimisticHotkeys;
          for (const change of batch.changes) {
            nextHotkeys = omitMatchingOptimisticHotkeys(nextHotkeys, change);
          }
          this.optimisticHotkeys = nextHotkeys;
          this.emit();
        } else if (
          membership &&
          response?.ok &&
          !('siteMembership' in response && response.siteMembership)
        ) {
          await this.recover('sidebar');
        }
      } catch {
        this.reportError(t('settingsSaveError'));
        await this.recover(membership ? 'pane-and-sidebar' : 'pane');
        let nextHotkeys = this.optimisticHotkeys;
        for (const change of batch.changes) {
          nextHotkeys = omitMatchingOptimisticHotkeys(nextHotkeys, change);
        }
        this.optimisticHotkeys = nextHotkeys;
        this.emit();
      }
    });
  }

  private emit(): void {
    if (this.renderQueued) {
      return;
    }
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      if (!this.started) {
        return;
      }
      for (const listener of [...this.listeners]) {
        listener();
      }
    });
  }
}

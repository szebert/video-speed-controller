// SPDX-License-Identifier: GPL-3.0-only

import { OverlayView } from '../overlay/overlay-view';
import { applyOverlayStyles } from '../overlay/overlay-sheet';
import type { OverlayActions, OverlaySeekPhase } from '../overlay/types';
import {
  bufferedStructureKey,
  clampDisplayedCurrentTime,
  readVideoTimeline,
  usableDuration,
} from './media-time';
import { visualHotkeyParts } from './hotkey-format';
import {
  canonicalizeFlashDelayMs,
  canonicalizeFlashOpacity,
  canonicalizeFlashScale,
  canonicalizeOverlayAutoHideDelayMs,
  canonicalizeOverlayScale,
  overlayPositionToGrid,
} from '../settings/site-behavior';
import type { EffectiveHotkeyMap, HotkeyBinding } from '../settings/hotkey-binding';
import type { AppliedTabBehavior } from './applied-tab-behavior';
import type { MediaNavigationAction, TabSpeedAction } from './controller-action';
import { canonicalizeSpeed, formatSpeed, formatSpeedDelta } from './speed';

export const OVERLAY_HOST_TAG = 'osvsc-overlay';
export const HOTKEY_FLASH_HOST_TAG = 'osvsc-hotkey-flash';
export const OVERLAY_INSET_PX = 8;
export const OVERLAY_MIN_SIZE_PX = 2;
export const OVERLAY_Z_INDEX = '2147483647';

export function isExtensionHost(node: Node): boolean {
  return (
    node instanceof Element &&
    (node.localName === OVERLAY_HOST_TAG || node.localName === HOTKEY_FLASH_HOST_TAG)
  );
}

export type FlashOrigin = 'hotkey' | 'button';

// Tab-wide speed flash keeps its own shape. Media-local navigation carries
// already-localized text so this module stays free of action-specific copy.
export type HotkeyFlashPayload =
  | {
      kind: 'speed';
      previousTargetSpeed: number;
      targetSpeed: number;
      binding?: HotkeyBinding | null;
      action?: TabSpeedAction;
    }
  | {
      kind: 'navigation';
      label: string;
      detail?: string;
      binding?: HotkeyBinding | null;
      action?: MediaNavigationAction;
    };

/** Hold-to-transport flashes stay up until `releaseHeldHotkeyFlash`. */
export type HotkeyFlashShowOptions = {
  hold?: boolean;
};

function styleExtensionHost(host: HTMLElement): void {
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('pointer-events', 'none', 'important');
  host.style.setProperty('z-index', OVERLAY_Z_INDEX, 'important');
  host.style.setProperty('margin', '0', 'important');
  host.style.setProperty('padding', '0', 'important');
  host.style.setProperty('box-sizing', 'border-box', 'important');
  host.style.setProperty('user-select', 'none', 'important');
  host.style.setProperty('visibility', 'hidden', 'important');
}

function flashLabel(payload: HotkeyFlashPayload): string {
  if (payload.kind === 'navigation') {
    return payload.detail ? `${payload.label} ${payload.detail}` : payload.label;
  }
  const speed = formatSpeed(payload.targetSpeed);
  const delta = canonicalizeSpeed(payload.targetSpeed - payload.previousTargetSpeed);
  if (delta === 0) {
    return speed;
  }
  return `${speed} ${formatSpeedDelta(delta)}`;
}

function overlayHidePolicyChanged(
  previous: AppliedTabBehavior | null,
  next: AppliedTabBehavior,
): boolean {
  if (previous == null) {
    return true;
  }
  return (
    previous.overlayVisible !== next.overlayVisible ||
    previous.overlayAutoHide !== next.overlayAutoHide ||
    previous.overlayAutoHideDelayMs !== next.overlayAutoHideDelayMs ||
    previous.overlayHoverHold !== next.overlayHoverHold
  );
}

const BUFFER_CHECK_MS = 400;

export class VideoOverlay {
  readonly host: HTMLElement;
  private readonly view: OverlayView;
  private behavior: AppliedTabBehavior | null = null;
  private hotkeys: EffectiveHotkeyMap | null = null;
  private controlled = false;
  private autoHideExpired = false;
  private interactive = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private layoutVisible = false;
  private flashHost: HTMLElement | null = null;
  private flashPill: HTMLElement | null = null;
  private flashGeneration = 0;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private flashHeld = false;
  private flashOrigin: FlashOrigin | null = null;
  private pendingSeek: number | null = null;
  private seekRaf: number | null = null;
  private timelineStructureDirty = false;
  private lastStructureKey = '';
  private lastBufferCheckAt = 0;
  private knownDuration: number | null = null;
  private readonly abort = new AbortController();

  constructor(
    readonly video: HTMLVideoElement,
    private readonly requestLayout: () => void,
    private readonly actions: OverlayActions = {
      adjustSpeed() {},
    },
  ) {
    const document = video.ownerDocument;
    this.host = document.createElement(OVERLAY_HOST_TAG);
    styleExtensionHost(this.host);

    const shadow = this.host.attachShadow({ mode: 'open' });
    applyOverlayStyles(shadow);
    this.view = new OverlayView(document, {
      onAdjust: (direction) => {
        this.restartAutoHide();
        this.actions.adjustSpeed(direction, this.video);
      },
      onReset: () => {
        this.restartAutoHide();
        this.actions.resetSpeed?.(this.video);
      },
      onMediaAction: (action, phase, hold) => {
        this.restartAutoHide();
        // Hold buttons pass a per-gesture owner. Press actions have none.
        this.actions.mediaAction?.(action, phase, this.video, hold ?? this);
      },
      onSetPosition: (position) => {
        this.restartAutoHide();
        this.actions.setOverlayPosition?.(position);
      },
      onOpenSettings: () => {
        this.restartAutoHide();
        this.actions.openSettings?.();
      },
      onInteractiveChange: (active) => {
        this.setInteractive(active);
      },
      onSeek: (seconds, phase) => {
        this.handleSeek(seconds, phase);
      },
      onSeekCancel: () => {
        this.handleSeekCancel();
      },
    });
    shadow.append(this.view.element);
    document.documentElement.append(this.host);

    const signal = this.abort.signal;
    const onPlaybackChange = (): void => {
      this.syncView();
    };
    for (const type of ['play', 'pause', 'ended'] as const) {
      video.addEventListener(type, onPlaybackChange, { signal });
    }
    video.addEventListener('timeupdate', () => this.onTimeUpdate(), { signal });
    for (const type of ['seeking', 'seeked', 'pause', 'ended'] as const) {
      video.addEventListener(type, () => this.onTimelinePositionEvent(), { signal });
    }
    for (const type of ['loadedmetadata', 'durationchange', 'progress', 'emptied'] as const) {
      video.addEventListener(type, () => this.onTimelineStructureEvent(), { signal });
    }
  }

  get speedReadout(): HTMLButtonElement | null {
    return this.view.speedReadout.isConnected ? this.view.speedReadout : null;
  }

  setBehavior(behavior: AppliedTabBehavior, hotkeys?: EffectiveHotkeyMap): void {
    const previous = this.behavior;
    this.behavior = behavior;
    if (hotkeys) {
      this.hotkeys = hotkeys;
    }
    this.syncOverlayScale();
    if (this.flashOrigin && !this.flashOriginEnabled(behavior, this.flashOrigin)) {
      this.invalidateFlash();
    } else {
      this.syncFlashScale();
      this.syncFlashOpacity();
    }
    this.syncView();
    this.reconcileSeekUi(previous, behavior);
    // Transform is grid-only: apply even when auto-hide has already hidden the
    // host, so a later position APPLY is not stuck on the previous anchor.
    this.applyPositionTransform();
    if (this.controlled && overlayHidePolicyChanged(previous, behavior)) {
      this.restartAutoHide();
    }
    this.requestLayout();
  }

  setControlled(owned: boolean): void {
    const wasOwned = this.controlled;
    this.controlled = owned;
    if (!owned) {
      this.cancelPendingSeek();
      this.timelineStructureDirty = false;
      this.interactive = false;
      this.clearHideTimer();
      this.autoHideExpired = false;
      this.invalidateFlash();
      this.syncView();
      this.requestLayout();
      return;
    }
    this.restartAutoHide();
    this.syncView();
    if (!wasOwned && this.seekUiUsable()) {
      this.applyFullSnapshot();
    }
    this.requestLayout();
  }

  showHotkeyFlash(payload: HotkeyFlashPayload, options?: HotkeyFlashShowOptions): void {
    this.presentFlash(payload, 'hotkey', options);
  }

  showButtonFlash(payload: HotkeyFlashPayload, options?: HotkeyFlashShowOptions): void {
    this.presentFlash(payload, 'button', options);
  }

  /** Starts the auto-hide delay only for a flash that is currently held. */
  releaseHeldHotkeyFlash(): void {
    if (!this.flashHeld || !this.behavior) {
      return;
    }
    this.flashHeld = false;
    if (!this.flashHost) {
      return;
    }
    this.startHideTimer(this.flashGeneration, canonicalizeFlashDelayMs(this.behavior.flashDelayMs));
  }

  notifyActivity(): void {
    if (!this.controlled || !this.behavior) {
      return;
    }
    this.restartAutoHide();
  }

  isPointerEligible(): boolean {
    return (
      this.controlled &&
      this.behavior != null &&
      this.behavior.overlayVisible &&
      this.video.isConnected
    );
  }

  layout(measureRect: () => DOMRect = () => this.video.getBoundingClientRect()): void {
    let cached: DOMRect | undefined;
    const measure = (): DOMRect => {
      cached ??= measureRect();
      return cached;
    };
    const rect = this.evaluateVisibility(measure);
    const visible = rect != null;
    const changed = this.layoutVisible !== visible;
    this.layoutVisible = visible;
    this.host.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');
    if (changed) {
      this.syncView(visible);
    }
    this.applyPositionTransform();
    if (!visible || !this.behavior) {
      this.layoutFlash(measure);
      return;
    }
    const { row, column } = overlayPositionToGrid(this.behavior.overlayPosition);
    const x =
      column === 0
        ? rect.left + OVERLAY_INSET_PX
        : column === 1
          ? rect.left + rect.width / 2
          : rect.right - OVERLAY_INSET_PX;
    const y =
      row === 0
        ? rect.top + OVERLAY_INSET_PX
        : row === 1
          ? rect.top + rect.height / 2
          : rect.bottom - OVERLAY_INSET_PX;
    this.host.style.setProperty('left', `${x}px`, 'important');
    this.host.style.setProperty('top', `${y}px`, 'important');
    this.layoutFlash(measure);
  }

  /** Grid translate is independent of the video rect and of visibility. */
  private applyPositionTransform(): void {
    if (!this.behavior) {
      return;
    }
    const { row, column } = overlayPositionToGrid(this.behavior.overlayPosition);
    const translateX = column === 0 ? '0' : column === 1 ? '-50%' : '-100%';
    const translateY = row === 0 ? '0' : row === 1 ? '-50%' : '-100%';
    this.host.style.setProperty(
      'transform',
      `translate(${translateX}, ${translateY})`,
      'important',
    );
  }

  /** Ends live overlay holds. Page hide is owned by MediaRegistry. */
  releaseHolds(): void {
    this.view.releaseHolds();
  }

  destroy(): void {
    this.cancelPendingSeek();
    this.timelineStructureDirty = false;
    this.abort.abort();
    this.clearHideTimer();
    this.invalidateFlash();
    // Ends any live hold before the controls disappear.
    this.view.destroy();
    this.host.remove();
  }

  private isCheapHidden(): boolean {
    return (
      this.behavior == null ||
      !this.controlled ||
      !this.behavior.overlayVisible ||
      (this.behavior.overlayAutoHide && this.autoHideExpired) ||
      !this.video.isConnected
    );
  }

  private syncView(visible = this.isCheapHidden() ? false : this.layoutVisible): void {
    if (!this.behavior) {
      return;
    }
    this.view.update({
      behavior: this.behavior,
      visible,
      paused: this.video.paused,
      hotkeys: this.hotkeys,
    });
  }

  private evaluateVisibility(measureRect: () => DOMRect): DOMRect | null {
    if (this.isCheapHidden()) {
      return null;
    }
    const rect = measureRect();
    if (rect.width < OVERLAY_MIN_SIZE_PX || rect.height < OVERLAY_MIN_SIZE_PX) {
      return null;
    }
    return rect;
  }

  private seekUiUsable(): boolean {
    return (
      this.controlled &&
      this.behavior?.overlayVisible === true &&
      this.behavior?.overlaySeekBar === true
    );
  }

  private timelineSuppressed(): boolean {
    return this.view.isScrubbing || this.pendingSeek != null;
  }

  private handleSeek(seconds: number, phase: OverlaySeekPhase): void {
    if (!this.seekUiUsable()) {
      return;
    }
    this.restartAutoHide();
    if (phase === 'commit') {
      this.flushSeek(seconds);
      return;
    }
    this.queueSeek(seconds);
  }

  private handleSeekCancel(): void {
    if (!this.seekUiUsable()) {
      return;
    }
    this.cancelPendingSeek();
    this.applyFullSnapshot();
  }

  private queueSeek(seconds: number): void {
    this.pendingSeek = seconds;
    if (this.seekRaf != null) {
      return;
    }
    const view = this.video.ownerDocument.defaultView;
    if (!view) {
      this.flushSeek(seconds);
      return;
    }
    this.seekRaf = view.requestAnimationFrame(() => {
      this.seekRaf = null;
      const pending = this.pendingSeek;
      this.pendingSeek = null;
      if (pending == null || !this.seekUiUsable()) {
        return;
      }
      this.actions.seek?.(pending, this.video);
      this.applyPositionSnapshot();
      this.consumeDirtyStructureIfEligible();
    });
  }

  private flushSeek(seconds: number): void {
    this.cancelPendingSeek();
    if (!this.seekUiUsable()) {
      return;
    }
    this.actions.seek?.(seconds, this.video);
    this.applyFullSnapshot();
  }

  private cancelPendingSeek(): void {
    if (this.seekRaf != null) {
      this.video.ownerDocument.defaultView?.cancelAnimationFrame(this.seekRaf);
      this.seekRaf = null;
    }
    this.pendingSeek = null;
  }

  private applyPositionSnapshot(): void {
    const duration = this.knownDuration ?? usableDuration(this.video.duration);
    this.knownDuration = duration;
    this.view.updateTimelinePosition(
      clampDisplayedCurrentTime(this.video.currentTime, duration),
      duration,
    );
  }

  private applyFullSnapshot(): void {
    const state = readVideoTimeline(this.video);
    this.knownDuration = state.duration;
    this.lastStructureKey = bufferedStructureKey(state.duration, state.buffered);
    this.timelineStructureDirty = false;
    this.view.updateTimeline(state);
  }

  private consumeDirtyStructureIfEligible(): void {
    if (!this.seekUiUsable() || this.timelineSuppressed() || !this.timelineStructureDirty) {
      return;
    }
    this.applyFullSnapshot();
  }

  private onTimelinePositionEvent(): void {
    if (!this.seekUiUsable() || this.timelineSuppressed()) {
      return;
    }
    this.applyPositionSnapshot();
  }

  private onTimelineStructureEvent(): void {
    if (!this.seekUiUsable()) {
      return;
    }
    if (this.timelineSuppressed()) {
      this.timelineStructureDirty = true;
      return;
    }
    this.applyFullSnapshot();
  }

  private onTimeUpdate(): void {
    if (!this.seekUiUsable()) {
      return;
    }
    const now = this.video.ownerDocument.defaultView?.performance.now() ?? Date.now();
    if (now - this.lastBufferCheckAt >= BUFFER_CHECK_MS) {
      this.lastBufferCheckAt = now;
      const observed = readVideoTimeline(this.video);
      const key = bufferedStructureKey(observed.duration, observed.buffered);
      if (key !== this.lastStructureKey) {
        if (this.timelineSuppressed()) {
          this.timelineStructureDirty = true;
        } else {
          this.applyFullSnapshot();
          return;
        }
      }
    }
    if (this.timelineSuppressed()) {
      return;
    }
    this.applyPositionSnapshot();
  }

  private reconcileSeekUi(previous: AppliedTabBehavior | null, next: AppliedTabBehavior): void {
    const usable = this.seekUiUsable();
    const wasUsable =
      this.controlled && previous?.overlayVisible === true && previous.overlaySeekBar === true;
    if (!next.overlaySeekBar || !next.overlayVisible) {
      this.cancelPendingSeek();
      this.timelineStructureDirty = false;
    }
    if (usable && !wasUsable) {
      this.applyFullSnapshot();
    }
  }

  private setInteractive(active: boolean): void {
    if (this.interactive === active) {
      return;
    }
    this.interactive = active;
    if (active) {
      this.clearHideTimer();
      this.autoHideExpired = false;
      this.requestLayout();
      return;
    }
    this.restartAutoHide();
    this.requestLayout();
  }

  private restartAutoHide(): void {
    this.clearHideTimer();
    this.autoHideExpired = false;
    if (
      !this.controlled ||
      !this.behavior ||
      !this.behavior.overlayVisible ||
      !this.behavior.overlayAutoHide ||
      this.interactive
    ) {
      return;
    }
    this.hideTimer = setTimeout(() => {
      this.autoHideExpired = true;
      this.syncView();
      this.requestLayout();
    }, canonicalizeOverlayAutoHideDelayMs(this.behavior.overlayAutoHideDelayMs));
  }

  private clearHideTimer(): void {
    if (this.hideTimer != null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private presentFlash(
    payload: HotkeyFlashPayload,
    origin: FlashOrigin,
    options?: HotkeyFlashShowOptions,
  ): void {
    if (!this.controlled || !this.behavior || !this.flashOriginEnabled(this.behavior, origin)) {
      return;
    }
    const id = this.showFlash(payload, origin);
    this.flashHeld = options?.hold === true;
    if (this.flashHeld) {
      return;
    }
    this.startHideTimer(id, canonicalizeFlashDelayMs(this.behavior.flashDelayMs));
  }

  private flashOriginEnabled(
    behavior: AppliedTabBehavior | null,
    origin: FlashOrigin | null,
  ): boolean {
    if (!behavior) {
      return false;
    }
    if (origin === 'hotkey') {
      return behavior.hotkeyFlash;
    }
    if (origin === 'button') {
      return behavior.buttonFlash;
    }
    return false;
  }

  private flashBinding(payload: HotkeyFlashPayload): HotkeyBinding | null {
    if (payload.binding) {
      return payload.binding;
    }
    if (payload.action == null) {
      return null;
    }
    return this.hotkeys?.[payload.action] ?? null;
  }

  private showFlash(payload: HotkeyFlashPayload, origin: FlashOrigin): number {
    this.flashGeneration += 1;
    const id = this.flashGeneration;
    this.flashOrigin = origin;
    this.clearFlashTimer();
    const host = this.ensureFlashHost();
    const document = host.ownerDocument;
    const pill = this.flashPill;
    if (!pill) {
      return id;
    }
    pill.replaceChildren();
    const label = document.createElement('span');
    label.className = 'hotkey-flash-label';
    label.textContent = flashLabel(payload);
    const binding = this.flashBinding(payload);
    if (binding) {
      const hint = document.createElement('kbd');
      hint.className = 'hotkey-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = visualHotkeyParts(binding).join('\u2009');
      pill.append(label, hint);
    } else {
      pill.append(label);
    }
    this.syncFlashOpacity();
    this.requestLayout();
    return id;
  }

  private startHideTimer(id: number, delayMs: number): void {
    this.clearFlashTimer();
    this.flashTimer = setTimeout(() => {
      this.hideNow(id);
    }, delayMs);
  }

  private hideNow(id: number): void {
    if (id !== this.flashGeneration) {
      return;
    }
    this.invalidateFlash();
  }

  private invalidateFlash(): void {
    this.flashGeneration += 1;
    this.flashHeld = false;
    this.flashOrigin = null;
    this.clearFlashTimer();
    this.removeFlashHost();
  }

  private ensureFlashHost(): HTMLElement {
    if (this.flashHost?.isConnected && this.flashPill) {
      return this.flashHost;
    }
    this.removeFlashHost();
    const document = this.video.ownerDocument;
    const host = document.createElement(HOTKEY_FLASH_HOST_TAG);
    styleExtensionHost(host);
    const shadow = host.attachShadow({ mode: 'open' });
    applyOverlayStyles(shadow);
    const pill = document.createElement('div');
    pill.className = 'hotkey-flash';
    pill.setAttribute('aria-hidden', 'true');
    shadow.append(pill);
    document.documentElement.append(host);
    this.flashHost = host;
    this.flashPill = pill;
    this.syncFlashScale();
    return host;
  }

  private removeFlashHost(): void {
    this.flashHost?.remove();
    this.flashHost = null;
    this.flashPill = null;
  }

  private clearFlashTimer(): void {
    if (this.flashTimer != null) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
  }

  private syncOverlayScale(): void {
    if (!this.behavior) {
      return;
    }
    const scale = String(canonicalizeOverlayScale(this.behavior.overlayScale) / 100);
    this.host.style.setProperty('--overlay-scale', scale, 'important');
  }

  private syncFlashScale(): void {
    if (!this.flashHost || !this.behavior) {
      return;
    }
    const scale = String(canonicalizeFlashScale(this.behavior.flashScale) / 100);
    this.flashHost.style.setProperty('--flash-scale', scale, 'important');
  }

  private syncFlashOpacity(): void {
    if (!this.flashPill || !this.behavior) {
      return;
    }
    this.flashPill.style.opacity = `${canonicalizeFlashOpacity(this.behavior.flashOpacity) / 100}`;
  }

  private layoutFlash(measureRect: () => DOMRect): void {
    if (!this.flashHost) {
      return;
    }
    const rect = this.evaluateFlashRect(measureRect);
    this.flashHost.style.setProperty('visibility', rect ? 'visible' : 'hidden', 'important');
    if (!rect) {
      return;
    }
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 4;
    this.flashHost.style.setProperty('left', `${x}px`, 'important');
    this.flashHost.style.setProperty('top', `${y}px`, 'important');
    this.flashHost.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
  }

  private evaluateFlashRect(measureRect: () => DOMRect): DOMRect | null {
    if (
      !this.controlled ||
      !this.flashOriginEnabled(this.behavior, this.flashOrigin) ||
      !this.flashHost ||
      !this.video.isConnected
    ) {
      return null;
    }
    const rect = measureRect();
    if (rect.width < OVERLAY_MIN_SIZE_PX || rect.height < OVERLAY_MIN_SIZE_PX) {
      return null;
    }
    return rect;
  }
}

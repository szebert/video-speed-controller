// SPDX-License-Identifier: GPL-3.0-only

import { OverlayView } from '../overlay/overlay-view';
import { applyOverlayStyles } from '../overlay/overlay-sheet';
import type { OverlayActions } from '../overlay/types';
import { visualHotkeyParts } from './hotkey-format';
import {
  canonicalizeHotkeyFlashDelayMs,
  canonicalizeHotkeyFlashOpacity,
  canonicalizeOverlayAutoHideDelayMs,
  overlayPositionToGrid,
} from '../settings/site-behavior';
import type { EffectiveHotkeyMap, HotkeyBinding } from '../settings/hotkey-binding';
import type { AppliedTabBehavior } from './applied-tab-behavior';
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

// Tab-wide speed flash keeps its own shape. Media-local navigation carries
// already-localized text so this module stays free of action-specific copy.
export type HotkeyFlashPayload =
  | {
      kind: 'speed';
      previousTargetSpeed: number;
      targetSpeed: number;
      binding: HotkeyBinding;
    }
  | {
      kind: 'navigation';
      label: string;
      detail?: string;
      binding: HotkeyBinding;
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
      onMediaAction: (action, phase) => {
        this.restartAutoHide();
        // `this` is the hold identity: one overlay owns at most one hold.
        this.actions.mediaAction?.(action, phase, this.video, this);
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
    });
    shadow.append(this.view.element);
    document.documentElement.append(this.host);

    const onPlaybackChange = (): void => {
      this.syncView();
    };
    for (const type of ['play', 'pause', 'ended'] as const) {
      video.addEventListener(type, onPlaybackChange, { signal: this.abort.signal });
    }
  }

  get speedReadout(): HTMLElement | null {
    return this.view.speedReadout.isConnected ? this.view.speedReadout : null;
  }

  setBehavior(behavior: AppliedTabBehavior, hotkeys?: EffectiveHotkeyMap): void {
    const previous = this.behavior;
    this.behavior = behavior;
    if (hotkeys) {
      this.hotkeys = hotkeys;
    }
    if (!behavior.hotkeyFlash) {
      this.invalidateFlash();
    } else {
      this.syncFlashOpacity();
    }
    this.syncView();
    // Transform is grid-only: apply even when auto-hide has already hidden the
    // host, so a later position APPLY is not stuck on the previous anchor.
    this.applyPositionTransform();
    if (this.controlled && overlayHidePolicyChanged(previous, behavior)) {
      this.restartAutoHide();
    }
    this.requestLayout();
  }

  setControlled(owned: boolean): void {
    this.controlled = owned;
    if (!owned) {
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
    this.requestLayout();
  }

  showHotkeyFlash(payload: HotkeyFlashPayload): void {
    if (!this.controlled || !this.behavior) {
      return;
    }
    const id = this.showFlash(payload);
    this.startHideTimer(id, canonicalizeHotkeyFlashDelayMs(this.behavior.hotkeyFlashDelayMs));
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

  destroy(): void {
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

  private showFlash(payload: HotkeyFlashPayload): number {
    this.flashGeneration += 1;
    const id = this.flashGeneration;
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
    const hint = document.createElement('kbd');
    hint.className = 'hotkey-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = visualHotkeyParts(payload.binding).join('\u2009');
    pill.append(label, hint);
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

  private syncFlashOpacity(): void {
    if (!this.flashPill || !this.behavior) {
      return;
    }
    this.flashPill.style.opacity = `${canonicalizeHotkeyFlashOpacity(this.behavior.hotkeyFlashOpacity) / 100}`;
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
      !this.behavior?.hotkeyFlash ||
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

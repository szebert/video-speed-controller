// SPDX-License-Identifier: GPL-3.0-only

import { OverlayView } from '../overlay/overlay-view';
import { applyOverlayStyles } from '../overlay/overlay-sheet';
import type { OverlayActions } from '../overlay/types';
import {
  canonicalizeOverlayAutoHideDelayMs,
  overlayPositionToGrid,
} from '../settings/site-behavior';
import type { AppliedTabBehavior } from './applied-tab-behavior';

export const OVERLAY_HOST_TAG = 'osvsc-overlay';
export const OVERLAY_INSET_PX = 8;
export const OVERLAY_MIN_SIZE_PX = 2;
export const OVERLAY_Z_INDEX = '2147483647';

export class VideoOverlay {
  readonly host: HTMLElement;
  private readonly view: OverlayView;
  private readonly videoAbort = new AbortController();
  private behavior: AppliedTabBehavior | null = null;
  private controlled = false;
  private autoHideExpired = false;
  private interactive = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private layoutVisible = false;

  constructor(
    readonly video: HTMLVideoElement,
    private readonly requestLayout: () => void,
    private readonly actions: OverlayActions = {
      adjustSpeed() {},
    },
  ) {
    const document = video.ownerDocument;
    this.host = document.createElement(OVERLAY_HOST_TAG);
    this.host.style.setProperty('all', 'initial', 'important');
    this.host.style.setProperty('position', 'fixed', 'important');
    this.host.style.setProperty('pointer-events', 'none', 'important');
    this.host.style.setProperty('z-index', OVERLAY_Z_INDEX, 'important');
    this.host.style.setProperty('margin', '0', 'important');
    this.host.style.setProperty('padding', '0', 'important');
    this.host.style.setProperty('box-sizing', 'border-box', 'important');
    this.host.style.setProperty('visibility', 'hidden', 'important');

    const shadow = this.host.attachShadow({ mode: 'open' });
    applyOverlayStyles(shadow);
    this.view = new OverlayView(document, {
      onAdjust: (direction) => {
        this.restartAutoHide();
        this.actions.adjustSpeed(direction);
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

    const signal = this.videoAbort.signal;
    video.addEventListener('pointermove', this.onVideoActivity, { signal });
    video.addEventListener('focus', this.onVideoActivity, { signal });
    video.addEventListener('focusin', this.onVideoActivity, { signal });

    const view = document.defaultView;
    view?.addEventListener('pointermove', this.onWindowPointerMove, { capture: true, signal });
    view?.addEventListener('pointerdown', this.onWindowPointerDown, { capture: true, signal });
  }

  get speedReadout(): HTMLElement | null {
    return this.view.speedReadout.isConnected ? this.view.speedReadout : null;
  }

  setBehavior(behavior: AppliedTabBehavior): void {
    this.behavior = behavior;
    this.syncView();
    if (this.controlled) {
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
      this.syncView();
      this.requestLayout();
      return;
    }
    this.restartAutoHide();
    this.syncView();
    this.requestLayout();
  }

  layout(measureRect: () => DOMRect = () => this.video.getBoundingClientRect()): void {
    const rect = this.evaluateVisibility(measureRect);
    const visible = rect != null;
    const changed = this.layoutVisible !== visible;
    this.layoutVisible = visible;
    this.host.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');
    if (changed) {
      this.syncView(visible);
    }
    if (!visible || !this.behavior) {
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
    const translateX = column === 0 ? '0' : column === 1 ? '-50%' : '-100%';
    const translateY = row === 0 ? '0' : row === 1 ? '-50%' : '-100%';
    this.host.style.setProperty('left', `${x}px`, 'important');
    this.host.style.setProperty('top', `${y}px`, 'important');
    this.host.style.setProperty(
      'transform',
      `translate(${translateX}, ${translateY})`,
      'important',
    );
  }

  destroy(): void {
    this.clearHideTimer();
    this.videoAbort.abort();
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
    });
  }

  private readonly onVideoActivity = (): void => {
    if (!this.controlled || !this.behavior) {
      return;
    }
    this.restartAutoHide();
    this.requestLayout();
  };

  private readonly onWindowPointerMove = (event: Event): void => {
    if (!(event instanceof PointerEvent) || !this.isPointOverVideo(event.clientX, event.clientY)) {
      return;
    }
    this.onVideoActivity();
  };

  private readonly onWindowPointerDown = (event: Event): void => {
    if (!(event instanceof PointerEvent) || !this.isPointOverVideo(event.clientX, event.clientY)) {
      return;
    }
    this.onVideoActivity();
  };

  private isPointOverVideo(clientX: number, clientY: number): boolean {
    const rect = this.video.getBoundingClientRect();
    return (
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    );
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
}

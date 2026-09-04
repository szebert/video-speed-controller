// SPDX-License-Identifier: GPL-3.0-only

import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { OverlayRoot } from '../overlay/OverlayRoot';
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
  private readonly mount: HTMLElement;
  private readonly reactRoot: Root;
  private readonly videoAbort = new AbortController();
  private behavior: AppliedTabBehavior | null = null;
  private controlled = false;
  private autoHideExpired = false;
  private interactive = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly resizeObserver: ResizeObserver;

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
    this.mount = document.createElement('div');
    shadow.append(this.mount);
    document.documentElement.append(this.host);
    this.reactRoot = createRoot(this.mount);

    this.resizeObserver = new ResizeObserver(() => {
      this.requestLayout();
    });
    this.resizeObserver.observe(video);

    const signal = this.videoAbort.signal;
    video.addEventListener('pointermove', this.onVideoActivity, { signal });
    video.addEventListener('focus', this.onVideoActivity, { signal });
    video.addEventListener('focusin', this.onVideoActivity, { signal });

    const view = document.defaultView;
    view?.addEventListener('pointermove', this.onWindowPointerMove, { capture: true, signal });
    view?.addEventListener('pointerdown', this.onWindowPointerDown, { capture: true, signal });
  }

  get speedReadout(): HTMLElement | null {
    return this.host.shadowRoot?.querySelector('.speed') ?? null;
  }

  setBehavior(behavior: AppliedTabBehavior): void {
    this.behavior = behavior;
    this.renderControls();
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
      this.requestLayout();
      return;
    }
    this.restartAutoHide();
    this.requestLayout();
  }

  layout(): void {
    const visible = this.isVisible();
    const wasVisible = this.host.style.visibility !== 'hidden';
    this.host.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');
    if (wasVisible !== visible) {
      this.renderControls();
    }
    if (!visible || !this.behavior) {
      return;
    }
    const rect = this.video.getBoundingClientRect();
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
    this.resizeObserver.disconnect();
    this.reactRoot.unmount();
    this.host.remove();
  }

  private renderControls(): void {
    if (!this.behavior) {
      return;
    }
    const behavior = this.behavior;
    flushSync(() => {
      this.reactRoot.render(
        createElement(OverlayRoot, {
          behavior,
          visible: this.isVisible(),
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
        }),
      );
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

  private isVisible(): boolean {
    if (this.behavior == null || !this.controlled || !this.isRenderable()) {
      return false;
    }
    if (!this.behavior.overlayVisible) {
      return false;
    }
    if (!this.behavior.overlayAutoHide) {
      return true;
    }
    return !this.autoHideExpired;
  }

  private isRenderable(): boolean {
    if (!this.video.isConnected) {
      return false;
    }
    const rect = this.video.getBoundingClientRect();
    return rect.width >= OVERLAY_MIN_SIZE_PX && rect.height >= OVERLAY_MIN_SIZE_PX;
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

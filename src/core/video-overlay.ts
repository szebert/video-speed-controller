// SPDX-License-Identifier: GPL-3.0-only

import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { OverlayRoot } from '../overlay/OverlayRoot';
import { applyOverlayStyles } from '../overlay/overlay-sheet';
import type { OverlayActions } from '../overlay/types';
import { overlayPositionToGrid } from '../settings/site-behavior';
import type { AppliedTabBehavior } from './applied-tab-behavior';

export const OVERLAY_HOST_TAG = 'osvsc-overlay';
export const OVERLAY_INSET_PX = 8;
export const OVERLAY_MIN_SIZE_PX = 2;
export const OVERLAY_Z_INDEX = '2147483647';

function isDisabledControl(node: Element): boolean {
  return (
    (node instanceof HTMLButtonElement && node.disabled) ||
    node.getAttribute('aria-disabled') === 'true' ||
    node.hasAttribute('data-disabled')
  );
}

export class VideoOverlay {
  readonly host: HTMLElement;
  private readonly mount: HTMLElement;
  private readonly reactRoot: Root;
  private readonly videoAbort = new AbortController();
  private behavior: AppliedTabBehavior | null = null;
  private controlled = false;
  private autoHideExpired = false;
  private controlsPointer = false;
  private focusWithin = false;
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
    video.addEventListener('pointerenter', this.onVideoActivity, { signal });
    video.addEventListener('pointermove', this.onVideoActivity, { signal });
    video.addEventListener('focus', this.onVideoActivity, { signal });
    video.addEventListener('focusin', this.onVideoActivity, { signal });

    const view = document.defaultView;
    view?.addEventListener('pointermove', this.onWindowPointerMove, { capture: true, signal });
    view?.addEventListener('pointerdown', this.onWindowPointerDown, { capture: true, signal });
    view?.addEventListener('click', this.onWindowClick, { capture: true, signal });
  }

  get speedReadout(): HTMLElement | null {
    return this.host.shadowRoot?.querySelector('[aria-live]') ?? null;
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
    this.host.style.setProperty('visibility', visible ? 'visible' : 'hidden', 'important');
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
          onAdjust: (direction) => {
            this.restartAutoHide();
            this.actions.adjustSpeed(direction);
          },
          onPointerActiveChange: (active) => {
            this.controlsPointer = active;
            if (active) {
              this.clearHideTimer();
              this.autoHideExpired = false;
            } else {
              this.restartAutoHide();
            }
            this.requestLayout();
          },
          onFocusWithinChange: (focused) => {
            this.focusWithin = focused;
            if (focused) {
              this.clearHideTimer();
              this.autoHideExpired = false;
            } else {
              this.restartAutoHide();
            }
            this.requestLayout();
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
    if (!(event instanceof PointerEvent)) {
      return;
    }
    if (this.controlDirectionFromEvent(event) != null) {
      return;
    }
    if (this.isPointOverVideo(event.clientX, event.clientY)) {
      this.onVideoActivity();
    }
  };

  private readonly onWindowClick = (event: Event): void => {
    const direction = this.controlDirectionFromEvent(event);
    if (direction == null) {
      return;
    }
    event.stopImmediatePropagation();
    this.restartAutoHide();
    this.actions.adjustSpeed(direction);
    this.requestLayout();
  };

  private controlDirectionFromEvent(event: Event): -1 | 1 | null {
    if (!this.isVisible()) {
      return null;
    }
    const root = this.host.shadowRoot;
    if (!root) {
      return null;
    }
    const path = event.composedPath();
    const slower = root.querySelector('[aria-label="Slower"]');
    const faster = root.querySelector('[aria-label="Faster"]');
    if (slower && path.includes(slower) && !isDisabledControl(slower)) {
      return -1;
    }
    if (faster && path.includes(faster) && !isDisabledControl(faster)) {
      return 1;
    }
    return null;
  }

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
    if (!this.behavior.overlayAutoHide) {
      return true;
    }
    return !this.autoHideExpired || this.controlsPointer || this.focusWithin;
  }

  private isRenderable(): boolean {
    if (!this.video.isConnected) {
      return false;
    }
    const rect = this.video.getBoundingClientRect();
    return rect.width >= OVERLAY_MIN_SIZE_PX && rect.height >= OVERLAY_MIN_SIZE_PX;
  }

  private restartAutoHide(): void {
    this.clearHideTimer();
    this.autoHideExpired = false;
    if (!this.behavior?.overlayAutoHide || this.controlsPointer || this.focusWithin) {
      return;
    }
    this.hideTimer = setTimeout(
      () => {
        this.autoHideExpired = true;
        this.requestLayout();
      },
      Math.max(0, this.behavior.overlayAutoHideDelayMs),
    );
  }

  private clearHideTimer(): void {
    if (this.hideTimer != null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}

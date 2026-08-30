// SPDX-License-Identifier: GPL-3.0-only

import { overlayPositionToGrid } from '../settings/site-behavior';
import type { AppliedTabBehavior } from './applied-tab-behavior';
import { formatSpeed } from './speed';

export const OVERLAY_HOST_TAG = 'osvsc-overlay';
export const OVERLAY_INSET_PX = 8;
export const OVERLAY_MIN_SIZE_PX = 2;
export const OVERLAY_Z_INDEX = '2147483647';

const OVERLAY_CSS = `
:host {
  all: initial;
  position: fixed;
  pointer-events: none;
  z-index: ${OVERLAY_Z_INDEX};
  margin: 0;
  padding: 0;
  display: block;
  box-sizing: border-box;
}
.badge {
  box-sizing: border-box;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.82);
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}
`;

export class VideoOverlay {
  readonly host: HTMLElement;
  readonly badge: HTMLElement;
  private behavior: AppliedTabBehavior | null = null;
  private controlled = false;
  private autoHideExpired = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly resizeObserver: ResizeObserver;

  constructor(
    readonly video: HTMLVideoElement,
    private readonly requestLayout: () => void,
  ) {
    const document = video.ownerDocument;
    this.host = document.createElement(OVERLAY_HOST_TAG);
    this.host.setAttribute('aria-hidden', 'true');
    this.host.style.setProperty('all', 'initial', 'important');
    this.host.style.setProperty('position', 'fixed', 'important');
    this.host.style.setProperty('pointer-events', 'none', 'important');
    this.host.style.setProperty('z-index', OVERLAY_Z_INDEX, 'important');
    this.host.style.setProperty('margin', '0', 'important');
    this.host.style.setProperty('padding', '0', 'important');
    this.host.style.setProperty('visibility', 'hidden', 'important');

    const shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    this.badge = document.createElement('div');
    this.badge.className = 'badge';
    shadow.append(style, this.badge);
    document.documentElement.append(this.host);

    this.resizeObserver = new ResizeObserver(() => {
      this.requestLayout();
    });
    this.resizeObserver.observe(video);
  }

  setBehavior(behavior: AppliedTabBehavior): void {
    this.behavior = behavior;
    this.badge.textContent = formatSpeed(behavior.targetSpeed);
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
    this.resizeObserver.disconnect();
    this.host.remove();
  }

  private isVisible(): boolean {
    return this.behavior != null && this.controlled && this.isRenderable() && !this.autoHideExpired;
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
    if (!this.behavior?.overlayAutoHide) {
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

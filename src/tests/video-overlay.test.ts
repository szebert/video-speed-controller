// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_POSITION } from '../settings/site-behavior';
import {
  OVERLAY_HOST_TAG,
  OVERLAY_INSET_PX,
  OVERLAY_Z_INDEX,
  VideoOverlay,
} from '../core/video-overlay';
import { tabBehavior } from './tab-behavior-fixture';

function sizedVideo(rect = { left: 10, top: 20, width: 200, height: 100 }): HTMLVideoElement {
  const video = document.createElement('video');
  document.body.append(video);
  video.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON() {
        return this;
      },
    }) as DOMRect;
  return video;
}

describe('VideoOverlay', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.querySelectorAll(OVERLAY_HOST_TAG).forEach((node) => node.remove());
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('style');
    vi.useRealTimers();
  });

  it('renders 1.25× after it is controlled', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25));
    overlay.layout();
    expect(overlay.badge.textContent).toBe('1.25×');
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('keeps setBehavior hidden while not controlled', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(3));
    overlay.layout();
    expect(overlay.badge.textContent).toBe('3.00×');
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('places badges with grid anchors and transforms', () => {
    const video = sizedVideo({ left: 10, top: 20, width: 200, height: 100 });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);

    overlay.setBehavior(tabBehavior(1, { overlayPosition: OVERLAY_POSITION.TOP_LEFT }));
    overlay.layout();
    expect(overlay.host.style.left).toBe(`${10 + OVERLAY_INSET_PX}px`);
    expect(overlay.host.style.top).toBe(`${20 + OVERLAY_INSET_PX}px`);
    expect(overlay.host.style.transform).toBe('translate(0, 0)');

    overlay.setBehavior(tabBehavior(1, { overlayPosition: OVERLAY_POSITION.TOP_CENTER }));
    overlay.layout();
    expect(overlay.host.style.left).toBe('110px');
    expect(overlay.host.style.top).toBe(`${20 + OVERLAY_INSET_PX}px`);
    expect(overlay.host.style.transform).toBe('translate(-50%, 0)');

    overlay.setBehavior(tabBehavior(1, { overlayPosition: OVERLAY_POSITION.CENTER }));
    overlay.layout();
    expect(overlay.host.style.left).toBe('110px');
    expect(overlay.host.style.top).toBe('70px');
    expect(overlay.host.style.transform).toBe('translate(-50%, -50%)');

    overlay.setBehavior(tabBehavior(1, { overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT }));
    overlay.layout();
    expect(overlay.host.style.left).toBe(`${210 - OVERLAY_INSET_PX}px`);
    expect(overlay.host.style.top).toBe(`${120 - OVERLAY_INSET_PX}px`);
    expect(overlay.host.style.transform).toBe('translate(-100%, -100%)');
  });

  it('does not intercept pointer input', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => undefined);
    expect(overlay.host.style.pointerEvents).toBe('none');
    expect(overlay.host.style.zIndex).toBe(OVERLAY_Z_INDEX);
  });

  it('does not inherit page typography into the badge', () => {
    document.documentElement.style.fontSize = '48px';
    document.body.style.color = 'rgb(255, 0, 0)';
    document.body.style.lineHeight = '4';
    document.body.style.fontFamily = 'serif';
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25));
    overlay.setControlled(true);
    overlay.layout();
    const badgeStyle = getComputedStyle(overlay.badge);
    expect(badgeStyle.fontSize).not.toBe('48px');
    expect(badgeStyle.color).not.toBe('rgb(255, 0, 0)');
    expect(overlay.host.shadowRoot?.querySelector('style')?.textContent).toContain('all: initial');
  });

  it('stays visible when auto-hide is off', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    vi.advanceTimersByTime(10_000);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('hides after the auto-hide delay and restarts on a later controlled setBehavior', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.setBehavior(tabBehavior(1.5, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('hides immediately on setControlled(false) and cancels the auto-hide timer', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);
    overlay.setBehavior(tabBehavior(3, { overlayAutoHide: true, overlayAutoHideDelayMs: 5_000 }));
    overlay.layout();
    overlay.setControlled(false);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.setBehavior(tabBehavior(2, { overlayAutoHide: true, overlayAutoHideDelayMs: 5_000 }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('hides when the video is disconnected or near-zero size', () => {
    const video = sizedVideo({ left: 0, top: 0, width: 0, height: 0 });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');

    const visible = sizedVideo();
    const shown = new VideoOverlay(visible, () => shown.layout());
    shown.setBehavior(tabBehavior(1.25));
    shown.setControlled(true);
    shown.layout();
    expect(shown.host.style.visibility).toBe('visible');
    visible.remove();
    shown.layout();
    expect(shown.host.style.visibility).toBe('hidden');
  });

  it('destroy removes the host and timers', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);
    overlay.setBehavior(
      tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 1_000 }),
    );
    overlay.destroy();
    expect(document.querySelector(OVERLAY_HOST_TAG)).toBeNull();
    vi.advanceTimersByTime(1_000);
  });
});

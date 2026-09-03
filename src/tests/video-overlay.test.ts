// SPDX-License-Identifier: GPL-3.0-only

import { shadowDOM } from '@react-stately/flags';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_POSITION } from '../settings/site-behavior';
import {
  OVERLAY_HOST_TAG,
  OVERLAY_INSET_PX,
  OVERLAY_Z_INDEX,
  VideoOverlay,
} from '../core/video-overlay';
import overlayCss from '../overlay/overlay.css?inline';
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
    document.head.querySelectorAll('style').forEach((node) => node.remove());
    vi.useRealTimers();
  });

  it('renders 1.25× after it is controlled', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.layout();
    expect(overlay.speedReadout?.textContent).toBe('1.25×');
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('keeps setBehavior hidden while not controlled', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(3, { overlayAutoHide: false }));
    overlay.layout();
    expect(overlay.speedReadout?.textContent).toBe('3.00×');
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('places badges with grid anchors and transforms', () => {
    const video = sizedVideo({ left: 10, top: 20, width: 200, height: 100 });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayPosition: OVERLAY_POSITION.TOP_LEFT }),
    );
    overlay.layout();
    expect(overlay.host.style.left).toBe(`${10 + OVERLAY_INSET_PX}px`);
    expect(overlay.host.style.top).toBe(`${20 + OVERLAY_INSET_PX}px`);
    expect(overlay.host.style.transform).toBe('translate(0, 0)');

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayPosition: OVERLAY_POSITION.TOP_CENTER }),
    );
    overlay.layout();
    expect(overlay.host.style.left).toBe('110px');
    expect(overlay.host.style.top).toBe(`${20 + OVERLAY_INSET_PX}px`);
    expect(overlay.host.style.transform).toBe('translate(-50%, 0)');

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayPosition: OVERLAY_POSITION.CENTER }),
    );
    overlay.layout();
    expect(overlay.host.style.left).toBe('110px');
    expect(overlay.host.style.top).toBe('70px');
    expect(overlay.host.style.transform).toBe('translate(-50%, -50%)');

    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT }),
    );
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

  it('loads overlay CSS as an inline string', () => {
    expect(overlayCss).toContain('all: initial');
    expect(overlayCss).toContain('--background');
  });

  it('does not inherit page typography into the badge', () => {
    document.documentElement.style.fontSize = '48px';
    document.body.style.color = 'rgb(255, 0, 0)';
    document.body.style.lineHeight = '4';
    document.body.style.fontFamily = 'serif';
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const speed = overlay.speedReadout;
    expect(speed).not.toBeNull();
    const speedStyle = getComputedStyle(speed!);
    expect(speedStyle.fontSize).not.toBe('48px');
    expect(speedStyle.color).not.toBe('rgb(255, 0, 0)');
    const sheetText = [...(overlay.host.shadowRoot?.querySelectorAll('style') ?? [])]
      .map((node) => node.textContent)
      .join('');
    expect(
      sheetText.includes('all: initial') ||
        (overlay.host.shadowRoot?.adoptedStyleSheets?.length ?? 0) > 0,
    ).toBeTruthy();
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

  it('stays hidden when overlayVisible is false even if auto-hide is off', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayVisible: false, overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('hides when the video is disconnected or near-zero size', () => {
    const video = sizedVideo({ left: 0, top: 0, width: 0, height: 0 });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');

    const visible = sizedVideo();
    const shown = new VideoOverlay(visible, () => shown.layout());
    shown.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
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
    expect(overlay.host.isConnected).toBe(false);
    expect(overlay.host.shadowRoot?.querySelector('.speed')).toBeNull();
    vi.advanceTimersByTime(1_000);
  });

  it('keeps inline host geometry against hostile page selectors', () => {
    const style = document.createElement('style');
    style.textContent = `${OVERLAY_HOST_TAG} { position: static !important; z-index: 1 !important; }`;
    document.head.append(style);
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.position).toBe('fixed');
    expect(overlay.host.style.zIndex).toBe(OVERLAY_Z_INDEX);
  });

  it('hides at the built-in 2000ms delay and reveals on video move or focus', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(1_999);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(1);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    video.dispatchEvent(new Event('pointermove'));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(2_000);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    video.dispatchEvent(new Event('focus'));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('enables React Aria shadow DOM event targeting', () => {
    expect(shadowDOM()).toBe(true);
  });

  it('restarts auto-hide when plus or minus is pressed', () => {
    vi.useFakeTimers();
    const adjustSpeed = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed });
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    vi.advanceTimersByTime(150);
    const faster = overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    expect(faster).toBeInstanceOf(HTMLButtonElement);
    (faster as HTMLButtonElement).click();
    expect(adjustSpeed).toHaveBeenCalledWith(1);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(150);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(50);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('hides after the idle delay even if a control stays focused', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const faster = overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    expect(faster).toBeInstanceOf(HTMLButtonElement);
    (faster as HTMLButtonElement).focus();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('mounts slower, speed, and faster controls inside the shadow root', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    expect(root?.querySelector('[aria-label="Move overlay"]')?.tagName.toLowerCase()).toBe(
      'button',
    );
    expect(root?.querySelector('[aria-label="Slower"]')?.tagName.toLowerCase()).toBe('button');
    expect(overlay.speedReadout?.tagName.toLowerCase()).not.toBe('button');
    expect(root?.querySelector('[aria-label="Faster"]')?.tagName.toLowerCase()).toBe('button');
    expect(root?.querySelector('[aria-label="Open settings"]')?.tagName.toLowerCase()).toBe(
      'button',
    );
    expect(overlay.host.hasAttribute('aria-hidden')).toBe(false);
  });

  it('hides the position and settings buttons when those settings are off', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1.25, {
        overlayAutoHide: false,
        overlayPositionButton: false,
        overlaySettingsButton: false,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    expect(root?.querySelector('[aria-label="Move overlay"]')).toBeNull();
    expect(root?.querySelector('[aria-label="Open settings"]')).toBeNull();
    expect(root?.querySelector('[aria-label="Slower"]')).toBeInstanceOf(HTMLButtonElement);
    expect(root?.querySelector('[aria-label="Faster"]')).toBeInstanceOf(HTMLButtonElement);
  });

  it('opens a position picker and reports the chosen cell', () => {
    const setOverlayPosition = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      setOverlayPosition,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    expect(root?.querySelector('[aria-label="Bottom right"]')).toBeNull();
    act(() => {
      (root?.querySelector('[aria-label="Move overlay"]') as HTMLButtonElement).click();
    });
    const bottomRight = root?.querySelector('[aria-label="Bottom right"]');
    expect(bottomRight).toBeInstanceOf(HTMLButtonElement);
    act(() => {
      (bottomRight as HTMLButtonElement).click();
    });
    expect(setOverlayPosition).toHaveBeenCalledWith(OVERLAY_POSITION.BOTTOM_RIGHT);
    expect(root?.querySelector('[aria-label="Bottom right"]')).toBeNull();
  });

  it('hides after idle even if the position picker is open, then shows it closed', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    act(() => {
      (root?.querySelector('[aria-label="Move overlay"]') as HTMLButtonElement).click();
    });
    expect(root?.querySelector('.position-picker')).not.toBeNull();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    video.dispatchEvent(new Event('pointermove'));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    expect(root?.querySelector('.position-picker')).toBeNull();
  });

  it('opens settings from the gear button', () => {
    const openSettings = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      openSettings,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const settings = overlay.host.shadowRoot?.querySelector('[aria-label="Open settings"]');
    expect(settings).toBeInstanceOf(HTMLButtonElement);
    (settings as HTMLButtonElement).click();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('disables plus at max speed and minus at min speed', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(4, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const faster = overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    const slower = overlay.host.shadowRoot?.querySelector('[aria-label="Slower"]');
    expect(faster).toBeInstanceOf(HTMLButtonElement);
    expect(slower).toBeInstanceOf(HTMLButtonElement);
    expect((faster as HTMLButtonElement).disabled).toBe(true);
    expect((slower as HTMLButtonElement).disabled).toBe(false);

    overlay.setBehavior(tabBehavior(0.25, { overlayAutoHide: false }));
    overlay.layout();
    const fasterAtMin = overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    const slowerAtMin = overlay.host.shadowRoot?.querySelector('[aria-label="Slower"]');
    expect((fasterAtMin as HTMLButtonElement).disabled).toBe(false);
    expect((slowerAtMin as HTMLButtonElement).disabled).toBe(true);
  });

  it('reveals when a pointer moves or presses over the video box', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 1, clientY: 1 }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 30 }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 50, clientY: 40 }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('does not reveal on pointerenter or pointerleave after idle hide', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    video.dispatchEvent(new Event('pointerleave'));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    video.dispatchEvent(new Event('pointerenter'));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    video.dispatchEvent(new Event('pointermove'));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('hides after idle even if the pointer stays over the controls', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const controls = overlay.host.shadowRoot?.querySelector('.controls');
    expect(controls).toBeInstanceOf(HTMLElement);
    controls?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('hides immediately on surrender', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 5_000 }),
    );
    overlay.setControlled(true);
    overlay.layout();
    overlay.setControlled(false);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('starts a fresh auto-hide timer on retake after surrender', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    overlay.setControlled(false);
    overlay.layout();
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });
});

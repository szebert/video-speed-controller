// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_HOTKEYS, builtInEffectiveHotkeys } from '../settings/hotkey-binding';
import { OVERLAY_POSITION } from '../settings/site-behavior';
import {
  HOTKEY_FLASH_HOST_TAG,
  OVERLAY_HOST_TAG,
  OVERLAY_INSET_PX,
  OVERLAY_Z_INDEX,
  VideoOverlay,
} from '../core/video-overlay';
import { OverlayView } from '../overlay/overlay-view';
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
    document.documentElement
      .querySelectorAll(HOTKEY_FLASH_HOST_TAG)
      .forEach((node) => node.remove());
    document.documentElement.removeAttribute('style');
    document.body.removeAttribute('style');
    document.head.querySelectorAll('style').forEach((node) => node.remove());
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it('reads the video rect once when layout shows the overlay', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => undefined);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    const getRect = vi.spyOn(video, 'getBoundingClientRect');
    overlay.layout();
    expect(getRect).toHaveBeenCalledTimes(1);
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('does not read the video rect when a cheap hide condition already applies', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => undefined);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    const getRect = vi.spyOn(video, 'getBoundingClientRect');
    overlay.layout();
    expect(getRect).not.toHaveBeenCalled();
    expect(overlay.host.style.visibility).toBe('hidden');

    overlay.setControlled(true);
    overlay.setBehavior(tabBehavior(1.25, { overlayVisible: false, overlayAutoHide: false }));
    getRect.mockClear();
    overlay.layout();
    expect(getRect).not.toHaveBeenCalled();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('does not read geometry from setBehavior or syncView before layout', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => undefined);
    overlay.setControlled(true);
    const getRect = vi.spyOn(video, 'getBoundingClientRect');
    const update = vi.spyOn(OverlayView.prototype, 'update');
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    expect(getRect).not.toHaveBeenCalled();
    expect(update.mock.calls.at(-1)?.[0]?.visible).toBe(false);
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('does not treat a cheap-pass as visible before a successful layout', () => {
    const video = sizedVideo({ left: 0, top: 0, width: 0, height: 0 });
    const update = vi.spyOn(OverlayView.prototype, 'update');
    const overlay = new VideoOverlay(video, () => undefined);
    overlay.setControlled(true);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    expect(update.mock.calls.at(-1)?.[0]?.visible).toBe(false);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(update.mock.calls.at(-1)?.[0]?.visible).toBe(false);
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

  it('updates the host transform after auto-hide has already expired', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.transform).toBe('translate(-50%, 0)');
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');

    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: true,
        overlayAutoHideDelayMs: 200,
        overlayPosition: OVERLAY_POSITION.BOTTOM_RIGHT,
      }),
    );
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(overlay.host.style.transform).toBe('translate(-100%, -100%)');
    overlay.destroy();
  });

  it('applies overlay opacity to the controls shell', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, overlayOpacity: 40 }));
    overlay.setControlled(true);
    overlay.layout();
    const shell = overlay.host.shadowRoot?.querySelector('.controls-shell');
    expect(shell).toBeInstanceOf(HTMLElement);
    expect((shell as HTMLElement).style.opacity).toBe('0.4');

    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, overlayOpacity: 1 }));
    overlay.layout();
    expect((shell as HTMLElement).style.opacity).toBe('0.01');

    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, overlayOpacity: 100 }));
    overlay.layout();
    expect((shell as HTMLElement).style.opacity).toBe('1');
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
    expect(overlay.host.style.userSelect).toBe('none');
    expect(overlayCss).toContain('user-select: none');
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

  it('hides after the auto-hide delay and stays hidden on a later speed APPLY', () => {
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
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('does not restart the auto-hide timer when only target speed changes', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.layout();
    vi.advanceTimersByTime(150);
    overlay.setBehavior(tabBehavior(1.5, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(50);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('reveals from a later overlay auto-hide APPLY', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setControlled(true);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.layout();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
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

  it('hides at the built-in 2000ms delay and reveals on pointer activity, not video focus', () => {
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
    video.dispatchEvent(new Event('focus'));
    video.dispatchEvent(new Event('focusin'));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.notifyActivity();
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('hides after a pointer click on Faster even if the pointer stays over the overlay', () => {
    vi.useFakeTimers();
    const adjustSpeed = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), { adjustSpeed });
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const faster = overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    const shell = overlay.host.shadowRoot?.querySelector('.controls-shell');
    expect(faster).toBeInstanceOf(HTMLButtonElement);
    expect(shell).toBeInstanceOf(HTMLElement);
    (faster as HTMLButtonElement).focus();
    faster?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(adjustSpeed).toHaveBeenCalledWith(1, video);
    expect(overlay.host.shadowRoot?.activeElement).not.toBe(faster);
    shell?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
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
    expect(adjustSpeed).toHaveBeenCalledWith(1, video);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(150);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(50);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('stays visible while a control is focused', () => {
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
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('mounts slower, speed, and faster controls inside the shadow root', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    const controls = [...(root?.querySelector('.controls')?.children ?? [])];
    expect(controls.map((node) => node.getAttribute('aria-label') ?? node.className)).toEqual([
      'Move overlay',
      'Slower',
      'speed',
      'Faster',
      'Open settings',
    ]);
    expect(overlay.speedReadout?.tagName.toLowerCase()).not.toBe('button');
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
    (root?.querySelector('[aria-label="Move overlay"]') as HTMLButtonElement).click();
    const bottomRight = root?.querySelector('[aria-label="Bottom right"]');
    expect(bottomRight).toBeInstanceOf(HTMLButtonElement);
    (bottomRight as HTMLButtonElement).click();
    expect(setOverlayPosition).toHaveBeenCalledWith(OVERLAY_POSITION.BOTTOM_RIGHT);
    expect(root?.querySelector('[aria-label="Bottom right"]')).toBeNull();
  });

  it('hides after opening the position picker when hover hold is off', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    const move = root?.querySelector('[aria-label="Move overlay"]');
    expect(move).toBeInstanceOf(HTMLButtonElement);
    (move as HTMLButtonElement).click();
    expect(root?.querySelector('.position-picker')).not.toBeNull();
    root
      ?.querySelector('.controls-shell')
      ?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(root?.querySelector('.position-picker')).toBeNull();
  });

  it('keeps the same Faster button across hide and reveal', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const faster = overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    expect(faster).toBeInstanceOf(HTMLButtonElement);
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]')).toBe(faster);
    overlay.notifyActivity();
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    expect(overlay.host.shadowRoot?.querySelector('[aria-label="Faster"]')).toBe(faster);
  });

  it('does not keep the overlay visible after closing the position picker', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    const move = root?.querySelector('[aria-label="Move overlay"]');
    expect(move).toBeInstanceOf(HTMLButtonElement);
    (move as HTMLButtonElement).click();
    expect(root?.querySelector('.position-picker')).not.toBeNull();
    (move as HTMLButtonElement).click();
    expect(root?.querySelector('.position-picker')).toBeNull();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('stays visible while the pointer is over the overlay when hover hold is on', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1.25, {
        overlayAutoHide: true,
        overlayHoverHold: true,
        overlayAutoHideDelayMs: 200,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    const shell = overlay.host.shadowRoot?.querySelector('.controls-shell');
    expect(shell).toBeInstanceOf(HTMLElement);
    shell?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('stays visible while the pointer is over the position picker when hover hold is on', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1.25, {
        overlayAutoHide: true,
        overlayHoverHold: true,
        overlayAutoHideDelayMs: 200,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    (root?.querySelector('[aria-label="Move overlay"]') as HTMLButtonElement).click();
    const picker = root?.querySelector('.position-picker');
    const shell = root?.querySelector('.controls-shell');
    expect(picker).toBeInstanceOf(HTMLElement);
    expect(shell).toBeInstanceOf(HTMLElement);
    shell?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
  });

  it('hides after idle while the pointer is over the overlay when hover hold is off', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1.25, {
        overlayAutoHide: true,
        overlayHoverHold: false,
        overlayAutoHideDelayMs: 200,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    const shell = overlay.host.shadowRoot?.querySelector('.controls-shell');
    expect(shell).toBeInstanceOf(HTMLElement);
    shell?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('hides after retake when interaction ended during surrender', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    const shell = root?.querySelector('.controls-shell');
    expect(shell).toBeInstanceOf(HTMLElement);
    shell?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    overlay.setControlled(false);
    overlay.layout();
    shell?.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
    overlay.setControlled(true);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });

  it('closes the picker when the position button is hidden', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    (root?.querySelector('[aria-label="Move overlay"]') as HTMLButtonElement).click();
    expect(root?.querySelector('.position-picker')).not.toBeNull();
    overlay.setBehavior(
      tabBehavior(1.25, { overlayAutoHide: false, overlayPositionButton: false }),
    );
    overlay.layout();
    expect(root?.querySelector('.position-picker')).toBeNull();
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    overlay.layout();
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

  it('reveals from notifyActivity without scheduling layout itself', () => {
    vi.useFakeTimers();
    const requestLayout = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, requestLayout);
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    requestLayout.mockClear();
    overlay.notifyActivity();
    expect(requestLayout).not.toHaveBeenCalled();
    expect(overlay.host.style.visibility).toBe('hidden');
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
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.notifyActivity();
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');
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

  it('keeps two overlays isolated and leaves B intact when A is destroyed', () => {
    const videoA = sizedVideo({ left: 10, top: 20, width: 200, height: 100 });
    const videoB = sizedVideo({ left: 300, top: 20, width: 200, height: 100 });
    const overlayA = new VideoOverlay(videoA, () => overlayA.layout());
    const overlayB = new VideoOverlay(videoB, () => overlayB.layout());
    const behavior = tabBehavior(1.25, { overlayAutoHide: false });
    overlayA.setBehavior(behavior);
    overlayB.setBehavior(behavior);
    overlayA.setControlled(true);
    overlayB.setControlled(true);
    overlayA.layout();
    overlayB.layout();

    expect(document.querySelectorAll(OVERLAY_HOST_TAG)).toHaveLength(2);
    expect(overlayA.host).not.toBe(overlayB.host);
    expect(overlayA.speedReadout).not.toBe(overlayB.speedReadout);
    expect(overlayA.speedReadout?.textContent).toBe('1.25×');
    expect(overlayB.speedReadout?.textContent).toBe('1.25×');
    expect(overlayA.host.style.visibility).toBe('visible');
    expect(overlayB.host.style.visibility).toBe('visible');

    const fasterA = overlayA.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    const fasterB = overlayB.host.shadowRoot?.querySelector('[aria-label="Faster"]');
    expect(fasterA).toBeInstanceOf(HTMLButtonElement);
    expect(fasterB).toBeInstanceOf(HTMLButtonElement);
    (fasterA as HTMLButtonElement).click();
    expect(overlayB.host).toBe(document.querySelectorAll(OVERLAY_HOST_TAG)[1]);
    expect(overlayB.host.style.visibility).toBe('visible');
    expect(overlayB.speedReadout?.textContent).toBe('1.25×');

    const moveA = overlayA.host.shadowRoot?.querySelector('[aria-label="Move overlay"]');
    const moveB = overlayB.host.shadowRoot?.querySelector('[aria-label="Move overlay"]');
    expect(moveA).toBeInstanceOf(HTMLButtonElement);
    expect(moveB).toBeInstanceOf(HTMLButtonElement);
    (moveA as HTMLButtonElement).click();
    expect(overlayA.host.shadowRoot?.querySelector('.position-picker')).not.toBeNull();
    expect(overlayB.host.shadowRoot?.querySelector('.position-picker')).toBeNull();
    (moveB as HTMLButtonElement).click();
    expect(overlayA.host.shadowRoot?.querySelector('.position-picker')).not.toBeNull();
    expect(overlayB.host.shadowRoot?.querySelector('.position-picker')).not.toBeNull();

    overlayA.setControlled(false);
    overlayA.layout();
    expect(overlayA.host.style.visibility).toBe('hidden');
    expect(overlayB.host.style.visibility).toBe('visible');
    expect(overlayB.host.shadowRoot?.querySelector('.position-picker')).not.toBeNull();

    overlayA.destroy();
    expect(overlayA.host.isConnected).toBe(false);
    expect(overlayB.host.isConnected).toBe(true);
    expect(overlayB.speedReadout?.textContent).toBe('1.25×');
    expect(overlayB.host.style.visibility).toBe('visible');
  });

  it('detaches overlay listeners on destroy and does not accumulate them', () => {
    const requestLayout = vi.fn();
    const video = sizedVideo();
    const first = new VideoOverlay(video, requestLayout);
    first.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }));
    first.setControlled(true);
    first.layout();
    requestLayout.mockClear();
    first.destroy();
    expect(document.querySelector(OVERLAY_HOST_TAG)).toBeNull();
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 30 }));
    video.dispatchEvent(new Event('pointermove'));
    video.dispatchEvent(new Event('focus'));
    expect(requestLayout).not.toHaveBeenCalled();

    for (let index = 0; index < 8; index += 1) {
      const overlay = new VideoOverlay(video, requestLayout);
      overlay.destroy();
    }
    expect(document.querySelectorAll(OVERLAY_HOST_TAG)).toHaveLength(0);
    requestLayout.mockClear();
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 30 }));
    expect(requestLayout).not.toHaveBeenCalled();
  });

  it('shows [ / ] captions and aria-keyshortcuts on −/+ only when those actions are bound', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }), builtInEffectiveHotkeys());
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    const slower = root?.querySelector('[aria-label="Slower"]');
    const faster = root?.querySelector('[aria-label="Faster"]');
    expect(slower?.getAttribute('aria-keyshortcuts')).toBe('[');
    expect(faster?.getAttribute('aria-keyshortcuts')).toBe(']');
    expect(slower?.querySelector('.hotkey-hint')?.textContent).toBe('[');
    expect(faster?.querySelector('.hotkey-hint')?.textContent).toBe(']');
    expect(slower?.querySelector('.hotkey-hint')?.tagName).toBe('KBD');
    expect(slower?.querySelector('.adjust-glyph')?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(slower?.querySelector('.adjust-glyph')?.nextElementSibling?.className).toBe(
      'hotkey-hint',
    );
    expect(overlayCss).toContain('flex-direction: row');
    expect(overlayCss).toContain('height: 15px');
    expect(overlay.speedReadout?.getAttribute('aria-keyshortcuts')).toBeNull();
    expect(overlay.speedReadout?.querySelector('.hotkey-hint')).toBeNull();

    overlay.setBehavior(
      tabBehavior(1.25, { overlayAutoHide: false, overlayHotkeyHints: false }),
      builtInEffectiveHotkeys(),
    );
    expect(slower?.getAttribute('aria-keyshortcuts')).toBe('[');
    expect(faster?.getAttribute('aria-keyshortcuts')).toBe(']');
    expect(slower?.querySelector('.hotkey-hint')).toBeNull();
    expect(faster?.querySelector('.hotkey-hint')).toBeNull();

    overlay.setBehavior(
      tabBehavior(1.25, { overlayAutoHide: false, overlayHotkeyHints: true }),
      builtInEffectiveHotkeys(),
    );
    expect(slower?.querySelectorAll('.hotkey-hint')).toHaveLength(1);
    expect(faster?.querySelectorAll('.hotkey-hint')).toHaveLength(1);
    expect(slower?.querySelector('.hotkey-hint')?.textContent).toBe('[');
    expect(faster?.querySelector('.hotkey-hint')?.textContent).toBe(']');

    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }), {
      ...builtInEffectiveHotkeys(),
      decreaseSpeed: {
        code: 'BracketLeft',
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
      },
    });
    const chord = root?.querySelector('[aria-label="Slower"]')?.querySelector('.hotkey-hint');
    expect(chord?.textContent?.includes('+')).toBe(false);
    expect(chord?.textContent?.endsWith('[')).toBe(true);
    expect(chord?.textContent).toContain('\u2009');
    expect(chord?.childElementCount).toBe(0);

    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false }), {
      ...builtInEffectiveHotkeys(),
      decreaseSpeed: null,
      increaseSpeed: null,
    });
    expect(
      root?.querySelector('[aria-label="Slower"]')?.getAttribute('aria-keyshortcuts'),
    ).toBeNull();
    expect(root?.querySelector('[aria-label="Faster"]')?.querySelector('.hotkey-hint')).toBeNull();
    expect(overlay.speedReadout?.querySelector('.hotkey-hint')).toBeNull();
  });

  it('shows a replaceable flash between top-center and center', () => {
    vi.useFakeTimers();
    const video = sizedVideo({ left: 10, top: 20, width: 200, height: 100 });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1, { overlayAutoHide: false, overlayVisible: false, flashDelayMs: 200 }),
    );
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    overlay.layout();
    const host = document.querySelector(HOTKEY_FLASH_HOST_TAG);
    expect(host).toBeInstanceOf(HTMLElement);
    expect((host as HTMLElement).style.visibility).toBe('visible');
    expect((host as HTMLElement).style.left).toBe('110px');
    expect((host as HTMLElement).style.top).toBe('45px');
    expect((host as HTMLElement).style.transform).toBe('translate(-50%, -50%)');
    const pill = host?.shadowRoot?.querySelector('.hotkey-flash');
    expect(pill?.textContent).toBe('1.25× (+0.25×)]');
    expect(pill?.querySelector('.hotkey-hint')?.textContent).toBe(']');
    expect((host as HTMLElement).style.userSelect).toBe('none');
    expect((pill as HTMLElement).style.opacity).toBe('0.7');

    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1.25,
      targetSpeed: 1.5,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    expect(document.querySelectorAll(HOTKEY_FLASH_HOST_TAG)).toHaveLength(1);
    expect(host?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent).toBe(
      '1.50× (+0.25×)',
    );
    vi.advanceTimersByTime(199);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('omits a zero speed delta when a hotkey is already at the limit', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(4, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 4,
      targetSpeed: 4,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    overlay.layout();
    expect(
      document
        .querySelector(HOTKEY_FLASH_HOST_TAG)
        ?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent,
    ).toBe('4.00×');
  });

  it('keeps the overlay hidden when a hotkey APPLY flashes', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.layout();
    vi.advanceTimersByTime(200);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: true, overlayAutoHideDelayMs: 200 }));
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)?.shadowRoot?.textContent).toContain(
      '1.25× (+0.25×)',
    );
  });

  it('keeps a held flash until release, then uses the auto-hide delay', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, flashDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash(
      {
        kind: 'navigation',
        label: 'Fast forward',
        detail: '3.00×',
        binding: BUILT_IN_HOTKEYS.increaseSpeed,
      },
      { hold: true },
    );
    overlay.layout();
    vi.advanceTimersByTime(5_000);
    const host = document.querySelector(HOTKEY_FLASH_HOST_TAG);
    expect(host?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent).toBe(
      'Fast forward 3.00×',
    );
    overlay.releaseHeldHotkeyFlash();
    vi.advanceTimersByTime(199);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBe(host);
    vi.advanceTimersByTime(1);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('does not restart a timed flash when releaseHeldHotkeyFlash is called', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, flashDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    overlay.releaseHeldHotkeyFlash();
    vi.advanceTimersByTime(200);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('lets a later timed flash replace a held flash', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, flashDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash(
      {
        kind: 'navigation',
        label: 'Fast forward',
        detail: '3.00×',
        binding: BUILT_IN_HOTKEYS.increaseSpeed,
      },
      { hold: true },
    );
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    vi.advanceTimersByTime(199);
    expect(
      document
        .querySelector(HOTKEY_FLASH_HOST_TAG)
        ?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent,
    ).toBe('1.25× (+0.25×)');
    vi.advanceTimersByTime(1);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('does not let a stale flash hide timer remove a newer pulse', () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => {});
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, flashDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, flashDelayMs: 5_000 }));
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1.25,
      targetSpeed: 1.5,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    const host = document.querySelector(HOTKEY_FLASH_HOST_TAG);
    expect(host?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent).toBe(
      '1.50× (+0.25×)',
    );
    vi.advanceTimersByTime(200);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBe(host);
    expect(host?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent).toBe(
      '1.50× (+0.25×)',
    );
  });

  it('uses hotkey flash opacity and ignores overlay opacity', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlayOpacity: 40,
        flashOpacity: 20,
      }),
    );
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    const pill = document
      .querySelector(HOTKEY_FLASH_HOST_TAG)
      ?.shadowRoot?.querySelector('.hotkey-flash');
    expect(pill).toBeInstanceOf(HTMLElement);
    expect((pill as HTMLElement).style.opacity).toBe('0.2');
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlayOpacity: 100,
        flashOpacity: 55,
      }),
    );
    expect((pill as HTMLElement).style.opacity).toBe('0.55');
  });

  it('hides the flash immediately when the toggle turns off and ignores a later delay APPLY', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, flashDelayMs: 200 }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).not.toBeNull();
    overlay.setBehavior(tabBehavior(1.25, { overlayAutoHide: false, flashDelayMs: 5_000 }));
    vi.advanceTimersByTime(200);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();

    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1.25,
      targetSpeed: 1.5,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    overlay.setBehavior(tabBehavior(1.5, { overlayAutoHide: false, hotkeyFlash: false }));
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('shows a button flash only when that toggle is on', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, buttonFlash: false }));
    overlay.setControlled(true);
    overlay.showButtonFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();

    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, buttonFlash: true }));
    overlay.showButtonFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
    });
    expect(
      document
        .querySelector(HOTKEY_FLASH_HOST_TAG)
        ?.shadowRoot?.querySelector('.hotkey-flash-label')?.textContent,
    ).toBe('1.25× (+0.25×)');
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, buttonFlash: false }));
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('recreates a flash host after setControlled(false) removes it', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).not.toBeNull();
    overlay.setControlled(false);
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
    overlay.setControlled(true);
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1.25,
      targetSpeed: 1.5,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).not.toBeNull();
    overlay.destroy();
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('does not flash when the overlay is not controlled', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.showHotkeyFlash({
      kind: 'speed',
      previousTargetSpeed: 1,
      targetSpeed: 1.25,
      binding: BUILT_IN_HOTKEYS.increaseSpeed,
    });
    expect(document.querySelector(HOTKEY_FLASH_HOST_TAG)).toBeNull();
  });

  it('shows the navigation row as a second row only when it is enabled', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    expect(root?.querySelector('.controls-nav')).toBeNull();

    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.layout();
    const shell = root?.querySelector('.controls-shell');
    expect([...(shell?.children ?? [])].map((node) => node.className)).toEqual([
      'controls',
      'controls controls-nav',
    ]);
    expect(
      [...(root?.querySelectorAll('.controls-nav .control-nav') ?? [])].map((node) =>
        node.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Jump to start',
      'Rewind',
      'Skip back',
      'Play',
      'Skip forward',
      'Fast forward',
      'Jump to end',
    ]);

    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
    overlay.layout();
    expect(root?.querySelector('.controls-nav')).toBeNull();
  });

  it('reports one-shot navigation presses against its own video', () => {
    const mediaAction = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    (root?.querySelector('[aria-label="Skip forward"]') as HTMLButtonElement).click();
    expect(mediaAction).toHaveBeenCalledWith('skipForward', 'press', video, overlay);
    (root?.querySelector('[aria-label="Jump to start"]') as HTMLButtonElement).click();
    expect(mediaAction).toHaveBeenLastCalledWith('jumpToStart', 'press', video, overlay);
  });

  it('starts rewind and fast forward on pointer down and ends them on release', () => {
    const mediaAction = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction,
    });
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlayNavigationBar: true,
        overlayHotkeyHints: true,
      }),
      {
        ...builtInEffectiveHotkeys(),
        rewind: { code: 'KeyH', ctrl: false, alt: false, shift: false, meta: false },
      },
    );
    overlay.setControlled(true);
    overlay.layout();
    const rewind = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Rewind"]',
    ) as HTMLButtonElement;
    expect(rewind.disabled).toBe(false);
    expect(rewind.getAttribute('aria-keyshortcuts')).toBe('H');
    rewind.setPointerCapture = () => undefined;
    rewind.dispatchEvent(new Event('pointerdown'));
    expect(mediaAction).toHaveBeenCalledWith('rewind', 'start', video, expect.any(Object));
    const rewindOwner = mediaAction.mock.calls[0]?.[3];
    expect(rewindOwner).not.toBe(overlay);
    rewind.dispatchEvent(new Event('pointerdown'));
    expect(mediaAction).toHaveBeenCalledTimes(1);

    rewind.dispatchEvent(new Event('pointerup'));
    expect(mediaAction).toHaveBeenLastCalledWith('rewind', 'end', video, rewindOwner);
    rewind.dispatchEvent(new Event('pointerup'));
    expect(mediaAction).toHaveBeenCalledTimes(2);

    mediaAction.mockClear();
    const button = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Fast forward"]',
    ) as HTMLButtonElement;
    button.setPointerCapture = () => undefined;
    button.dispatchEvent(new Event('pointerdown'));
    expect(mediaAction).toHaveBeenCalledWith('fastForward', 'start', video, expect.any(Object));
    const owner = mediaAction.mock.calls[0]?.[3];
    expect(owner).not.toBe(overlay);
    button.dispatchEvent(new Event('pointerdown'));
    expect(mediaAction).toHaveBeenCalledTimes(1);

    button.dispatchEvent(new Event('pointerup'));
    expect(mediaAction).toHaveBeenLastCalledWith('fastForward', 'end', video, owner);
    button.dispatchEvent(new Event('pointerup'));
    expect(mediaAction).toHaveBeenCalledTimes(2);
  });

  it('keeps a pointer hold live through lost capture and blur until pointerup', () => {
    const mediaAction = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const rewind = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Rewind"]',
    ) as HTMLButtonElement;
    rewind.setPointerCapture = () => undefined;
    rewind.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, buttons: 1 }));
    expect(mediaAction).toHaveBeenCalledTimes(1);
    rewind.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1, buttons: 0 }));
    rewind.dispatchEvent(new Event('blur'));
    expect(mediaAction).toHaveBeenCalledTimes(1);
    rewind.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, buttons: 0 }));
    expect(mediaAction).toHaveBeenLastCalledWith('rewind', 'end', video, expect.any(Object));
  });

  it('keeps the first pointer id when a second finger hits the same hold', () => {
    const mediaAction = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const rewind = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Rewind"]',
    ) as HTMLButtonElement;
    rewind.setPointerCapture = () => undefined;
    rewind.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, buttons: 1 }));
    const owner = mediaAction.mock.calls[0]?.[3];
    rewind.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 2, buttons: 1 }));
    expect(mediaAction).toHaveBeenCalledTimes(1);
    rewind.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, buttons: 0 }));
    expect(mediaAction.mock.calls).toEqual([
      ['rewind', 'start', video, owner],
      ['rewind', 'end', video, owner],
    ]);
    overlay.destroy();
  });

  it('gives overlapping rewind and fast forward holds distinct gesture owners', () => {
    const mediaAction = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const rewind = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Rewind"]',
    ) as HTMLButtonElement;
    const fastForward = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Fast forward"]',
    ) as HTMLButtonElement;
    rewind.setPointerCapture = () => undefined;
    fastForward.setPointerCapture = () => undefined;
    rewind.dispatchEvent(new Event('pointerdown'));
    fastForward.dispatchEvent(new Event('pointerdown'));
    const rewindOwner = mediaAction.mock.calls[0]?.[3];
    const fastForwardOwner = mediaAction.mock.calls[1]?.[3];
    expect(rewindOwner).not.toBe(fastForwardOwner);
    rewind.dispatchEvent(new Event('pointerup'));
    expect(mediaAction.mock.calls[2]).toEqual(['rewind', 'end', video, rewindOwner]);
    fastForward.dispatchEvent(new Event('pointerup'));
    expect(mediaAction.mock.calls[3]).toEqual(['fastForward', 'end', video, fastForwardOwner]);
  });

  it('holds rewind and fast forward from the keyboard and never fires a click', () => {
    const mediaAction = vi.fn();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction,
    });
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    for (const label of ['Rewind', 'Fast forward'] as const) {
      mediaAction.mockClear();
      const button = overlay.host.shadowRoot?.querySelector(
        `[aria-label="${label}"]`,
      ) as HTMLButtonElement;
      button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', cancelable: true }));
      button.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', repeat: true, cancelable: true }),
      );
      expect(mediaAction).toHaveBeenCalledTimes(1);
      const action = label === 'Rewind' ? 'rewind' : 'fastForward';
      expect(mediaAction).toHaveBeenCalledWith(action, 'start', video, expect.any(Object));
      const owner = mediaAction.mock.calls[0]?.[3];
      button.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', cancelable: true }));
      expect(mediaAction).toHaveBeenLastCalledWith(action, 'end', video, owner);

      mediaAction.mockClear();
      button.click();
      expect(mediaAction).not.toHaveBeenCalled();
    }
  });

  it('ends a live hold when the row, overlay, or view goes away', () => {
    const navigationOn = tabBehavior(1, {
      overlayAutoHide: false,
      overlayNavigationBar: true,
    });
    for (const label of ['Fast forward', 'Rewind'] as const) {
      const mediaAction = vi.fn();
      const video = sizedVideo();
      const overlay = new VideoOverlay(video, () => overlay.layout(), {
        adjustSpeed() {},
        mediaAction,
      });
      overlay.setBehavior(navigationOn);
      overlay.setControlled(true);
      overlay.layout();
      const hold = (): void => {
        const button = overlay.host.shadowRoot?.querySelector(
          `[aria-label="${label}"]`,
        ) as HTMLButtonElement;
        button.setPointerCapture = () => undefined;
        button.dispatchEvent(new Event('pointerdown'));
      };
      const phases = (): string[] => mediaAction.mock.calls.map(([, phase]) => phase);

      hold();
      overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false }));
      expect(phases()).toEqual(['start', 'end']);

      mediaAction.mockClear();
      overlay.setBehavior(navigationOn);
      hold();
      overlay.setBehavior(
        tabBehavior(1, {
          overlayAutoHide: false,
          overlayNavigationBar: true,
          overlayVisible: false,
        }),
      );
      expect(phases()).toEqual(['start', 'end']);

      mediaAction.mockClear();
      overlay.setBehavior(navigationOn);
      overlay.layout();
      hold();
      overlay.destroy();
      expect(phases()).toEqual(['start', 'end']);
    }
  });

  it('tracks the play and pause state of its own video', () => {
    const video = sizedVideo();
    let paused = true;
    Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(tabBehavior(1, { overlayAutoHide: false, overlayNavigationBar: true }));
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    expect(root?.querySelector('[aria-label="Play"]')).toBeInstanceOf(HTMLButtonElement);

    paused = false;
    video.dispatchEvent(new Event('play'));
    expect(root?.querySelector('[aria-label="Play"]')).toBeNull();
    expect(root?.querySelector('[aria-label="Pause"]')).toBeInstanceOf(HTMLButtonElement);

    paused = true;
    video.dispatchEvent(new Event('pause'));
    expect(root?.querySelector('[aria-label="Play"]')).toBeInstanceOf(HTMLButtonElement);
  });

  it('shows navigation hotkey hints only for bound actions', () => {
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout());
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: false,
        overlayNavigationBar: true,
        overlayHotkeyHints: true,
      }),
      {
        ...builtInEffectiveHotkeys(),
        skipForward: { code: 'KeyK', ctrl: false, alt: false, shift: false, meta: false },
      },
    );
    overlay.setControlled(true);
    overlay.layout();
    const root = overlay.host.shadowRoot;
    const skipForward = root?.querySelector('[aria-label="Skip forward"]') as HTMLButtonElement;
    const skipBack = root?.querySelector('[aria-label="Skip back"]') as HTMLButtonElement;
    expect(skipForward.querySelector('.hotkey-hint')?.textContent).toBe('K');
    expect(skipForward.getAttribute('aria-keyshortcuts')).toBe('K');
    expect(skipBack.querySelector('.hotkey-hint')).toBeNull();
    expect(skipBack.hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('keeps the overlay visible while a fast forward hold is live', () => {
    vi.useFakeTimers();
    const video = sizedVideo();
    const overlay = new VideoOverlay(video, () => overlay.layout(), {
      adjustSpeed() {},
      mediaAction() {},
    });
    overlay.setBehavior(
      tabBehavior(1, {
        overlayAutoHide: true,
        overlayAutoHideDelayMs: 200,
        overlayNavigationBar: true,
      }),
    );
    overlay.setControlled(true);
    overlay.layout();
    const button = overlay.host.shadowRoot?.querySelector(
      '[aria-label="Fast forward"]',
    ) as HTMLButtonElement;
    button.setPointerCapture = () => undefined;
    button.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(400);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('visible');

    button.dispatchEvent(new Event('pointerup'));
    vi.advanceTimersByTime(400);
    overlay.layout();
    expect(overlay.host.style.visibility).toBe('hidden');
  });
});
